-- ============================================================
-- GROWTH ENGINE v7 — a fresh call list every day, Overture Maps as a source,
-- list clean-up, partner login & payouts, referral rewards you can grant
-- ============================================================
-- Only touches growth_* objects, plus businesses.trial_ends_at when the owner
-- grants a referral reward by hand.
--
-- 1. growth_daily_list: the cold part of each day's call list is picked once
--    and saved. Tomorrow's list is new; what wasn't called goes back to the
--    pool and can't be picked again for daily_cooldown_days. Hot leads and
--    follow-ups aren't stored — they are computed live, so nothing urgent is
--    ever wiped with the old list.
-- 2. growth_runs: what each automatic run did, so the screen can show whether
--    the automation is really working.
-- 3. Overture Maps (open data) as lead source 'overture'.
-- 4. archived_at: clean-up hides a lead but keeps the row, so the weekly import
--    doesn't bring it back, and it can be restored.
-- 5. no answer: retries after 1, 3, 7 days, then the lead is closed.
-- 6. Partners: phone + PIN login, payout details, pay-all. Commissions can only
--    move along allowed steps. A clinic that pays counts as real. A partner's
--    own clinic earns nothing.
-- 7. Referral rewards are rows with a status; granting one extends the
--    referrer's subscription. Customers see their own referral counts.
--
-- Rollback: supabase/rollbacks/038_growth_daily_partners_down.sql.

-- ------------------------------------------------------------
-- Columns
-- ------------------------------------------------------------
ALTER TABLE growth_leads
  ADD COLUMN IF NOT EXISTS lat             double precision,
  ADD COLUMN IF NOT EXISTS lng             double precision,
  ADD COLUMN IF NOT EXISTS overture_id     text UNIQUE,
  ADD COLUMN IF NOT EXISTS archived_at     timestamptz,
  ADD COLUMN IF NOT EXISTS archived_reason text,
  ADD COLUMN IF NOT EXISTS last_listed_on  date,
  ADD COLUMN IF NOT EXISTS times_listed    int NOT NULL DEFAULT 0;

ALTER TABLE growth_leads DROP CONSTRAINT IF EXISTS growth_leads_source_check;
ALTER TABLE growth_leads ADD CONSTRAINT growth_leads_source_check CHECK (source IN (
                         'signup_incomplete','organic_signup','contact_form','loss_calculator',
                         'referral','booking_footer','partner','google_ads',
                         'google_maps_manual','google_maps_api','openstreetmap','overture','facebook_group','import','manual'));

ALTER TABLE growth_settings
  ADD COLUMN IF NOT EXISTS daily_new_calls     int NOT NULL DEFAULT 30  CHECK (daily_new_calls BETWEEN 1 AND 500),
  ADD COLUMN IF NOT EXISTS daily_cooldown_days int NOT NULL DEFAULT 14  CHECK (daily_cooldown_days BETWEEN 1 AND 365),
  ADD COLUMN IF NOT EXISTS pool_target         int NOT NULL DEFAULT 300 CHECK (pool_target BETWEEN 0 AND 3000),
  ADD COLUMN IF NOT EXISTS max_no_answer       int NOT NULL DEFAULT 4   CHECK (max_no_answer BETWEEN 1 AND 20),
  -- Google's free allowance is per month, so the budget that protects you from
  -- a bill is monthly. 900 stays under the 1,000 free requests.
  ADD COLUMN IF NOT EXISTS places_monthly_cap  int NOT NULL DEFAULT 900 CHECK (places_monthly_cap BETWEEN 0 AND 100000),
  ADD COLUMN IF NOT EXISTS places_month        text,
  ADD COLUMN IF NOT EXISTS places_month_count  int NOT NULL DEFAULT 0;

ALTER TABLE growth_partners
  ADD COLUMN IF NOT EXISTS payout_method    text CHECK (payout_method IN ('vodafone_cash','instapay','bank','cash','other')),
  ADD COLUMN IF NOT EXISTS payout_account   text,
  ADD COLUMN IF NOT EXISTS pin_hash         text,
  ADD COLUMN IF NOT EXISTS pin_salt         text,
  ADD COLUMN IF NOT EXISTS pin_failed       int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pin_locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS pin_set_at       timestamptz;

