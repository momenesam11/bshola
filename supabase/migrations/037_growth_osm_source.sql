-- ============================================================
-- GROWTH ENGINE v6 — OpenStreetMap as its own lead source
-- ============================================================
-- Clinics pulled from OpenStreetMap were saved as source 'import' (with
-- source_detail 'OpenStreetMap…'), so the source filter couldn't tell them
-- apart from a hand-uploaded sheet. They get their own source now.
--
-- Rollback: supabase/rollbacks/037_growth_osm_source_down.sql.

ALTER TABLE growth_leads DROP CONSTRAINT IF EXISTS growth_leads_source_check;
ALTER TABLE growth_leads ADD CONSTRAINT growth_leads_source_check CHECK (source IN (
                         'signup_incomplete','organic_signup','contact_form','loss_calculator',
                         'referral','booking_footer','partner','google_ads',
                         'google_maps_manual','google_maps_api','openstreetmap','facebook_group','import','manual'));

UPDATE growth_leads SET source = 'openstreetmap'
WHERE source = 'import' AND source_detail LIKE 'OpenStreetMap%';

CREATE OR REPLACE FUNCTION growth_import_leads(p_rows jsonb, p_source text DEFAULT 'import')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r         jsonb;
  v_phone   text;
  v_place   text;
  v_name    text;
  v_area    text;
  v_id      uuid;
  inserted  int := 0;
  skipped   int := 0;
  invalid   int := 0;
  ids       uuid[] := '{}';
BEGIN
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 1000 THEN
    RAISE EXCEPTION 'p_rows must be an array of at most 1000 rows';
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_name  := left(btrim(coalesce(r->>'name', '')), 160);
    v_phone := growth_normalize_phone(r->>'phone');
    v_place := nullif(btrim(coalesce(r->>'google_place_id', '')), '');
    v_area  := nullif(btrim(coalesce(r->>'area', '')), '');
    IF v_name = '' THEN invalid := invalid + 1; CONTINUE; END IF;

    IF EXISTS (
      SELECT 1 FROM growth_leads l
      WHERE (v_phone IS NOT NULL AND l.phone = v_phone)
         OR (v_place IS NOT NULL AND l.google_place_id = v_place)
         OR (lower(l.name) = lower(v_name) AND coalesce(l.area, '') = coalesce(v_area, '') AND v_area IS NOT NULL)
    ) THEN
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO growth_leads (
      name, category, specialty, contact_person, city, area, address, phone, phone_raw, email,
      website, instagram, facebook, google_maps_url, google_place_id, google_rating, google_reviews_count,
      has_online_booking, source, source_detail, notes, signals
    ) VALUES (
      v_name,
      CASE WHEN r->>'category' IN ('dental','derma','clinic','salon','gym','education','other') THEN r->>'category' ELSE 'clinic' END,
      nullif(r->>'specialty', ''), nullif(r->>'contact_person', ''), nullif(r->>'city', ''), v_area,
      nullif(r->>'address', ''), v_phone, nullif(left(r->>'phone', 40), ''), nullif(r->>'email', ''),
      nullif(r->>'website', ''), nullif(r->>'instagram', ''), nullif(r->>'facebook', ''),
      nullif(r->>'google_maps_url', ''), v_place,
      CASE WHEN (r->>'google_rating') ~ '^[0-9](\.[0-9])?$' THEN (r->>'google_rating')::numeric END,
      CASE WHEN (r->>'google_reviews_count') ~ '^[0-9]{1,7}$' THEN (r->>'google_reviews_count')::int END,
      CASE WHEN r->>'has_online_booking' IN ('true','false') THEN (r->>'has_online_booking')::boolean END,
      CASE WHEN p_source IN ('import','google_maps_manual','google_maps_api','openstreetmap','facebook_group','google_ads','manual')
           THEN p_source ELSE 'import' END,
      nullif(left(r->>'source_detail', 200), ''),
      nullif(left(r->>'notes', 2000), ''),
      CASE WHEN jsonb_typeof(r->'signals') = 'array' THEN r->'signals' ELSE '[]'::jsonb END
    )
    RETURNING id INTO v_id;
    ids := ids || v_id;
    inserted := inserted + 1;
  END LOOP;

  RETURN jsonb_build_object('inserted', inserted, 'skipped', skipped, 'invalid', invalid, 'ids', to_jsonb(ids));
END;
$$;

REVOKE ALL ON FUNCTION growth_import_leads(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION growth_import_leads(jsonb, text) TO service_role;
