-- ============================================================
-- 067 — Trial length per partner, and per client link
-- ============================================================
-- Every new account gets 14 days. A partner who brings clinics that already
-- agreed to pay wants a shorter trial (two days, or none), and sometimes a
-- different one for each client.
--
--   · growth_partners.trial_days: the trial for anyone signing up from the
--     partner's own link (P-…). The owner sets it in /admin. Empty = 14 days.
--   · growth_partner_links: links the partner (or the owner, from the
--     partner's dashboard) makes for one client, each with its own trial
--     (T-…). They credit the partner exactly like the partner's own link.
--
-- The trial is applied once, when the business is first linked to its sign-up
-- (growth_attribute_user, end of onboarding or the nightly sync), counted from
-- trial_started_at. It only ever shortens a trial that is still a trial: never
-- past 14 days, never an activated account, never after the admin changed it.
-- 0 days = the account is locked from the start until the admin activates it.
--
-- Additive: no existing account changes.
-- Rollback: supabase/rollbacks/067_partner_trial_days_down.sql.

ALTER TABLE growth_partners
  ADD COLUMN IF NOT EXISTS trial_days int CHECK (trial_days BETWEEN 0 AND 14);
COMMENT ON COLUMN growth_partners.trial_days IS
  'Trial days for sign-ups from this partner''s own link. NULL = the usual 14.';

CREATE TABLE IF NOT EXISTS growth_partner_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  partner_id  uuid NOT NULL REFERENCES growth_partners(id) ON DELETE CASCADE,
  code        text NOT NULL UNIQUE
              DEFAULT ('T-' || upper(substr(md5(gen_random_uuid()::text), 1, 8)))
              CHECK (code ~ '^T-[A-Z0-9]{6,12}$'),
  label       text CHECK (char_length(label) <= 80),
  trial_days  int NOT NULL CHECK (trial_days BETWEEN 0 AND 14)
);
CREATE INDEX IF NOT EXISTS growth_partner_links_partner_idx ON growth_partner_links (partner_id, created_at DESC);
ALTER TABLE growth_partner_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON growth_partner_links FROM anon, authenticated;
GRANT ALL ON growth_partner_links TO service_role;

-- ── Ref codes: T-… is a partner's client link ─────────────────────────────
CREATE OR REPLACE FUNCTION growth_resolve_ref(p_ref text, OUT lead_id uuid, OUT partner_id uuid, OUT referrer_business_id uuid, OUT source text)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_code text := upper(btrim(coalesce(p_ref, '')));
  v_slug text := lower(btrim(substr(coalesce(p_ref, ''), 3)));
BEGIN
  IF v_code LIKE 'L-%' THEN
    SELECT l.id INTO lead_id FROM growth_leads l WHERE l.ref_code = v_code;
  ELSIF v_code LIKE 'P-%' THEN
    SELECT p.id INTO partner_id FROM growth_partners p WHERE p.ref_code = v_code AND p.active;
    IF partner_id IS NOT NULL THEN source := 'partner'; END IF;
  ELSIF v_code LIKE 'T-%' THEN
    SELECT p.id INTO partner_id
    FROM growth_partner_links k JOIN growth_partners p ON p.id = k.partner_id
    WHERE k.code = v_code AND p.active;
    IF partner_id IS NOT NULL THEN source := 'partner'; END IF;
  ELSIF v_code LIKE 'R-%' OR v_code LIKE 'B-%' THEN
    SELECT b.id INTO referrer_business_id FROM businesses b WHERE lower(b.booking_slug) = v_slug;
    IF referrer_business_id IS NOT NULL THEN
      source := CASE WHEN v_code LIKE 'R-%' THEN 'referral' ELSE 'booking_footer' END;
    END IF;
  END IF;
END;
$$;

