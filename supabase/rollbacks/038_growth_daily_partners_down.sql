-- Rollback for supabase/migrations/038_growth_daily_partners.sql.
-- Removes the daily list, the run log, referral reward rows and partner PINs;
-- hidden leads become visible again. Commissions and leads are kept.
DROP FUNCTION IF EXISTS growth_set_daily_list(date, uuid[], text);
DROP FUNCTION IF EXISTS growth_bulk_leads(uuid[], text, text);
DROP FUNCTION IF EXISTS growth_pay_partner(uuid, text);
DROP FUNCTION IF EXISTS growth_set_partner_pin(uuid);
DROP FUNCTION IF EXISTS growth_partner_login(text, text);
DROP FUNCTION IF EXISTS growth_rotate_partner_token(uuid);
DROP FUNCTION IF EXISTS growth_decide_referral_reward(uuid, text, text);
DROP FUNCTION IF EXISTS growth_my_referrals();
DROP TRIGGER IF EXISTS growth_leads_unarchive ON growth_leads;
DROP FUNCTION IF EXISTS growth_unarchive_on_return();
DROP TABLE IF EXISTS growth_daily_list;
DROP TABLE IF EXISTS growth_runs;
DROP TABLE IF EXISTS growth_referral_rewards;

UPDATE growth_leads SET source = 'import' WHERE source = 'overture';
ALTER TABLE growth_leads DROP CONSTRAINT IF EXISTS growth_leads_source_check;
ALTER TABLE growth_leads ADD CONSTRAINT growth_leads_source_check CHECK (source IN (
                         'signup_incomplete','organic_signup','contact_form','loss_calculator',
                         'referral','booking_footer','partner','google_ads',
                         'google_maps_manual','google_maps_api','openstreetmap','facebook_group','import','manual'));

ALTER TABLE growth_leads
  DROP COLUMN IF EXISTS lat, DROP COLUMN IF EXISTS lng, DROP COLUMN IF EXISTS overture_id,
  DROP COLUMN IF EXISTS archived_at, DROP COLUMN IF EXISTS archived_reason,
  DROP COLUMN IF EXISTS last_listed_on, DROP COLUMN IF EXISTS times_listed;
ALTER TABLE growth_settings
  DROP COLUMN IF EXISTS daily_new_calls, DROP COLUMN IF EXISTS daily_cooldown_days, DROP COLUMN IF EXISTS pool_target,
  DROP COLUMN IF EXISTS max_no_answer, DROP COLUMN IF EXISTS places_monthly_cap,
  DROP COLUMN IF EXISTS places_month, DROP COLUMN IF EXISTS places_month_count;
ALTER TABLE growth_partners
  DROP COLUMN IF EXISTS payout_method, DROP COLUMN IF EXISTS payout_account, DROP COLUMN IF EXISTS pin_hash,
  DROP COLUMN IF EXISTS pin_salt, DROP COLUMN IF EXISTS pin_failed, DROP COLUMN IF EXISTS pin_locked_until,
  DROP COLUMN IF EXISTS pin_set_at;

-- The functions as they were before 038.
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

CREATE OR REPLACE FUNCTION growth_log_activity(
  p_lead_id uuid,
  p_kind text,
  p_outcome text DEFAULT NULL,
  p_body text DEFAULT NULL,
  p_sales_angle text DEFAULT NULL,
  p_next_follow_up_at timestamptz DEFAULT NULL,
  p_stage text DEFAULT NULL
)
RETURNS growth_leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lead      growth_leads%ROWTYPE;
  v_stage     text;
  v_next      timestamptz;
  v_contact   boolean := p_kind IN ('call','whatsapp','email','visit');
