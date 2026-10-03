-- ============================================================
-- GROWTH ENGINE — leads, sales activity, partners, attribution
-- ============================================================
-- Beshola's own sales pipeline: every prospective customer (a clinic found on
-- Google Maps, someone who left their number on the site, a signup that never
-- finished onboarding, a referral...) is one row in growth_leads, with every
-- call / WhatsApp / note logged in growth_activities.
--
-- Isolation from the booking product:
--   · every table is prefixed growth_ and nothing in the booking flow reads
--     or writes them; the only links back are nullable FKs (ON DELETE SET
--     NULL), so deleting a business never fails because of a lead row
--   · RLS is enabled with NO policies, and anon/authenticated have no grants:
--     only the service-role key — used inside the `growth` Edge Function,
--     behind the same admin_sessions password check as /admin — can read or
--     write them
--   · the public site touches growth data only through four narrow SECURITY
--     DEFINER functions below, each validating its own input
--
-- Rollback: supabase/rollbacks/032_growth_engine_down.sql drops everything
-- this file creates and touches nothing else.

-- ------------------------------------------------------------
-- Phone normalisation — mirrors src/lib/growth/phone.js. Egyptian numbers
-- are stored as international digits without "+": 01012345678 → 201012345678.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION growth_normalize_phone(p_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  d text := regexp_replace(coalesce(p_raw, ''), '[^0-9]', '', 'g');
BEGIN
  IF d LIKE '00%' THEN d := substr(d, 3); END IF;
  IF d ~ '^0[0-9]{9,10}$' THEN d := '20' || substr(d, 2);        -- 01xxxxxxxxx / 02xxxxxxxx
  ELSIF d ~ '^1[0-9]{9}$' THEN d := '20' || d;                    -- 1xxxxxxxxx (leading 0 dropped)
  END IF;
  IF length(d) BETWEEN 11 AND 15 THEN RETURN d; END IF;
  RETURN NULL;
END;
$$;

-- ------------------------------------------------------------
-- Partners: medical reps, dental suppliers, clinic fit-out companies… who
-- refer clinics for a commission. Their link is /?ref=P-XXXX.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS growth_partners (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  name           text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  phone          text,
  kind           text NOT NULL DEFAULT 'other'
                 CHECK (kind IN ('medical_rep','dental_supplier','clinic_fitout','accountant','other')),
  ref_code       text NOT NULL UNIQUE
                 DEFAULT ('P-' || upper(substr(md5(gen_random_uuid()::text), 1, 6)))
                 CHECK (ref_code ~ '^P-[A-Z0-9]{4,12}$'),
  commission_egp numeric(10,2) NOT NULL DEFAULT 0 CHECK (commission_egp >= 0),
  notes          text,
  active         boolean NOT NULL DEFAULT true
);

-- ------------------------------------------------------------
-- Leads
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS growth_leads (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  -- Who
  name                 text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  category             text NOT NULL DEFAULT 'clinic'
                       CHECK (category IN ('dental','derma','clinic','salon','gym','education','other')),
  specialty            text,
  contact_person       text,
  city                 text,
  area                 text,
  address              text,

  -- How to reach them
  phone                text,             -- normalised, see growth_normalize_phone
  phone_raw            text,
  email                text,
  website              text,
  instagram            text,
  facebook             text,
  google_maps_url      text,
  google_place_id      text UNIQUE,
  google_rating        numeric(2,1),
  google_reviews_count int,
  has_online_booking   boolean,          -- NULL = not checked

  -- Where they came from
  source               text NOT NULL CHECK (source IN (
                         'signup_incomplete','organic_signup','contact_form','loss_calculator',
                         'referral','booking_footer','partner','google_ads',
                         'google_maps_manual','google_maps_api','facebook_group','import','manual')),
  source_detail        text,
  partner_id           uuid REFERENCES growth_partners(id) ON DELETE SET NULL,
  referrer_business_id uuid REFERENCES businesses(id) ON DELETE SET NULL,

  -- Link to the product once they sign up
  business_id          uuid UNIQUE REFERENCES businesses(id) ON DELETE SET NULL,
  owner_user_id        uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Pipeline
  stage                text NOT NULL DEFAULT 'new' CHECK (stage IN (
                         'new','contacted','follow_up','interested','demo','trial','paid','lost','do_not_contact')),
  lost_reason          text,
  sales_angle          text,
  next_follow_up_at    timestamptz,
  last_contacted_at    timestamptz,
  contact_attempts     int NOT NULL DEFAULT 0,
  inbound_at           timestamptz,      -- last time THEY reached out to us
  trial_started_at     timestamptz,
  paid_at              timestamptz,

  -- Research. Each signal: {type, kind: 'fact'|'inference', evidence, source_url?, observed_at}
  -- 'fact' = something observed (a review quote, a form they filled);
  -- 'inference' = a conclusion drawn from facts. Recommendations (the sales
  -- angle) are computed in the UI and never stored as facts.
  signals              jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(signals) = 'array'),
  notes                text,

  -- Attribution code used in every link sent to this lead (/register?ref=L-…)
  ref_code             text NOT NULL UNIQUE
                       DEFAULT ('L-' || upper(substr(md5(gen_random_uuid()::text), 1, 8)))
                       CHECK (ref_code ~ '^L-[A-Z0-9]{4,12}$'),
  -- Personalised demo page (/demo/<ref_code>): {enabled, specialty, color, services:[{name,duration,price}]}
  preview              jsonb
);