-- ------------------------------------------------------------
-- New tables. RLS on with no policies, like every growth_* table.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS growth_daily_list (
  day        date NOT NULL,
  lead_id    uuid NOT NULL REFERENCES growth_leads(id) ON DELETE CASCADE,
  position   int  NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, lead_id)
);
ALTER TABLE growth_daily_list ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON growth_daily_list FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS growth_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  trigger     text NOT NULL DEFAULT 'schedule',
  ok          boolean,
  summary     jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS growth_runs_started_idx ON growth_runs (started_at DESC);
ALTER TABLE growth_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON growth_runs FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS growth_referral_rewards (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  referrer_business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  lead_id              uuid NOT NULL UNIQUE REFERENCES growth_leads(id) ON DELETE CASCADE,
  days                 int  NOT NULL DEFAULT 30 CHECK (days BETWEEN 1 AND 365),
  status               text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','granted','rejected')),
  decided_at           timestamptz,
  note                 text
);
CREATE INDEX IF NOT EXISTS growth_referral_rewards_referrer_idx ON growth_referral_rewards (referrer_business_id);
ALTER TABLE growth_referral_rewards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON growth_referral_rewards FROM anon, authenticated;

-- ------------------------------------------------------------
-- A hidden lead comes back on its own the moment the person shows up: they
-- signed up, or they filled the "call me" form.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION growth_unarchive_on_return()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.archived_at IS NOT NULL AND OLD.archived_at IS NOT NULL
     AND (NEW.business_id IS DISTINCT FROM OLD.business_id OR NEW.inbound_at IS DISTINCT FROM OLD.inbound_at) THEN
    NEW.archived_at := NULL;
    NEW.archived_reason := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS growth_leads_unarchive ON growth_leads;
CREATE TRIGGER growth_leads_unarchive BEFORE UPDATE ON growth_leads
  FOR EACH ROW EXECUTE FUNCTION growth_unarchive_on_return();

-- ============================================================
-- SERVICE ROLE: import, now with Overture rows (coordinates + stable id).
-- Hidden leads still count as "already there", on purpose.
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
  v_over    text;
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
    v_over  := nullif(btrim(coalesce(r->>'overture_id', '')), '');
    v_area  := nullif(btrim(coalesce(r->>'area', '')), '');
    IF v_name = '' THEN invalid := invalid + 1; CONTINUE; END IF;

    IF EXISTS (
      SELECT 1 FROM growth_leads l
      WHERE (v_phone IS NOT NULL AND l.phone = v_phone)
         OR (v_place IS NOT NULL AND l.google_place_id = v_place)
         OR (v_over  IS NOT NULL AND l.overture_id = v_over)
         OR (lower(l.name) = lower(v_name) AND coalesce(l.area, '') = coalesce(v_area, '') AND v_area IS NOT NULL)
    ) THEN
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO growth_leads (
      name, category, specialty, contact_person, city, area, address, phone, phone_raw, email,
      website, instagram, facebook, google_maps_url, google_place_id, overture_id, lat, lng,
      google_rating, google_reviews_count, has_online_booking, source, source_detail, notes, signals
    ) VALUES (
      v_name,
      CASE WHEN r->>'category' IN ('dental','derma','clinic','salon','gym','education','other') THEN r->>'category' ELSE 'clinic' END,
      nullif(r->>'specialty', ''), nullif(r->>'contact_person', ''), nullif(r->>'city', ''), v_area,
      nullif(r->>'address', ''), v_phone, nullif(left(r->>'phone', 40), ''), nullif(r->>'email', ''),
      nullif(r->>'website', ''), nullif(r->>'instagram', ''), nullif(r->>'facebook', ''),
      nullif(r->>'google_maps_url', ''), v_place, v_over,
      CASE WHEN (r->>'lat') ~ '^-?[0-9]{1,3}(\.[0-9]+)?$' THEN (r->>'lat')::double precision END,
      CASE WHEN (r->>'lng') ~ '^-?[0-9]{1,3}(\.[0-9]+)?$' THEN (r->>'lng')::double precision END,
      CASE WHEN (r->>'google_rating') ~ '^[0-9](\.[0-9])?$' THEN (r->>'google_rating')::numeric END,
      CASE WHEN (r->>'google_reviews_count') ~ '^[0-9]{1,7}$' THEN (r->>'google_reviews_count')::int END,
      CASE WHEN r->>'has_online_booking' IN ('true','false') THEN (r->>'has_online_booking')::boolean END,
      CASE WHEN p_source IN ('import','google_maps_manual','google_maps_api','openstreetmap','overture','facebook_group','google_ads','manual')
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
-- SERVICE ROLE: save the day's list (ids chosen by pickDailyLeads() in
-- src/lib/growth/dailyList.js, by the morning job or the first dashboard open).
--   ensure   only if today has no list yet (first writer wins)
--   append   add more to today's list
--   rebuild  swap today's list; rows already worked stay, the rest go back to
--            the pool as if they had never been listed
-- ============================================================
CREATE OR REPLACE FUNCTION growth_set_daily_list(p_day date, p_lead_ids uuid[], p_mode text DEFAULT 'ensure')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_added int := 0;
  v_next  int;
