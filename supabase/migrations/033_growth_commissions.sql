-- ============================================================
-- GROWTH ENGINE v2 — partner commissions, "real clinic" check, test accounts
-- ============================================================
-- Builds on 032. Only touches growth_* objects.
--
-- Partner pay is two separate amounts:
--   1. signup bonus — a fixed amount once a referred clinic is QUALIFIED,
--      i.e. proven real (see growth_qualify_check below), not merely signed up
--   2. subscription commission — a % of the clinic's first paid subscription
-- Every commission is created as 'pending' and only the admin moves it to
-- approved → paid, so nothing is owed until a human has looked at it.
--
-- A partner sees their own numbers on /partner/<access_token> — a secret
-- link separate from their public ref code (which is in every link they share).
--
-- Rollback: supabase/rollbacks/033_growth_commissions_down.sql.

-- ------------------------------------------------------------
-- Columns
-- ------------------------------------------------------------
ALTER TABLE growth_partners
  ADD COLUMN IF NOT EXISTS signup_bonus_egp numeric(10,2) NOT NULL DEFAULT 0 CHECK (signup_bonus_egp >= 0),
  ADD COLUMN IF NOT EXISTS commission_pct   numeric(5,2)  NOT NULL DEFAULT 0 CHECK (commission_pct BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS access_token     uuid NOT NULL UNIQUE DEFAULT gen_random_uuid();
COMMENT ON COLUMN growth_partners.commission_egp IS 'Unused since 033 — replaced by signup_bonus_egp + commission_pct.';

ALTER TABLE growth_leads
  -- Owner's own test accounts: kept, but out of the queue, the numbers and
  -- every commission/reward.
  ADD COLUMN IF NOT EXISTS is_test      boolean NOT NULL DEFAULT false,
  -- When the clinic was judged real, and how ('auto' = activity rule, 'admin' = by hand).
  ADD COLUMN IF NOT EXISTS qualified_at timestamptz,
  ADD COLUMN IF NOT EXISTS qualified_by text CHECK (qualified_by IN ('auto','admin'));

ALTER TABLE growth_settings
  -- "Real clinic" rule: this many bookings, from this many different client
  -- numbers, none of them the owner's own.
  ADD COLUMN IF NOT EXISTS qualify_min_appointments int NOT NULL DEFAULT 5 CHECK (qualify_min_appointments BETWEEN 1 AND 500),
  ADD COLUMN IF NOT EXISTS qualify_min_clients      int NOT NULL DEFAULT 3 CHECK (qualify_min_clients BETWEEN 1 AND 500),
  -- Plan prices by months, mirrored from PLANS in src/lib/seo.js, used to
  -- price the subscription a commission is a % of.
  ADD COLUMN IF NOT EXISTS plan_prices jsonb NOT NULL DEFAULT '{"1":299,"3":749,"6":1200}'::jsonb;

-- ------------------------------------------------------------
-- Commissions
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS growth_commissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  partner_id  uuid NOT NULL REFERENCES growth_partners(id) ON DELETE CASCADE,
  lead_id     uuid NOT NULL REFERENCES growth_leads(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('signup_bonus','subscription')),
  amount_egp  numeric(10,2) NOT NULL CHECK (amount_egp >= 0),
  basis       text,                       -- how the amount was worked out, in words
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','paid','rejected')),
  decided_at  timestamptz,
  paid_at     timestamptz,
  note        text,
  UNIQUE (lead_id, kind)                  -- one bonus and one subscription commission per clinic
);
CREATE INDEX IF NOT EXISTS growth_commissions_partner_idx ON growth_commissions (partner_id);
ALTER TABLE growth_commissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON growth_commissions FROM anon, authenticated;

-- ============================================================
-- "Is this a real clinic?" — the anti-fake check.
-- A clinic qualifies when, since it signed up, it has at least
-- qualify_min_appointments bookings from at least qualify_min_clients distinct
-- client numbers, none equal to the owner's own number, and its owner number
-- isn't shared with another business (the classic fake: one person, many
-- accounts). The admin can also qualify by hand after a call.
-- ============================================================
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

-- Creates the commissions a partner lead has earned so far. Idempotent.
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

-- ============================================================
-- SERVICE ROLE: qualify a lead by hand (after a call / visit) or re-check it.
-- ============================================================
CREATE OR REPLACE FUNCTION growth_qualify_lead(p_lead_id uuid, p_manual boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  l       growth_leads%ROWTYPE;
  v_check jsonb;
BEGIN
  SELECT * INTO l FROM growth_leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'lead not found'; END IF;
  v_check := CASE WHEN l.business_id IS NOT NULL THEN growth_qualify_check(l.business_id) ELSE jsonb_build_object('qualified', false) END;

  IF l.qualified_at IS NULL AND (p_manual OR (v_check->>'qualified')::boolean) THEN
    UPDATE growth_leads SET qualified_at = now(), qualified_by = CASE WHEN p_manual THEN 'admin' ELSE 'auto' END
    WHERE id = p_lead_id;
    INSERT INTO growth_activities (lead_id, kind, body, meta)
    VALUES (p_lead_id, 'system', CASE WHEN p_manual THEN 'اتأكدت إنها عيادة حقيقية (يدوي)' ELSE 'اتأكدت إنها عيادة حقيقية: حجوزات من عملاء حقيقيين' END, v_check);
  END IF;
  PERFORM growth_accrue_commissions(p_lead_id);
  RETURN v_check;
END;
$$;

-- ============================================================
-- SERVICE ROLE: approve / reject / mark paid.
-- ============================================================
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

-- ============================================================
-- PUBLIC (secret link): a partner's own dashboard. Shows only their clinics,
-- by name and status — no phones, no emails, nothing about other partners.
-- ============================================================
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

-- ============================================================
-- Sync v2: same as 032, plus phone from sign-up metadata, test accounts
-- left alone, and qualification + commissions on every run.
-- ============================================================
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

-- ------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION growth_qualify_check(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_accrue_commissions(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_qualify_lead(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_set_commission_status(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_partner_dashboard(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_sync_platform() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION growth_qualify_check(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION growth_qualify_lead(uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION growth_set_commission_status(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION growth_partner_dashboard(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION growth_sync_platform() TO service_role;
GRANT ALL ON growth_commissions TO service_role;