-- One lead per phone number — the main duplicate guard across every source.
CREATE UNIQUE INDEX IF NOT EXISTS growth_leads_phone_key ON growth_leads (phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS growth_leads_stage_idx ON growth_leads (stage);
CREATE INDEX IF NOT EXISTS growth_leads_follow_up_idx ON growth_leads (next_follow_up_at);
CREATE INDEX IF NOT EXISTS growth_leads_source_idx ON growth_leads (source);

-- ------------------------------------------------------------
-- Activity log: every call, WhatsApp, note, stage change, inbound request.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS growth_activities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid NOT NULL REFERENCES growth_leads(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  kind        text NOT NULL CHECK (kind IN ('call','whatsapp','email','visit','note','stage_change','preview','inbound','system')),
  outcome     text CHECK (outcome IN (
                'no_answer','interested','call_later','not_interested','wrong_number',
                'do_not_contact','sent','replied','demo_booked')),
  sales_angle text,
  body        text CHECK (char_length(body) <= 4000),
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS growth_activities_lead_idx ON growth_activities (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS growth_activities_created_idx ON growth_activities (created_at);

-- ------------------------------------------------------------
-- Settings (single row): score weights, Google Places daily budget cap.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS growth_settings (
  id                 int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  weights            jsonb NOT NULL DEFAULT
                     '{"fit":25,"intent":30,"pain":20,"activity":10,"contactability":15}'::jsonb,
  target_areas       text[] NOT NULL DEFAULT ARRAY['القاهرة','الجيزة'],
  places_daily_cap   int NOT NULL DEFAULT 100 CHECK (places_daily_cap BETWEEN 0 AND 5000),
  places_calls_date  date,
  places_calls_count int NOT NULL DEFAULT 0
);
INSERT INTO growth_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- updated_at upkeep
CREATE OR REPLACE FUNCTION growth_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS growth_leads_touch ON growth_leads;
CREATE TRIGGER growth_leads_touch BEFORE UPDATE ON growth_leads
  FOR EACH ROW EXECUTE FUNCTION growth_touch_updated_at();

-- ------------------------------------------------------------
-- Lock down: service role only.
-- ------------------------------------------------------------
ALTER TABLE growth_partners   ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_leads      ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_settings   ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON growth_partners, growth_leads, growth_activities, growth_settings FROM anon, authenticated;

-- ============================================================
-- Internal helpers
-- ============================================================

-- Appends a signal unless one of the same type is already there.
CREATE OR REPLACE FUNCTION growth_add_signal(p_lead_id uuid, p_type text, p_kind text, p_evidence text, p_source_url text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE growth_leads
  SET signals = signals || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'type', p_type,
        'kind', p_kind,
        'evidence', left(p_evidence, 300),
        'source_url', p_source_url,
        'observed_at', now()
      )))
  WHERE id = p_lead_id
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(signals) s WHERE s->>'type' = p_type);
END;
$$;