BEGIN
  SELECT * INTO v_lead FROM growth_leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'lead not found'; END IF;

  v_stage := v_lead.stage;
  v_next  := v_lead.next_follow_up_at;

  -- Outcome → pipeline move. Never moves a paid/trial customer backwards.
  IF p_outcome IS NOT NULL THEN
    CASE p_outcome
      WHEN 'do_not_contact' THEN v_stage := 'do_not_contact'; v_next := NULL;
      WHEN 'wrong_number'   THEN v_stage := 'lost'; v_next := NULL;
      WHEN 'not_interested' THEN
        IF v_stage NOT IN ('trial','paid') THEN v_stage := 'lost'; END IF; v_next := NULL;
      WHEN 'interested'     THEN
        IF v_stage IN ('new','contacted','follow_up','lost') THEN v_stage := 'interested'; END IF;
        v_next := coalesce(p_next_follow_up_at, now() + interval '1 day');
      WHEN 'demo_booked'    THEN
        IF v_stage IN ('new','contacted','follow_up','interested','lost') THEN v_stage := 'demo'; END IF;
        v_next := coalesce(p_next_follow_up_at, now() + interval '1 day');
      WHEN 'call_later'     THEN
        IF v_stage IN ('new','contacted') THEN v_stage := 'follow_up'; END IF;
        v_next := coalesce(p_next_follow_up_at, now() + interval '2 days');
      WHEN 'no_answer'      THEN
        IF v_stage = 'new' THEN v_stage := 'contacted'; END IF;
        v_next := coalesce(p_next_follow_up_at, now() + interval '1 day');
      WHEN 'sent'           THEN
        IF v_stage = 'new' THEN v_stage := 'contacted'; END IF;
        v_next := coalesce(p_next_follow_up_at, now() + interval '2 days');
      WHEN 'replied'        THEN
        IF v_stage IN ('new','contacted') THEN v_stage := 'follow_up'; END IF;
        v_next := coalesce(p_next_follow_up_at, now());
      ELSE NULL;
    END CASE;
  ELSIF p_next_follow_up_at IS NOT NULL THEN
    v_next := p_next_follow_up_at;
  END IF;

  IF p_stage IS NOT NULL THEN v_stage := p_stage; END IF;

  UPDATE growth_leads SET
    stage             = v_stage,
    next_follow_up_at = CASE WHEN v_stage IN ('paid','lost','do_not_contact') THEN NULL ELSE v_next END,
    last_contacted_at = CASE WHEN v_contact THEN now() ELSE last_contacted_at END,
    contact_attempts  = contact_attempts + CASE WHEN v_contact THEN 1 ELSE 0 END,
    sales_angle       = coalesce(sales_angle, p_sales_angle),
    lost_reason       = CASE WHEN p_outcome IN ('not_interested','wrong_number') THEN p_outcome ELSE lost_reason END,
    paid_at           = CASE WHEN v_stage = 'paid' THEN coalesce(paid_at, now()) ELSE paid_at END
  WHERE id = p_lead_id
  RETURNING * INTO v_lead;

  INSERT INTO growth_activities (lead_id, kind, outcome, sales_angle, body, meta)
  VALUES (p_lead_id, p_kind, p_outcome, p_sales_angle, left(p_body, 4000),
          jsonb_build_object('stage', v_stage, 'next_follow_up_at', v_lead.next_follow_up_at));

  RETURN v_lead;
END;
$$;

CREATE OR REPLACE FUNCTION growth_take_places_quota()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Africa/Cairo')::date;
  v_ok    boolean;
BEGIN
  UPDATE growth_settings SET
    places_calls_count = CASE WHEN places_calls_date = v_today THEN places_calls_count + 1 ELSE 1 END,
    places_calls_date  = v_today
  WHERE id = 1
    AND (places_calls_date IS DISTINCT FROM v_today OR places_calls_count < places_daily_cap)
    AND places_daily_cap > 0
  RETURNING true INTO v_ok;
  RETURN coalesce(v_ok, false);
END;
$$;