BEGIN
  IF p_mode NOT IN ('ensure','append','rebuild') THEN RAISE EXCEPTION 'bad mode'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('growth_daily_list'));

  IF p_mode = 'ensure' AND EXISTS (SELECT 1 FROM growth_daily_list WHERE day = p_day) THEN
    RETURN jsonb_build_object('added', 0, 'total', (SELECT count(*) FROM growth_daily_list WHERE day = p_day));
  END IF;

  IF p_mode = 'rebuild' THEN
    WITH gone AS (
      DELETE FROM growth_daily_list d USING growth_leads l
      WHERE d.day = p_day AND l.id = d.lead_id AND l.stage = 'new' AND l.last_contacted_at IS NULL
      RETURNING d.lead_id
    )
    UPDATE growth_leads l SET last_listed_on = NULL, times_listed = greatest(times_listed - 1, 0)
    FROM gone WHERE l.id = gone.lead_id;
  END IF;

  SELECT coalesce(max(position), 0) INTO v_next FROM growth_daily_list WHERE day = p_day;

  WITH wanted AS (
    SELECT l.id, row_number() OVER (ORDER BY array_position(p_lead_ids, l.id)) AS rn
    FROM growth_leads l
    WHERE l.id = ANY(p_lead_ids)
      AND l.stage = 'new' AND l.phone IS NOT NULL AND NOT l.is_test AND l.archived_at IS NULL
  ), added AS (
    INSERT INTO growth_daily_list (day, lead_id, position)
    SELECT p_day, id, v_next + rn FROM wanted
    ON CONFLICT DO NOTHING
    RETURNING lead_id
  ), touched AS (
    UPDATE growth_leads l SET last_listed_on = p_day, times_listed = times_listed + 1
    FROM added WHERE l.id = added.lead_id
    RETURNING l.id
  )
  SELECT count(*) INTO v_added FROM touched;

  DELETE FROM growth_daily_list WHERE day < p_day - 60;

  RETURN jsonb_build_object('added', v_added, 'total', (SELECT count(*) FROM growth_daily_list WHERE day = p_day));
END;
$$;

-- ============================================================
-- SERVICE ROLE: log a contact attempt. Same as 032, except "no answer": try
-- again after 1, then 3, then 7 days, and after max_no_answer tries close the
-- lead as no_response so it stops coming back forever. An explicit date wins,
-- and trial/paid customers are never closed by this.
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
  v_tries     int;
  v_max       int;
  v_closed    boolean := false;
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
        SELECT count(*) + 1 INTO v_tries FROM growth_activities WHERE lead_id = p_lead_id AND outcome = 'no_answer';
        SELECT max_no_answer INTO v_max FROM growth_settings WHERE id = 1;
        IF p_next_follow_up_at IS NULL AND v_tries >= v_max AND v_stage IN ('contacted','follow_up') THEN
          v_stage := 'lost'; v_next := NULL; v_closed := true;
        ELSE
          v_next := coalesce(p_next_follow_up_at, now() + CASE v_tries WHEN 1 THEN interval '1 day' WHEN 2 THEN interval '3 days' ELSE interval '7 days' END);
        END IF;
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
    lost_reason       = CASE WHEN p_outcome IN ('not_interested','wrong_number') THEN p_outcome
                             WHEN v_closed THEN 'no_response' ELSE lost_reason END,
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
-- SERVICE ROLE: Google Places budget, per day and per month.
-- ============================================================
CREATE OR REPLACE FUNCTION growth_take_places_quota()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Africa/Cairo')::date;
  v_month text := to_char(now() AT TIME ZONE 'Africa/Cairo', 'YYYY-MM');
  v_ok    boolean;