-- ── PUBLIC: the trial a ref code gives (NULL = the usual 14 days) ──────────
-- Only a number, so the sign-up page can say it. Nothing else about the partner.
CREATE OR REPLACE FUNCTION growth_ref_trial_days(p_ref text)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN upper(btrim(coalesce(p_ref, ''))) LIKE 'T-%' THEN (
      SELECT k.trial_days FROM growth_partner_links k JOIN growth_partners p ON p.id = k.partner_id
      WHERE k.code = upper(btrim(p_ref)) AND p.active)
    WHEN upper(btrim(coalesce(p_ref, ''))) LIKE 'P-%' THEN (
      SELECT p.trial_days FROM growth_partners p
      WHERE p.ref_code = upper(btrim(p_ref)) AND p.active)
  END;
$$;

-- ── Attribution (as 035) + the partner's trial, the first time only ───────
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
  v_first  boolean;
  v_days   int;
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

  -- Linking this business for the first time (not a repeat call).
  v_first := v_lead.id IS NULL OR v_lead.business_id IS NULL;

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

  -- The trial the partner agreed with this clinic. Only shortens, only once,
  -- only while it's still an untouched trial.
  IF v_first THEN
    v_days := growth_ref_trial_days(p_ref);
    IF v_days IS NOT NULL THEN
      UPDATE businesses
      SET trial_ends_at = least(trial_ends_at, coalesce(trial_started_at, created_at) + make_interval(days => v_days))
      WHERE id = v_biz.id
        AND subscription_type = 'trial' AND activated_at IS NULL
        AND trial_ends_at > coalesce(trial_started_at, created_at) + make_interval(days => v_days);
      IF FOUND THEN
        INSERT INTO growth_activities (lead_id, kind, body, meta)
        VALUES (v_lead.id, 'system',
                CASE WHEN v_days = 0 THEN 'من غير تجربة حسب لينك الشريك: الحساب مستني التفعيل'
                     ELSE 'التجربة ' || v_days || ' يوم حسب لينك الشريك' END,
                jsonb_build_object('ref', left(p_ref, 80), 'trial_days', v_days));
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── PUBLIC (secret token): the partner's trial and client links ───────────
CREATE OR REPLACE FUNCTION growth_partner_trial(p_token uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'trial_days', p.trial_days,
    'links', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'code', k.code, 'label', k.label, 'trial_days', k.trial_days, 'created_at', k.created_at,
               -- Clinics of this partner that signed up with this code.
               'signed_up', (SELECT count(DISTINCT a.lead_id) FROM growth_activities a
                             JOIN growth_leads l ON l.id = a.lead_id
                             WHERE upper(a.meta->>'ref') = k.code AND l.partner_id = p.id AND l.business_id IS NOT NULL))
             ORDER BY k.created_at DESC)
      FROM growth_partner_links k WHERE k.partner_id = p.id), '[]'::jsonb))
  FROM growth_partners p
  WHERE p.access_token = p_token;
$$;

CREATE OR REPLACE FUNCTION growth_partner_create_link(p_token uuid, p_label text, p_trial_days int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  p growth_partners%ROWTYPE;
  k growth_partner_links%ROWTYPE;
BEGIN
  SELECT * INTO p FROM growth_partners WHERE access_token = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF NOT p.active THEN RETURN jsonb_build_object('ok', false, 'error', 'inactive'); END IF;
  IF p_trial_days IS NULL OR p_trial_days NOT BETWEEN 0 AND 14 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_days');
  END IF;
  IF (SELECT count(*) FROM growth_partner_links WHERE partner_id = p.id AND created_at > now() - interval '1 day') >= 30 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_many');
  END IF;
  INSERT INTO growth_partner_links (partner_id, label, trial_days)
  VALUES (p.id, nullif(left(btrim(coalesce(p_label, '')), 80), ''), p_trial_days)
  RETURNING * INTO k;
  RETURN jsonb_build_object('ok', true, 'code', k.code, 'label', k.label, 'trial_days', k.trial_days, 'created_at', k.created_at);
END;
$$;

REVOKE ALL ON FUNCTION growth_ref_trial_days(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_partner_trial(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_partner_create_link(uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION growth_ref_trial_days(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION growth_partner_trial(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION growth_partner_create_link(uuid, text, int) TO anon, authenticated, service_role;
