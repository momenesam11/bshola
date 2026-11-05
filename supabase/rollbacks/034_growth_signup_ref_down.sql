-- Rollback for supabase/migrations/034_growth_signup_ref.sql — back to the 033 state.

DROP FUNCTION IF EXISTS growth_attribute_signup(text);
DROP FUNCTION IF EXISTS growth_attribute_user(uuid, text);

-- growth_attribute_signup() exactly as migration 032 defined it.
CREATE OR REPLACE FUNCTION growth_attribute_signup(p_ref text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_biz    businesses%ROWTYPE;
  v_email  text;
  v_phone  text;
  v_ref    record;
  v_lead   growth_leads%ROWTYPE;
  v_target growth_leads%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_signed_in'); END IF;
  SELECT * INTO v_biz FROM businesses WHERE owner_id = v_uid ORDER BY created_at LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'no_business'); END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  v_phone := growth_normalize_phone(coalesce(v_biz.owner_phone, v_biz.phone));
  SELECT * INTO v_ref FROM growth_resolve_ref(p_ref);
  IF v_ref.referrer_business_id = v_biz.id THEN  -- can't refer yourself
    v_ref.referrer_business_id := NULL; v_ref.source := NULL;
  END IF;

  -- The lead this person already is, if any: same account, same business, or
  -- same phone (we called them from Maps and they signed up without the link).
  SELECT * INTO v_lead FROM growth_leads
  WHERE owner_user_id = v_uid OR business_id = v_biz.id OR (v_phone IS NOT NULL AND phone = v_phone)
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
    VALUES (v_biz.name, growth_category_for_business(v_biz.type, v_biz.specialty), v_biz.specialty,
            v_phone, v_email, coalesce(v_ref.source, 'organic_signup'), v_ref.partner_id, v_ref.referrer_business_id,
            v_biz.id, v_uid, 'trial', now())
    RETURNING * INTO v_lead;
  ELSE
    UPDATE growth_leads SET
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
  VALUES (v_lead.id, 'system', 'سجّل في بسهولة وبدأ التجربة', jsonb_build_object('ref', left(p_ref, 80), 'business_id', v_biz.id));

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- growth_sync_platform() exactly as migration 033 defined it.
CREATE OR REPLACE FUNCTION growth_sync_platform()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  b          record;
  u          record;
  v_lead     growth_leads%ROWTYPE;
  v_phone    text;
  v_status   text;
  created    int := 0;
  updated    int := 0;
  pending    int := 0;
  qualified  int := 0;
