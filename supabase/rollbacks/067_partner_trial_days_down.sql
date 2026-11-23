-- Rollback for supabase/migrations/067_partner_trial_days.sql — back to the 032/035 functions.
-- Trials already shortened by a partner link are left as they are; extend them from /admin if needed.

DROP FUNCTION IF EXISTS growth_partner_create_link(uuid, text, int);
DROP FUNCTION IF EXISTS growth_partner_trial(uuid);
DROP FUNCTION IF EXISTS growth_ref_trial_days(text);

CREATE OR REPLACE FUNCTION growth_resolve_ref(p_ref text, OUT lead_id uuid, OUT partner_id uuid, OUT referrer_business_id uuid, OUT source text)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  code text := upper(btrim(coalesce(p_ref, '')));
  slug text := lower(btrim(substr(coalesce(p_ref, ''), 3)));
BEGIN
  IF code LIKE 'L-%' THEN
    SELECT l.id INTO lead_id FROM growth_leads l WHERE l.ref_code = code;
  ELSIF code LIKE 'P-%' THEN
    SELECT p.id INTO partner_id FROM growth_partners p WHERE p.ref_code = code AND p.active;
    IF partner_id IS NOT NULL THEN source := 'partner'; END IF;
  ELSIF code LIKE 'R-%' OR code LIKE 'B-%' THEN
    SELECT b.id INTO referrer_business_id FROM businesses b WHERE lower(b.booking_slug) = slug;
    IF referrer_business_id IS NOT NULL THEN
      source := CASE WHEN code LIKE 'R-%' THEN 'referral' ELSE 'booking_footer' END;
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION growth_attribute_user(p_uid uuid, p_ref text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := p_uid;
  v_biz    businesses%ROWTYPE;
  v_email  text;
  v_phone  text;
  v_ref    record;
  v_lead   growth_leads%ROWTYPE;
  v_target growth_leads%ROWTYPE;
  v_old    text;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_signed_in'); END IF;
  SELECT * INTO v_biz FROM businesses WHERE owner_id = v_uid ORDER BY created_at LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'no_business'); END IF;

  -- The code they arrived with is saved on their account at sign-up
  -- (Register.jsx), so it survives finishing onboarding on another device.
  SELECT email, coalesce(nullif(btrim(p_ref), ''), raw_user_meta_data->>'ref')
  INTO v_email, p_ref
  FROM auth.users WHERE id = v_uid;
  v_phone := growth_normalize_phone(coalesce(v_biz.owner_phone, v_biz.phone));
  SELECT * INTO v_ref FROM growth_resolve_ref(p_ref);
  IF v_ref.referrer_business_id = v_biz.id THEN  -- can't refer yourself
    v_ref.referrer_business_id := NULL; v_ref.source := NULL;
  END IF;

  -- The lead this person already is, if any: same account, same business, or
  -- same phone (we called them from Maps and they signed up without the
  -- link) — but by phone only a lead that isn't already another business.
  SELECT * INTO v_lead FROM growth_leads
  WHERE owner_user_id = v_uid OR business_id = v_biz.id
     OR (v_phone IS NOT NULL AND phone = v_phone AND (business_id IS NULL OR business_id = v_biz.id))
  ORDER BY (owner_user_id = v_uid) DESC NULLS LAST, created_at
  LIMIT 1;

  -- A lead's own link wins: fold any auto-created row into it — unless that
  -- lead already belongs to a different business (a forwarded link).
  IF v_ref.lead_id IS NOT NULL THEN
    SELECT * INTO v_target FROM growth_leads WHERE id = v_ref.lead_id;
    IF v_target.business_id IS NOT NULL AND v_target.business_id <> v_biz.id THEN
      v_target := NULL;
    END IF;
  END IF;
  IF v_target.id IS NOT NULL THEN
    IF v_lead.id IS NOT NULL AND v_lead.id <> v_target.id THEN
      UPDATE growth_activities SET lead_id = v_target.id WHERE lead_id = v_lead.id;
      DELETE FROM growth_leads WHERE id = v_lead.id;
    END IF;
    v_lead := v_target;
  END IF;

  IF v_lead.id IS NULL THEN
    INSERT INTO growth_leads (name, category, specialty, phone, email, source, partner_id, referrer_business_id,
                              business_id, owner_user_id, stage, trial_started_at)
    -- A second account on the same owner number still gets its own entry,
    -- just without the number (one entry per phone).
    VALUES (v_biz.name, growth_category_for_business(v_biz.type, v_biz.specialty), v_biz.specialty,
            CASE WHEN v_phone IS NOT NULL AND NOT EXISTS (SELECT 1 FROM growth_leads x WHERE x.phone = v_phone) THEN v_phone END, v_email, coalesce(v_ref.source, 'organic_signup'), v_ref.partner_id, v_ref.referrer_business_id,
            v_biz.id, v_uid, 'trial', now())
    RETURNING * INTO v_lead;
  ELSE
    v_old := v_lead.name;
    UPDATE growth_leads SET
      -- The name the clinic signed up with is the real one; the list name
      -- (typed by hand / from Maps) is kept in the activity below.
      name                 = v_biz.name,
      business_id          = v_biz.id,
      owner_user_id        = v_uid,
      email                = coalesce(email, v_email),
      phone                = coalesce(phone, CASE WHEN NOT EXISTS (
                               SELECT 1 FROM growth_leads x WHERE x.phone = v_phone AND x.id <> v_lead.id) THEN v_phone END),
      partner_id           = coalesce(partner_id, v_ref.partner_id),
      referrer_business_id = coalesce(referrer_business_id, v_ref.referrer_business_id),
      source               = CASE WHEN source IN ('organic_signup','signup_incomplete') AND v_ref.source IS NOT NULL
                                  THEN v_ref.source ELSE source END,
      stage                = CASE WHEN stage IN ('new','contacted','follow_up','interested','demo','lost') THEN 'trial' ELSE stage END,
      trial_started_at     = coalesce(trial_started_at, now())
    WHERE id = v_lead.id
    RETURNING * INTO v_lead;
  END IF;

  INSERT INTO growth_activities (lead_id, kind, body, meta)
  VALUES (v_lead.id, 'system',
          'سجّل في بسهولة باسم «' || v_biz.name || '» وبدأ التجربة'
            || CASE WHEN v_old IS NOT NULL AND v_old <> v_biz.name THEN ' (كان في القايمة باسم «' || v_old || '»)' ELSE '' END,
          jsonb_build_object('ref', left(p_ref, 80), 'business_id', v_biz.id, 'previous_name', v_old));

  RETURN jsonb_build_object('ok', true);
END;
$$;

DROP TABLE IF EXISTS growth_partner_links;
ALTER TABLE growth_partners DROP COLUMN IF EXISTS trial_days;
