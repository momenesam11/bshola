-- Rollback for supabase/migrations/033_growth_commissions.sql — back to the 032 state.
-- Drops the commissions table (export it first if partners are owed money)
-- and the columns 033 added; restores 032's growth_sync_platform().

DROP FUNCTION IF EXISTS growth_partner_dashboard(uuid);
DROP FUNCTION IF EXISTS growth_set_commission_status(uuid, text, text);
DROP FUNCTION IF EXISTS growth_qualify_lead(uuid, boolean);
DROP FUNCTION IF EXISTS growth_accrue_commissions(uuid);
DROP FUNCTION IF EXISTS growth_qualify_check(uuid);
DROP TABLE IF EXISTS growth_commissions;

ALTER TABLE growth_settings
  DROP COLUMN IF EXISTS qualify_min_appointments,
  DROP COLUMN IF EXISTS qualify_min_clients,
  DROP COLUMN IF EXISTS plan_prices;
ALTER TABLE growth_leads
  DROP COLUMN IF EXISTS is_test,
  DROP COLUMN IF EXISTS qualified_at,
  DROP COLUMN IF EXISTS qualified_by;
ALTER TABLE growth_partners
  DROP COLUMN IF EXISTS signup_bonus_egp,
  DROP COLUMN IF EXISTS commission_pct,
  DROP COLUMN IF EXISTS access_token;
COMMENT ON COLUMN growth_partners.commission_egp IS NULL;

-- growth_sync_platform() exactly as migration 032 defined it.
CREATE OR REPLACE FUNCTION growth_sync_platform()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  b        record;
  u        record;
  v_lead   growth_leads%ROWTYPE;
  v_phone  text;
  v_status text;
  created  int := 0;
  updated  int := 0;
  pending  int := 0;
BEGIN
  FOR b IN SELECT * FROM businesses LOOP
    v_phone := growth_normalize_phone(coalesce(b.owner_phone, b.phone));
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
              (SELECT email FROM auth.users WHERE id = b.owner_id), 'organic_signup', b.id, b.owner_id,
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
             OR (v_status = 'paid' AND stage <> 'paid')
             OR (v_status <> 'paid' AND stage IN ('new','contacted','follow_up','interested','demo','lost')));
      IF FOUND THEN updated := updated + 1; END IF;
    END IF;

    IF v_status = 'trial' AND b.trial_ends_at IS NOT NULL AND b.trial_ends_at < now() + interval '3 days' THEN
      PERFORM growth_add_signal(v_lead.id, 'trial_expiring', 'fact',
        'التجربة بتخلص ' || to_char(b.trial_ends_at AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD'));
      UPDATE growth_leads SET next_follow_up_at = least(coalesce(next_follow_up_at, now()), now())
      WHERE id = v_lead.id AND stage NOT IN ('paid','do_not_contact');
    ELSIF v_status = 'expired' THEN
      PERFORM growth_add_signal(v_lead.id, 'trial_expired', 'fact',
        'التجربة خلصت ' || to_char(b.trial_ends_at AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD') || ' ومادفعش');
    END IF;
  END LOOP;

  -- Signed up, never finished onboarding (no business after an hour).
  FOR u IN
    SELECT au.id, au.email, au.created_at FROM auth.users au
    WHERE au.created_at < now() - interval '1 hour'
      AND NOT EXISTS (SELECT 1 FROM businesses bb WHERE bb.owner_id = au.id)
      AND NOT EXISTS (SELECT 1 FROM growth_leads gl WHERE gl.owner_user_id = au.id)
  LOOP
    INSERT INTO growth_leads (name, email, source, owner_user_id, stage, next_follow_up_at, signals)
    VALUES (coalesce(u.email, 'تسجيل بدون نشاط'), u.email, 'signup_incomplete', u.id, 'new', now(),
            jsonb_build_array(jsonb_build_object(
              'type', 'signup_incomplete', 'kind', 'fact',
              'evidence', 'عمل حساب ' || to_char(u.created_at AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD') || ' وماكمّلش إعداد النشاط',
              'observed_at', now())));
    pending := pending + 1;
  END LOOP;

  RETURN jsonb_build_object('created', created, 'updated', updated, 'signup_incomplete', pending);
END;
$$;
REVOKE ALL ON FUNCTION growth_sync_platform() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION growth_sync_platform() TO service_role;