BEGIN
  UPDATE growth_settings SET
    places_calls_count = CASE WHEN places_calls_date = v_today THEN places_calls_count + 1 ELSE 1 END,
    places_calls_date  = v_today,
    places_month_count = CASE WHEN places_month = v_month THEN places_month_count + 1 ELSE 1 END,
    places_month       = v_month
  WHERE id = 1
    AND (places_calls_date IS DISTINCT FROM v_today OR places_calls_count < places_daily_cap)
    AND (places_month IS DISTINCT FROM v_month OR places_month_count < places_monthly_cap)
    AND places_daily_cap > 0 AND places_monthly_cap > 0
  RETURNING true INTO v_ok;
  RETURN coalesce(v_ok, false);
END;
$$;

-- ============================================================
-- SERVICE ROLE: bulk clean-up from «كل العملاء».
-- A lead linked to a business, or with commission rows, can't be hidden: it's
-- a customer or a money record.
-- ============================================================
CREATE OR REPLACE FUNCTION growth_bulk_leads(p_ids uuid[], p_op text, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_done int := 0;
BEGIN
  IF coalesce(array_length(p_ids, 1), 0) > 2000 THEN RAISE EXCEPTION 'too many rows'; END IF;

  IF p_op = 'archive' THEN
    UPDATE growth_leads l SET archived_at = now(), archived_reason = left(p_reason, 200)
    WHERE l.id = ANY(p_ids) AND l.archived_at IS NULL AND l.business_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM growth_commissions c WHERE c.lead_id = l.id);
  ELSIF p_op = 'restore' THEN
    UPDATE growth_leads SET archived_at = NULL, archived_reason = NULL WHERE id = ANY(p_ids) AND archived_at IS NOT NULL;
  ELSIF p_op = 'mark_test' THEN
    UPDATE growth_leads SET is_test = true WHERE id = ANY(p_ids) AND NOT is_test;
  ELSIF p_op = 'mark_lost' THEN
    UPDATE growth_leads SET stage = 'lost', lost_reason = coalesce(left(p_reason, 200), lost_reason), next_follow_up_at = NULL
    WHERE id = ANY(p_ids) AND stage NOT IN ('trial','paid','do_not_contact','lost');
  ELSE
    RAISE EXCEPTION 'bad op';
  END IF;
  GET DIAGNOSTICS v_done = ROW_COUNT;
  RETURN jsonb_build_object('done', v_done, 'skipped', coalesce(array_length(p_ids, 1), 0) - v_done);
END;
$$;

-- ============================================================
-- "Real clinic" check: as 033, plus the owner number can't be the partner's.
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
  v_own    boolean;
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

  v_own := v_owner IS NOT NULL AND EXISTS (
    SELECT 1 FROM growth_leads l JOIN growth_partners p ON p.id = l.partner_id
    WHERE l.business_id = p_business_id AND growth_normalize_phone(p.phone) = v_owner
  );

  RETURN jsonb_build_object(
    'qualified', v_appts >= s.qualify_min_appointments AND v_clients >= s.qualify_min_clients AND NOT v_shared AND NOT v_own,
    'appointments', v_appts,
    'clients', v_clients,
    'shared_owner_phone', v_shared,
    'partner_own_number', v_own,
    'need_appointments', s.qualify_min_appointments,
    'need_clients', s.qualify_min_clients
  );
END;
$$;