-- Maps a business row to a lead category.
CREATE OR REPLACE FUNCTION growth_category_for_business(p_type text, p_specialty text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_type = 'clinic' AND coalesce(p_specialty, '') ~* '(أسنان|اسنان|dental|dent)' THEN 'dental'
    WHEN p_type = 'clinic' AND coalesce(p_specialty, '') ~* '(جلد|تجميل|derma|skin|cosmetic|ليزر)' THEN 'derma'
    WHEN p_type = 'clinic' THEN 'clinic'
    WHEN p_type IN ('salon') THEN 'salon'
    WHEN p_type IN ('gym','fitness','trainer') THEN 'gym'
    WHEN p_type IN ('education') THEN 'education'
    ELSE 'other'
  END;
$$;

-- Resolves a ?ref= code into attribution fields. Returns NULL fields for
-- unknown codes. Codes: L-xxxx (a lead's own link), P-xxxx (partner),
-- R-<booking_slug> (customer referral), B-<booking_slug> (booking-page footer).
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

-- ============================================================
-- PUBLIC: "call me" form and the no-show loss calculator
-- ============================================================
CREATE OR REPLACE FUNCTION growth_submit_lead(
  p_name text,
  p_phone text,
  p_business_name text DEFAULT NULL,
  p_category text DEFAULT 'clinic',
  p_source text DEFAULT 'contact_form',
  p_details jsonb DEFAULT '{}'::jsonb,
  p_ref text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_phone   text := growth_normalize_phone(p_phone);
  v_name    text := left(btrim(coalesce(p_name, '')), 100);
  v_biz     text := left(btrim(coalesce(p_business_name, '')), 160);
  v_cat     text := CASE WHEN p_category IN ('dental','derma','clinic','salon','gym','education','other') THEN p_category ELSE 'other' END;
  v_details jsonb := CASE WHEN jsonb_typeof(p_details) = 'object' AND length(p_details::text) <= 2000 THEN p_details ELSE '{}'::jsonb END;
  v_ref     record;
  v_lead    growth_leads%ROWTYPE;
  v_label   text;
BEGIN
  IF p_source NOT IN ('contact_form','loss_calculator') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_source');
  END IF;
  IF v_phone IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_phone');
  END IF;
  IF char_length(v_name) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_name');
  END IF;
  -- Flood guard for a public endpoint: at most 60 inbound requests an hour site-wide.
  IF (SELECT count(*) FROM growth_activities WHERE kind = 'inbound' AND created_at > now() - interval '1 hour') >= 60 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'busy');
  END IF;

  v_label := CASE p_source WHEN 'loss_calculator' THEN 'استخدم حاسبة خسارة الغياب وساب رقمه' ELSE 'ساب رقمه في فورم «كلّمني»' END;
  SELECT * INTO v_ref FROM growth_resolve_ref(p_ref);

  SELECT * INTO v_lead FROM growth_leads WHERE phone = v_phone;
  IF FOUND THEN
    -- Same number twice within 10 minutes = a double submit, not a new request.
    IF v_lead.inbound_at IS NOT NULL AND v_lead.inbound_at > now() - interval '10 minutes' THEN
      RETURN jsonb_build_object('ok', true);
    END IF;
    UPDATE growth_leads
    SET inbound_at = now(),
        next_follow_up_at = now(),
        contact_person = coalesce(contact_person, v_name)
    WHERE id = v_lead.id;
  ELSE
    INSERT INTO growth_leads (name, category, contact_person, phone, phone_raw, source, partner_id,
                              referrer_business_id, stage, inbound_at, next_follow_up_at)
    VALUES (coalesce(nullif(v_biz, ''), v_name), v_cat, v_name, v_phone, left(p_phone, 40), p_source,
            v_ref.partner_id, v_ref.referrer_business_id, 'new', now(), now())
    RETURNING * INTO v_lead;
  END IF;

  PERFORM growth_add_signal(v_lead.id, 'inbound_' || p_source, 'fact', v_label);
  INSERT INTO growth_activities (lead_id, kind, body, meta)
  VALUES (v_lead.id, 'inbound', v_label, jsonb_build_object('details', v_details, 'ref', left(p_ref, 80)));

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ============================================================
-- PUBLIC: personalised demo page (/demo/:code) — only what the page shows
-- ============================================================
CREATE OR REPLACE FUNCTION growth_get_preview(p_code text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'name', l.name,
    'category', l.category,
    'area', l.area,
    'specialty', coalesce(l.preview->>'specialty', l.specialty),
    'color', l.preview->>'color',
    'services', coalesce(l.preview->'services', '[]'::jsonb),
    'ref', l.ref_code
  )
  FROM growth_leads l
  WHERE l.ref_code = upper(btrim(p_code))
    AND coalesce((l.preview->>'enabled')::boolean, false)
    AND l.stage <> 'do_not_contact';
$$;

-- ============================================================
-- AUTHENTICATED: link the signed-in owner's new business to the lead/partner/
-- referrer that brought them. Called once onboarding finishes.
-- ============================================================
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

-- ============================================================
-- SERVICE ROLE: daily sync from the product into the pipeline
--   · every business gets a lead (organic signups included) and its stage
--     follows the trial/subscription status
--   · trials ending within 3 days are flagged and put in today's queue
--   · accounts that signed up but never created a business become leads
-- ============================================================
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

-- ============================================================
-- SERVICE ROLE: bulk import (CSV, Google Maps). Skips duplicates by phone,
-- Google place id, or same name in the same area. Returns counts.
-- ============================================================
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
      CASE WHEN p_source IN ('import','google_maps_manual','google_maps_api','facebook_group','google_ads','manual')
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

-- ============================================================
-- SERVICE ROLE: log a contact attempt and move the lead through the pipeline.
-- ============================================================
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

-- ============================================================
-- SERVICE ROLE: Google Places daily budget. Returns true and counts the call
-- if today's cap isn't reached yet.
-- ============================================================
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

-- ------------------------------------------------------------
-- Who may call what. Functions are executable by PUBLIC by default.
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION growth_add_signal(uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_resolve_ref(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_sync_platform() FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_import_leads(jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_log_activity(uuid, text, text, text, text, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_take_places_quota() FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_submit_lead(text, text, text, text, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_get_preview(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_attribute_signup(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION growth_sync_platform() TO service_role;
GRANT EXECUTE ON FUNCTION growth_import_leads(jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION growth_log_activity(uuid, text, text, text, text, timestamptz, text) TO service_role;
GRANT EXECUTE ON FUNCTION growth_take_places_quota() TO service_role;
GRANT EXECUTE ON FUNCTION growth_submit_lead(text, text, text, text, text, jsonb, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION growth_get_preview(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION growth_attribute_signup(text) TO authenticated;

-- ------------------------------------------------------------
-- Nightly sync at 03:00 Cairo (01:00 UTC). Guarded: only if pg_cron exists.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('growth-sync-platform', '0 1 * * *', 'SELECT growth_sync_platform()');
  END IF;
END;
$$;