BEGIN
  FOR b IN
    SELECT bb.*, au.email AS owner_email, au.raw_user_meta_data->>'owner_phone' AS meta_phone
    FROM businesses bb LEFT JOIN auth.users au ON au.id = bb.owner_id
  LOOP
    v_phone := growth_normalize_phone(coalesce(b.owner_phone, b.meta_phone, b.phone));
    v_status := CASE
      WHEN b.subscription_type = 'paid' THEN 'paid'
      WHEN coalesce(b.is_active, true) = false THEN 'suspended'
      WHEN b.trial_ends_at IS NOT NULL AND b.trial_ends_at < now() THEN 'expired'
      ELSE 'trial'
    END;

    SELECT * INTO v_lead FROM growth_leads
    WHERE business_id = b.id OR owner_user_id = b.owner_id OR (v_phone IS NOT NULL AND phone = v_phone)
    ORDER BY (business_id = b.id) DESC NULLS LAST, created_at
    LIMIT 1;

    IF NOT FOUND THEN
      INSERT INTO growth_leads (name, category, specialty, phone, email, source, business_id, owner_user_id,
                                stage, trial_started_at, paid_at, next_follow_up_at)
      VALUES (b.name, growth_category_for_business(b.type, b.specialty), b.specialty, v_phone,
              b.owner_email, 'organic_signup', b.id, b.owner_id,
              CASE WHEN v_status = 'paid' THEN 'paid' ELSE 'trial' END,
              coalesce(b.trial_started_at, b.created_at),
              CASE WHEN v_status = 'paid' THEN coalesce(b.activated_at, now()) END,
              CASE WHEN v_status = 'paid' THEN NULL ELSE now() END)
      RETURNING * INTO v_lead;
      created := created + 1;
    ELSE
      UPDATE growth_leads SET
        business_id      = coalesce(business_id, b.id),
        owner_user_id    = coalesce(owner_user_id, b.owner_id),
        email            = coalesce(email, b.owner_email),
        phone            = coalesce(phone, CASE WHEN NOT EXISTS (
                             SELECT 1 FROM growth_leads x WHERE x.phone = v_phone AND x.id <> v_lead.id) THEN v_phone END),
        trial_started_at = coalesce(trial_started_at, b.trial_started_at, b.created_at),
        stage = CASE
          WHEN v_status = 'paid' THEN 'paid'
          WHEN stage IN ('new','contacted','follow_up','interested','demo','lost') THEN 'trial'
          ELSE stage END,
        paid_at = CASE WHEN v_status = 'paid' THEN coalesce(paid_at, b.activated_at, now()) ELSE paid_at END
      WHERE id = v_lead.id
        AND (business_id IS NULL OR owner_user_id IS NULL OR trial_started_at IS NULL
             OR (phone IS NULL AND v_phone IS NOT NULL) OR (email IS NULL AND b.owner_email IS NOT NULL)
             OR (v_status = 'paid' AND stage <> 'paid')
             OR (v_status <> 'paid' AND stage IN ('new','contacted','follow_up','interested','demo','lost')));
      IF FOUND THEN updated := updated + 1; END IF;
    END IF;

    IF NOT v_lead.is_test THEN
      IF v_status = 'trial' AND b.trial_ends_at IS NOT NULL AND b.trial_ends_at < now() + interval '3 days' THEN
        PERFORM growth_add_signal(v_lead.id, 'trial_expiring', 'fact',
          'التجربة بتخلص ' || to_char(b.trial_ends_at AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD'));
        UPDATE growth_leads SET next_follow_up_at = least(coalesce(next_follow_up_at, now()), now())
        WHERE id = v_lead.id AND stage NOT IN ('paid','do_not_contact');
      ELSIF v_status = 'expired' THEN
        PERFORM growth_add_signal(v_lead.id, 'trial_expired', 'fact',
          'التجربة خلصت ' || to_char(b.trial_ends_at AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD') || ' ومادفعش');
      END IF;

      IF v_lead.qualified_at IS NULL AND (growth_qualify_check(b.id)->>'qualified')::boolean THEN
        PERFORM growth_qualify_lead(v_lead.id, false);
        qualified := qualified + 1;
      ELSE
        PERFORM growth_accrue_commissions(v_lead.id);
      END IF;
    END IF;
  END LOOP;

  -- Signed up, never finished onboarding (no business after an hour). The
  -- phone they typed at sign-up is in their auth metadata (Register.jsx).
  FOR u IN
    SELECT au.id, au.email, au.created_at, growth_normalize_phone(au.raw_user_meta_data->>'owner_phone') AS phone
    FROM auth.users au
    WHERE au.created_at < now() - interval '1 hour'
      AND NOT EXISTS (SELECT 1 FROM businesses bb WHERE bb.owner_id = au.id)
      AND NOT EXISTS (SELECT 1 FROM growth_leads gl WHERE gl.owner_user_id = au.id)
  LOOP
    INSERT INTO growth_leads (name, email, phone, source, owner_user_id, stage, next_follow_up_at, signals)
    VALUES (coalesce(u.email, 'تسجيل بدون نشاط'), u.email,
            CASE WHEN u.phone IS NOT NULL AND NOT EXISTS (SELECT 1 FROM growth_leads x WHERE x.phone = u.phone) THEN u.phone END,
            'signup_incomplete', u.id, 'new', now(),
            jsonb_build_array(jsonb_build_object(
              'type', 'signup_incomplete', 'kind', 'fact',
              'evidence', 'عمل حساب ' || to_char(u.created_at AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD') || ' وماكمّلش إعداد النشاط',
              'observed_at', now())));
    pending := pending + 1;
  END LOOP;

  -- Backfill phones for unfinished signups that registered before 033.
  UPDATE growth_leads gl SET phone = growth_normalize_phone(au.raw_user_meta_data->>'owner_phone')
  FROM auth.users au
  WHERE gl.owner_user_id = au.id AND gl.phone IS NULL
    AND growth_normalize_phone(au.raw_user_meta_data->>'owner_phone') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM growth_leads x WHERE x.phone = growth_normalize_phone(au.raw_user_meta_data->>'owner_phone'));

  RETURN jsonb_build_object('created', created, 'updated', updated, 'signup_incomplete', pending, 'qualified', qualified);
END;
$$;

REVOKE ALL ON FUNCTION growth_attribute_signup(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_sync_platform() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION growth_attribute_signup(text) TO authenticated;
GRANT EXECUTE ON FUNCTION growth_sync_platform() TO service_role;