-- ============================================================
-- Everything a lead has earned so far. Idempotent; runs on every sync.
--   · paying proves the clinic is real, so the signup bonus isn't skipped
--   · a partner's own clinic earns nothing (the reason goes on the timeline)
--   · a customer earns a reward row when someone they referred pays — unless
--     it's the same owner number, or the referrer is a test account
-- ============================================================
CREATE OR REPLACE FUNCTION growth_accrue_commissions(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  l        growth_leads%ROWTYPE;
  p        growth_partners%ROWTYPE;
  b        businesses%ROWTYPE;
  s        growth_settings%ROWTYPE;
  v_owner  text;
  v_days   numeric;
  v_months int;
  v_price  numeric;
BEGIN
  SELECT * INTO l FROM growth_leads WHERE id = p_lead_id;
  IF NOT FOUND OR l.is_test THEN RETURN; END IF;

  IF l.business_id IS NOT NULL THEN
    SELECT * INTO b FROM businesses WHERE id = l.business_id;
    v_owner := growth_normalize_phone(coalesce(b.owner_phone, b.phone));
  END IF;

  IF l.stage = 'paid' AND l.qualified_at IS NULL THEN
    UPDATE growth_leads SET qualified_at = now(), qualified_by = 'auto' WHERE id = l.id RETURNING * INTO l;
    INSERT INTO growth_activities (lead_id, kind, body, meta)
    VALUES (l.id, 'system', 'اتأكدت إنها عيادة حقيقية: دفعت اشتراك', jsonb_build_object('reason', 'paid'));
  END IF;

  IF l.partner_id IS NOT NULL THEN
    SELECT * INTO p FROM growth_partners WHERE id = l.partner_id;
    IF v_owner IS NOT NULL AND growth_normalize_phone(p.phone) = v_owner THEN
      IF NOT EXISTS (SELECT 1 FROM growth_activities WHERE lead_id = l.id AND meta->>'reason' = 'partner_own_number') THEN
        INSERT INTO growth_activities (lead_id, kind, body, meta)
        VALUES (l.id, 'system', 'مفيش عمولة: رقم صاحب العيادة هو نفس رقم الشريك', jsonb_build_object('reason', 'partner_own_number'));
      END IF;
    ELSE
      IF l.qualified_at IS NOT NULL AND p.signup_bonus_egp > 0 THEN
        INSERT INTO growth_commissions (partner_id, lead_id, kind, amount_egp, basis)
        VALUES (p.id, l.id, 'signup_bonus', p.signup_bonus_egp,
                'عيادة حقيقية اتأكدنا منها (' || CASE WHEN l.qualified_by = 'admin' THEN 'يدوي' WHEN l.stage = 'paid' THEN 'دفعت اشتراك' ELSE 'حجوزات حقيقية' END || ')')
        ON CONFLICT (lead_id, kind) DO NOTHING;
      END IF;

      IF l.stage = 'paid' AND p.commission_pct > 0 AND l.business_id IS NOT NULL THEN
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
    END IF;
  END IF;

  IF l.stage = 'paid' AND l.referrer_business_id IS NOT NULL AND l.referrer_business_id IS DISTINCT FROM l.business_id
     AND NOT EXISTS (SELECT 1 FROM growth_leads x WHERE x.business_id = l.referrer_business_id AND x.is_test)
     AND NOT EXISTS (
       SELECT 1 FROM businesses r
       WHERE r.id = l.referrer_business_id AND v_owner IS NOT NULL
         AND growth_normalize_phone(coalesce(r.owner_phone, r.phone)) = v_owner
     ) THEN
    INSERT INTO growth_referral_rewards (referrer_business_id, lead_id)
    VALUES (l.referrer_business_id, l.id)
    ON CONFLICT (lead_id) DO NOTHING;
  END IF;
END;
$$;

-- ============================================================
-- SERVICE ROLE: commission status, along allowed steps only.
--   pending → approved | rejected
--   approved → paid | rejected | pending
--   rejected → pending
--   paid → approved   (undo a wrong click)
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
  SELECT * INTO c FROM growth_commissions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commission not found'; END IF;
  IF NOT ((c.status = 'pending'  AND p_status IN ('approved','rejected'))
       OR (c.status = 'approved' AND p_status IN ('paid','rejected','pending'))
       OR (c.status = 'rejected' AND p_status = 'pending')
       OR (c.status = 'paid'     AND p_status = 'approved')) THEN
    RAISE EXCEPTION 'الحالة دي مش مسموحة من «%» لـ «%»', c.status, p_status;
  END IF;
  UPDATE growth_commissions SET
    status     = p_status,
    decided_at = CASE WHEN p_status IN ('approved','rejected') THEN now() ELSE decided_at END,
    paid_at    = CASE WHEN p_status = 'paid' THEN now() ELSE NULL END,
    note       = coalesce(p_note, note)
  WHERE id = p_id
  RETURNING * INTO c;
  RETURN c;
END;
$$;

-- SERVICE ROLE: "I paid this partner": every approved amount becomes paid at once.
CREATE OR REPLACE FUNCTION growth_pay_partner(p_partner_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count int;
  v_total numeric;
BEGIN
  WITH paid AS (
    UPDATE growth_commissions SET status = 'paid', paid_at = now(), note = coalesce(p_note, note)
    WHERE partner_id = p_partner_id AND status = 'approved'
    RETURNING amount_egp
  )
  SELECT count(*), coalesce(sum(amount_egp), 0) INTO v_count, v_total FROM paid;
  RETURN jsonb_build_object('count', v_count, 'total', v_total);
END;
$$;

-- ============================================================
-- Partner login: phone + 6-digit PIN → their secret dashboard token.
-- The PIN is stored salted and hashed, shown to the owner only when generated.
-- Five wrong tries lock that partner's login for 15 minutes. Every failure
-- returns the same answer, so it can't be used to discover who is a partner.
-- ============================================================
CREATE OR REPLACE FUNCTION growth_set_partner_pin(p_partner_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pin  text := lpad((('x' || substr(md5(gen_random_uuid()::text), 1, 8))::bit(32)::bigint % 1000000)::text, 6, '0');
  v_salt text := md5(gen_random_uuid()::text);
BEGIN
  UPDATE growth_partners SET
    pin_salt = v_salt,
    pin_hash = encode(sha256(convert_to(v_salt || v_pin, 'UTF8')), 'hex'),
    pin_failed = 0, pin_locked_until = NULL, pin_set_at = now()
  WHERE id = p_partner_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'partner not found'; END IF;
  RETURN v_pin;
END;
$$;

CREATE OR REPLACE FUNCTION growth_partner_login(p_phone text, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_phone text := growth_normalize_phone(p_phone);
  p       growth_partners%ROWTYPE;
BEGIN
  IF v_phone IS NULL OR coalesce(p_pin, '') !~ '^[0-9]{6}$' THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  FOR p IN SELECT * FROM growth_partners WHERE phone = v_phone AND pin_hash IS NOT NULL FOR UPDATE LOOP
    CONTINUE WHEN p.pin_locked_until IS NOT NULL AND p.pin_locked_until > now();
    IF encode(sha256(convert_to(p.pin_salt || p_pin, 'UTF8')), 'hex') = p.pin_hash THEN
      UPDATE growth_partners SET pin_failed = 0, pin_locked_until = NULL WHERE id = p.id;
      RETURN jsonb_build_object('ok', true, 'token', p.access_token);
    END IF;
    UPDATE growth_partners SET
      pin_failed = CASE WHEN p.pin_failed + 1 >= 5 THEN 0 ELSE p.pin_failed + 1 END,
      pin_locked_until = CASE WHEN p.pin_failed + 1 >= 5 THEN now() + interval '15 minutes' ELSE NULL END
    WHERE id = p.id;
  END LOOP;
  RETURN jsonb_build_object('ok', false);
END;
$$;

-- SERVICE ROLE: a partner's link leaked → the old one stops working at once.
CREATE OR REPLACE FUNCTION growth_rotate_partner_token(p_partner_id uuid)
RETURNS growth_partners
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  p growth_partners%ROWTYPE;
BEGIN
  UPDATE growth_partners SET access_token = gen_random_uuid() WHERE id = p_partner_id RETURNING * INTO p;
  IF NOT FOUND THEN RAISE EXCEPTION 'partner not found'; END IF;
  RETURN p;
END;
$$;

-- ============================================================
-- PUBLIC (secret token): a partner's dashboard. As 033, plus how far each
-- signed-up clinic is from counting as real (counts only — no patient or
-- contact data), their payout details, and the public plan prices so the page
-- can say exactly what they'd earn.
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
      'signup_bonus_egp', p.signup_bonus_egp, 'commission_pct', p.commission_pct,
      'payout_method', p.payout_method, 'payout_account', p.payout_account),
    'plan_prices', (SELECT plan_prices FROM growth_settings WHERE id = 1),
    'clinics', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'name', l.name,
               'joined_at', coalesce(l.trial_started_at, l.created_at),
               'status', CASE WHEN l.stage = 'paid' THEN 'paid'
                              WHEN l.qualified_at IS NOT NULL THEN 'qualified'
                              WHEN l.business_id IS NOT NULL THEN 'registered'
                              ELSE 'lead' END,
               'progress', CASE WHEN l.business_id IS NOT NULL AND l.qualified_at IS NULL AND l.stage <> 'paid'
                                THEN (SELECT jsonb_build_object(
                                        'appointments', c->'appointments', 'clients', c->'clients',
                                        'need_appointments', c->'need_appointments', 'need_clients', c->'need_clients')
                                      FROM growth_qualify_check(l.business_id) AS c) END)
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
-- SERVICE ROLE: grant or refuse a referral reward. Granting adds the days to
-- the referrer's subscription, from today or from its end if still running.
-- ============================================================
CREATE OR REPLACE FUNCTION growth_decide_referral_reward(p_id uuid, p_status text, p_note text DEFAULT NULL)
RETURNS growth_referral_rewards
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r growth_referral_rewards%ROWTYPE;
BEGIN
  IF p_status NOT IN ('granted','rejected') THEN RAISE EXCEPTION 'bad status'; END IF;
  SELECT * INTO r FROM growth_referral_rewards WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'reward not found'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'الجايزة دي اتحسمت قبل كده'; END IF;

  IF p_status = 'granted' THEN
    UPDATE businesses SET
      trial_ends_at = greatest(coalesce(trial_ends_at, now()), now()) + make_interval(days => r.days),
      is_active = true
    WHERE id = r.referrer_business_id;
  END IF;

  UPDATE growth_referral_rewards SET status = p_status, decided_at = now(), note = coalesce(p_note, note)
  WHERE id = p_id
  RETURNING * INTO r;
  RETURN r;
END;
$$;

-- AUTHENTICATED: a customer's own referral numbers, for Settings. Counts only,
-- never the names of the clinics they referred.
CREATE OR REPLACE FUNCTION growth_my_referrals()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_biz uuid;
BEGIN
  SELECT id INTO v_biz FROM businesses WHERE owner_id = auth.uid() ORDER BY created_at LIMIT 1;
  IF v_biz IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'signed_up', (SELECT count(*) FROM growth_leads WHERE referrer_business_id = v_biz AND business_id IS NOT NULL AND NOT is_test),
    'paid', (SELECT count(*) FROM growth_leads WHERE referrer_business_id = v_biz AND stage = 'paid' AND NOT is_test),
    'pending_rewards', (SELECT count(*) FROM growth_referral_rewards WHERE referrer_business_id = v_biz AND status = 'pending'),
    'granted_rewards', (SELECT count(*) FROM growth_referral_rewards WHERE referrer_business_id = v_biz AND status = 'granted'),
    'free_days', (SELECT coalesce(sum(days), 0) FROM growth_referral_rewards WHERE referrer_business_id = v_biz AND status = 'granted')
  );
END;
$$;

-- ------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION growth_unarchive_on_return() FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_import_leads(jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_set_daily_list(date, uuid[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_log_activity(uuid, text, text, text, text, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_take_places_quota() FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_bulk_leads(uuid[], text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_qualify_check(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_accrue_commissions(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_set_commission_status(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_pay_partner(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_set_partner_pin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_partner_login(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_rotate_partner_token(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_partner_dashboard(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_decide_referral_reward(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_my_referrals() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION growth_import_leads(jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION growth_set_daily_list(date, uuid[], text) TO service_role;
GRANT EXECUTE ON FUNCTION growth_log_activity(uuid, text, text, text, text, timestamptz, text) TO service_role;
GRANT EXECUTE ON FUNCTION growth_take_places_quota() TO service_role;
GRANT EXECUTE ON FUNCTION growth_bulk_leads(uuid[], text, text) TO service_role;
GRANT EXECUTE ON FUNCTION growth_qualify_check(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION growth_set_commission_status(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION growth_pay_partner(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION growth_set_partner_pin(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION growth_partner_login(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION growth_rotate_partner_token(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION growth_partner_dashboard(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION growth_decide_referral_reward(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION growth_my_referrals() TO authenticated, service_role;
GRANT ALL ON growth_daily_list, growth_runs, growth_referral_rewards TO service_role;