CREATE OR REPLACE FUNCTION growth_qualify_check(p_business_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  s        growth_settings%ROWTYPE;
  b        businesses%ROWTYPE;
  v_owner  text;
  v_appts  int;
  v_clients int;
  v_shared boolean;
BEGIN
  SELECT * INTO s FROM growth_settings WHERE id = 1;
  SELECT * INTO b FROM businesses WHERE id = p_business_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('qualified', false, 'reason', 'no_business'); END IF;
  v_owner := growth_normalize_phone(coalesce(b.owner_phone, b.phone));

  SELECT count(*), count(DISTINCT growth_normalize_phone(a.client_phone))
  INTO v_appts, v_clients
  FROM appointments a
  WHERE a.business_id = p_business_id
    AND a.created_at >= b.created_at
    AND (v_owner IS NULL OR growth_normalize_phone(a.client_phone) IS DISTINCT FROM v_owner);

  v_shared := v_owner IS NOT NULL AND EXISTS (
    SELECT 1 FROM businesses o
    WHERE o.id <> b.id AND growth_normalize_phone(coalesce(o.owner_phone, o.phone)) = v_owner
  );

  RETURN jsonb_build_object(
    'qualified', v_appts >= s.qualify_min_appointments AND v_clients >= s.qualify_min_clients AND NOT v_shared,
    'appointments', v_appts,
    'clients', v_clients,
    'shared_owner_phone', v_shared,
    'need_appointments', s.qualify_min_appointments,
    'need_clients', s.qualify_min_clients
  );
END;
$$;

CREATE OR REPLACE FUNCTION growth_accrue_commissions(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  l       growth_leads%ROWTYPE;
  p       growth_partners%ROWTYPE;
  b       businesses%ROWTYPE;
  s       growth_settings%ROWTYPE;
  v_days  numeric;
  v_months int;
  v_price numeric;
BEGIN
  SELECT * INTO l FROM growth_leads WHERE id = p_lead_id;
  IF NOT FOUND OR l.partner_id IS NULL OR l.is_test THEN RETURN; END IF;
  SELECT * INTO p FROM growth_partners WHERE id = l.partner_id;

  IF l.qualified_at IS NOT NULL AND p.signup_bonus_egp > 0 THEN
    INSERT INTO growth_commissions (partner_id, lead_id, kind, amount_egp, basis)
    VALUES (p.id, l.id, 'signup_bonus', p.signup_bonus_egp,
            'عيادة حقيقية اتأكدنا منها (' || CASE l.qualified_by WHEN 'admin' THEN 'يدوي' ELSE 'حجوزات حقيقية' END || ')')
    ON CONFLICT (lead_id, kind) DO NOTHING;
  END IF;

  IF l.stage = 'paid' AND p.commission_pct > 0 AND l.business_id IS NOT NULL THEN
    SELECT * INTO b FROM businesses WHERE id = l.business_id;
    SELECT * INTO s FROM growth_settings WHERE id = 1;
    -- The admin activates for N days; N ≈ the plan's months × 30.
    v_days := extract(epoch FROM (b.trial_ends_at - coalesce(b.activated_at, l.paid_at))) / 86400;
    v_months := CASE WHEN v_days >= 150 THEN 6 WHEN v_days >= 75 THEN 3 ELSE 1 END;
    v_price := coalesce((s.plan_prices ->> v_months::text)::numeric, 0);
    INSERT INTO growth_commissions (partner_id, lead_id, kind, amount_egp, basis)
    VALUES (p.id, l.id, 'subscription', round(v_price * p.commission_pct / 100, 2),
            p.commission_pct || '% من باقة ' || v_months || ' شهر (' || v_price || ' جنيه)')
    ON CONFLICT (lead_id, kind) DO NOTHING;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION growth_set_commission_status(p_id uuid, p_status text, p_note text DEFAULT NULL)
RETURNS growth_commissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c growth_commissions%ROWTYPE;
BEGIN
  UPDATE growth_commissions SET
    status     = p_status,
    decided_at = CASE WHEN p_status IN ('approved','rejected') THEN now() ELSE decided_at END,
    paid_at    = CASE WHEN p_status = 'paid' THEN now() ELSE paid_at END,
    note       = coalesce(p_note, note)
  WHERE id = p_id
  RETURNING * INTO c;
  IF NOT FOUND THEN RAISE EXCEPTION 'commission not found'; END IF;
  RETURN c;
END;
$$;

CREATE OR REPLACE FUNCTION growth_partner_dashboard(p_token uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'partner', jsonb_build_object(
      'name', p.name, 'ref_code', p.ref_code, 'active', p.active,
      'signup_bonus_egp', p.signup_bonus_egp, 'commission_pct', p.commission_pct),
    'clinics', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'name', l.name,
               'joined_at', coalesce(l.trial_started_at, l.created_at),
               'status', CASE WHEN l.stage = 'paid' THEN 'paid'
                              WHEN l.qualified_at IS NOT NULL THEN 'qualified'
                              WHEN l.business_id IS NOT NULL THEN 'registered'
                              ELSE 'lead' END)
             ORDER BY l.created_at DESC)
      FROM growth_leads l WHERE l.partner_id = p.id AND NOT l.is_test), '[]'::jsonb),
    'commissions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'clinic', l.name, 'kind', c.kind, 'amount', c.amount_egp,
               'status', c.status, 'created_at', c.created_at, 'paid_at', c.paid_at)
             ORDER BY c.created_at DESC)
      FROM growth_commissions c JOIN growth_leads l ON l.id = c.lead_id
      WHERE c.partner_id = p.id AND c.status <> 'rejected'), '[]'::jsonb)
  )
  FROM growth_partners p
  WHERE p.access_token = p_token;
$$;

REVOKE ALL ON FUNCTION growth_import_leads(jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_log_activity(uuid, text, text, text, text, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_take_places_quota() FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_qualify_check(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_accrue_commissions(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_set_commission_status(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_partner_dashboard(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION growth_import_leads(jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION growth_log_activity(uuid, text, text, text, text, timestamptz, text) TO service_role;
GRANT EXECUTE ON FUNCTION growth_take_places_quota() TO service_role;
GRANT EXECUTE ON FUNCTION growth_qualify_check(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION growth_set_commission_status(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION growth_partner_dashboard(uuid) TO anon, authenticated, service_role;
