-- The desk runs the periods, and the line follows who actually came.
--
-- 1. Two periods back to back (one ends 17:55, the next starts 18:00): the
--    screen moved to the evening at 18:00 by the clock while the first period's
--    patients were still waiting, and an evening number 1 read "your turn".
--    Now:
--      queue_days               the desk's state for one branch and day: the
--                               period it started, the ones it ended, and a
--                               note shown on the waiting-room screen. A new
--                               day starts empty, so the note clears itself.
--      front_desk_period()      «ابدأ الفترة» / «خلّص الفترة». Ending a period
--                               marks whoever never arrived as ما جاش.
--      front_desk_note()        the screen's note, written by the desk.
--      front_desk_day()         the desk reads that state.
--      public_queue_screen()    shows the started period; else the earliest
--                               one with someone inside or arrived and still
--                               waiting; else the period by the clock (ended
--                               ones skipped). Returns the note, the periods
--                               with their names, and every waiting number
--                               with how many are ahead and how many of those
--                               haven't arrived (numbers only, never names).
--      queue_ahead()            who is ahead of a patient: inside, then the same
--                               period by number, and now the earlier periods'
--                               patients too: those who arrived, plus the ones
--                               still expected while that period's time lasts.
--      patients_ahead()         counts queue_ahead(); patient_page() adds how
--                               many of them haven't arrived ("coming").
--
-- 2. Numbers 1-6 didn't come and 9 was called: «رجّعه 3» sent a late patient
--    behind three people who weren't there either. Now:
--      queue_place_after()      a place N patients further back, counting only
--                               those who arrived when the desk marks arrivals
--                               (all of them, as before, when it doesn't).
--      front_desk_push_back()   uses it.
--      queue_late_arrival       a patient marked «وصل» after a higher number in
--                               their period was already called goes in after
--                               3 of those who arrived, like «رجّعه 3».
--
-- Additive: a new table and functions; patients_ahead, patient_page,
-- public_queue_screen and front_desk_push_back recreated with the same
-- signatures. Safe to run again.
-- Rollback: supabase/rollbacks/065_queue_period_control_down.sql.

CREATE TABLE IF NOT EXISTS queue_days (
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  day date NOT NULL,
  current_period time,
  ended_periods time[] NOT NULL DEFAULT '{}',
  note text CHECK (note IS NULL OR char_length(note) <= 200),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS queue_days_key
  ON queue_days (business_id, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), day);
-- Written only through the functions below; the owner may read their own.
ALTER TABLE queue_days ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS queue_days_owner_select ON queue_days;
CREATE POLICY queue_days_owner_select ON queue_days FOR SELECT
  USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));
REVOKE ALL ON queue_days FROM anon;
GRANT SELECT ON queue_days TO authenticated;

-- The day's periods with the names the clinic gave them (NULL = the default
-- name by start time, chosen by the app). Same source as queue_day_periods (064).
CREATE OR REPLACE FUNCTION queue_day_period_list(p_business_id uuid, p_branch_id uuid, p_date date)
RETURNS TABLE (start_time time, end_time time, name text)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_day text := (ARRAY['sun','mon','tue','wed','thu','fri','sat'])[extract(dow FROM p_date)::int + 1];
  v_hours jsonb;
BEGIN
  IF EXISTS (
    SELECT 1 FROM branches br, jsonb_each(coalesce(br.schedule_blocks, '{}'::jsonb)) d
    WHERE br.id = p_branch_id AND jsonb_typeof(d.value) = 'array' AND jsonb_array_length(d.value) > 0
  ) THEN
    RETURN QUERY
      SELECT (blk->>'start')::time, (blk->>'end')::time, nullif(trim(blk->>'name'), '')
      FROM branches br, jsonb_array_elements(coalesce(br.schedule_blocks -> v_day, '[]'::jsonb)) blk
      WHERE br.id = p_branch_id
      ORDER BY 1;
    RETURN;
  END IF;

  SELECT b.working_hours -> v_day INTO v_hours FROM businesses b WHERE b.id = p_business_id;
  IF jsonb_typeof(v_hours) = 'object' AND coalesce((v_hours->>'active')::boolean, false) THEN
    RETURN QUERY
      SELECT (p->>'open')::time, (p->>'close')::time, nullif(trim(p->>'name'), '')
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(v_hours->'periods') = 'array' AND jsonb_array_length(v_hours->'periods') > 0
             THEN v_hours->'periods'
             WHEN v_hours ? 'open' THEN jsonb_build_array(jsonb_build_object('open', v_hours->>'open', 'close', v_hours->>'close'))
             ELSE '[]'::jsonb END) p
      ORDER BY 1;
  END IF;
END;
$$;

-- Whether a period of that day is over by the clinic's clock. A time that is
-- no period counts as over once the day is.
CREATE OR REPLACE FUNCTION queue_period_over(p_business_id uuid, p_branch_id uuid, p_date date, p_start time)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH n AS (
    SELECT (now() AT TIME ZONE business_time_zone(b.country)) AS ts FROM businesses b WHERE b.id = p_business_id
  )
  SELECT coalesce(
    (SELECT (p_date + d.end_time) <= n.ts FROM queue_day_periods(p_business_id, p_branch_id, p_date) d, n
      WHERE d.start_time = p_start LIMIT 1),
    (SELECT p_date < n.ts::date FROM n),
    false)
$$;

-- Who is ahead of a patient today, and whether each of them is at the clinic.
-- Whoever is inside; by turn, the same period by number, and the earlier
-- periods' patients who arrived or are still expected (their period's time
-- isn't over). A time clinic goes by queue_key over the day, as before.
CREATE OR REPLACE FUNCTION queue_ahead(a appointments)
RETURNS TABLE (id uuid, here boolean)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH me AS (
    SELECT CASE WHEN a.queue_number IS NOT NULL
             THEN queue_period_of(a.business_id, a.branch_id, a.appointment_date, a.appointment_time) END AS p
  )
  SELECT x.id, (x.arrived_at IS NOT NULL OR x.called_at IS NOT NULL)
  FROM appointments x, me
  WHERE a.called_at IS NULL
    AND x.business_id = a.business_id
    AND x.appointment_date = a.appointment_date
    AND x.status = 'confirmed'
    AND x.id <> a.id
    AND (a.branch_id IS NULL OR x.branch_id IS NULL OR x.branch_id = a.branch_id)
    AND (x.called_at IS NOT NULL OR (
      CASE WHEN me.p IS NOT NULL AND x.queue_number IS NOT NULL THEN (
        CASE
          WHEN queue_period_of(x.business_id, x.branch_id, x.appointment_date, x.appointment_time) = me.p
            THEN (queue_period_key(x), x.created_at) < (queue_period_key(a), a.created_at)
          WHEN queue_period_of(x.business_id, x.branch_id, x.appointment_date, x.appointment_time) < me.p
            THEN x.arrived_at IS NOT NULL OR NOT queue_period_over(x.business_id, x.branch_id, x.appointment_date,
                   queue_period_of(x.business_id, x.branch_id, x.appointment_date, x.appointment_time))
          ELSE false END)
      ELSE (queue_key(x), x.created_at) < (queue_key(a), a.created_at) END
    ))
$$;

CREATE OR REPLACE FUNCTION patients_ahead(a appointments)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN a.called_at IS NOT NULL THEN 0 ELSE (SELECT count(*)::int FROM queue_ahead(a)) END
$$;

-- Of those ahead, how many haven't arrived yet.
CREATE OR REPLACE FUNCTION patients_ahead_coming(a appointments)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN a.called_at IS NOT NULL THEN 0 ELSE (SELECT count(*)::int FROM queue_ahead(a) q WHERE NOT q.here) END
$$;

-- A place p_steps patients further back in the patient's line (by turn: their
-- period; else the day), as a queue_sort value, or NULL when nobody waits after
-- them. When anyone in that line is marked «وصل», only those count: going back
-- behind patients who aren't there moves nobody.
CREATE OR REPLACE FUNCTION queue_place_after(a appointments, p_steps integer)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_by_period boolean := a.queue_number IS NOT NULL;
  v_period time := CASE WHEN a.queue_number IS NOT NULL
                     THEN queue_period_of(a.business_id, a.branch_id, a.appointment_date, a.appointment_time) END;
  v_key numeric := CASE WHEN a.queue_number IS NOT NULL THEN queue_period_key(a) ELSE queue_key(a) END;
  v_any_here boolean;
  v_all numeric[];
  v_here numeric[];
  v_after numeric[];
  v_target numeric;
  v_next numeric;
BEGIN
  SELECT bool_or(t.here),
         array_agg(t.k ORDER BY t.k, t.c) FILTER (WHERE (t.k, t.c) > (v_key, a.created_at)),
         array_agg(t.k ORDER BY t.k, t.c) FILTER (WHERE t.here AND (t.k, t.c) > (v_key, a.created_at))
  INTO v_any_here, v_all, v_here
  FROM (
    SELECT CASE WHEN v_by_period THEN queue_period_key(x) ELSE queue_key(x) END AS k,
           x.created_at AS c, x.arrived_at IS NOT NULL AS here
    FROM appointments x
    WHERE x.business_id = a.business_id AND x.appointment_date = a.appointment_date
      AND x.branch_id IS NOT DISTINCT FROM a.branch_id
      AND x.status = 'confirmed' AND x.called_at IS NULL AND x.id <> a.id
      AND (NOT v_by_period OR (x.queue_number IS NOT NULL
        AND queue_period_of(x.business_id, x.branch_id, x.appointment_date, x.appointment_time) = v_period))
  ) t;

  v_after := CASE WHEN coalesce(v_any_here, false) THEN v_here ELSE v_all END;
  IF v_after IS NULL THEN RETURN NULL; END IF;
  v_target := v_after[least(greatest(p_steps, 1), array_length(v_after, 1))];
  SELECT min(k) INTO v_next FROM unnest(v_all) k WHERE k > v_target;
  RETURN CASE WHEN v_next IS NOT NULL THEN (v_target + v_next) / 2 ELSE v_target + 0.0001 END;
END;
$$;

-- 058's «رجّعه», counting those who are there.
CREATE OR REPLACE FUNCTION front_desk_push_back(p_appointment_id uuid, p_steps integer DEFAULT 3)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  a appointments%ROWTYPE;
  v_sort numeric;
BEGIN
  SELECT * INTO a FROM appointments WHERE id = p_appointment_id AND status = 'confirmed';
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_WAITING: this patient is not waiting'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'desk|' || a.business_id::text || '|' || coalesce(a.branch_id::text, '') || '|' || a.appointment_date::text, 0));
  SELECT * INTO a FROM appointments WHERE id = p_appointment_id AND status = 'confirmed';
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_WAITING: this patient is not waiting'; END IF;

  v_sort := queue_place_after(a, least(greatest(coalesce(p_steps, 3), 1), 50));
  -- Sent back, they get told again when their turn comes near.
  UPDATE appointments
  SET called_at = NULL, queue_notified_at = NULL, queue_sort = coalesce(v_sort, queue_sort)
  WHERE id = a.id;
END;
$$;

-- «وصل» after their turn passed (a higher number in the period was called):
-- in after 3 of those who are there, as «رجّعه 3» would.
CREATE OR REPLACE FUNCTION queue_late_arrival()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sort numeric;
BEGIN
  IF OLD.arrived_at IS NULL AND NEW.arrived_at IS NOT NULL
     AND NEW.status = 'confirmed' AND NEW.called_at IS NULL AND NEW.queue_number IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM appointments x
       WHERE x.business_id = NEW.business_id AND x.appointment_date = NEW.appointment_date
         AND x.branch_id IS NOT DISTINCT FROM NEW.branch_id AND x.id <> NEW.id
         AND x.queue_number IS NOT NULL
         AND (x.called_at IS NOT NULL OR x.status = 'completed')
         AND queue_period_of(x.business_id, x.branch_id, x.appointment_date, x.appointment_time)
           = queue_period_of(NEW.business_id, NEW.branch_id, NEW.appointment_date, NEW.appointment_time)
         AND queue_period_key(x) > queue_period_key(NEW)) THEN
    v_sort := queue_place_after(NEW, 3);
    IF v_sort IS NOT NULL THEN NEW.queue_sort := v_sort; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS queue_late_arrival ON appointments;
CREATE TRIGGER queue_late_arrival
  BEFORE UPDATE OF arrived_at ON appointments
  FOR EACH ROW EXECUTE FUNCTION queue_late_arrival();

-- The desk's state for today: started period, ended ones, the screen's note.
CREATE OR REPLACE FUNCTION front_desk_day(p_business_id uuid, p_branch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  b businesses%ROWTYPE;
  d queue_days%ROWTYPE;
BEGIN
  SELECT * INTO b FROM businesses WHERE id = p_business_id AND owner_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_OWNER: not your clinic'; END IF;
  SELECT * INTO d FROM queue_days
  WHERE business_id = b.id AND branch_id IS NOT DISTINCT FROM p_branch_id
    AND day = (now() AT TIME ZONE business_time_zone(b.country))::date;
  RETURN jsonb_build_object(
    'current_period', to_char(d.current_period, 'HH24:MI'),
    'ended_periods', coalesce((SELECT jsonb_agg(to_char(t, 'HH24:MI') ORDER BY t) FROM unnest(d.ended_periods) t), '[]'::jsonb),
    'note', d.note);
END;
$$;

-- «ابدأ الفترة» (p_action 'start') or «خلّص الفترة» ('end'). Ending marks whoever
-- of that period never arrived as ما جاش; whoever arrived stays in line.
-- Returns how many were marked.
CREATE OR REPLACE FUNCTION front_desk_period(p_business_id uuid, p_branch_id uuid, p_start time, p_action text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  b businesses%ROWTYPE;
  v_today date;
  v_marked integer := 0;
BEGIN
  SELECT * INTO b FROM businesses WHERE id = p_business_id AND owner_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_OWNER: not your clinic'; END IF;
  IF p_branch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM branches WHERE id = p_branch_id AND business_id = b.id) THEN
    RAISE EXCEPTION 'NOT_OWNER: not your branch';
  END IF;
  IF p_action NOT IN ('start', 'end') OR p_start IS NULL THEN RAISE EXCEPTION 'BAD_ACTION'; END IF;
  v_today := (now() AT TIME ZONE business_time_zone(b.country))::date;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'desk|' || b.id::text || '|' || coalesce(p_branch_id::text, '') || '|' || v_today::text, 0));

  IF p_action = 'end' THEN
    UPDATE appointments a SET status = 'no_show'
    WHERE a.business_id = b.id AND a.branch_id IS NOT DISTINCT FROM p_branch_id
      AND a.appointment_date = v_today AND a.status = 'confirmed'
      AND a.called_at IS NULL AND a.arrived_at IS NULL AND a.queue_number IS NOT NULL
      AND queue_period_of(a.business_id, a.branch_id, a.appointment_date, a.appointment_time) = p_start;
    GET DIAGNOSTICS v_marked = ROW_COUNT;
  END IF;

  INSERT INTO queue_days AS q (business_id, branch_id, day, current_period, ended_periods)
  VALUES (b.id, p_branch_id, v_today,
          CASE WHEN p_action = 'start' THEN p_start END,
          CASE WHEN p_action = 'end' THEN ARRAY[p_start] ELSE '{}'::time[] END)
  ON CONFLICT (business_id, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), day) DO UPDATE SET
    current_period = CASE WHEN p_action = 'start' THEN p_start
                          WHEN q.current_period = p_start THEN NULL ELSE q.current_period END,
    ended_periods = CASE WHEN p_action = 'start' THEN array_remove(q.ended_periods, p_start)
                         ELSE array_append(array_remove(q.ended_periods, p_start), p_start) END,
    updated_at = now();
  RETURN v_marked;
END;
$$;

-- The note on the waiting-room screen; empty clears it. Today only.
CREATE OR REPLACE FUNCTION front_desk_note(p_business_id uuid, p_branch_id uuid, p_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  b businesses%ROWTYPE;
  v_note text := nullif(left(trim(coalesce(p_note, '')), 200), '');
BEGIN
  SELECT * INTO b FROM businesses WHERE id = p_business_id AND owner_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_OWNER: not your clinic'; END IF;
  IF p_branch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM branches WHERE id = p_branch_id AND business_id = b.id) THEN
    RAISE EXCEPTION 'NOT_OWNER: not your branch';
  END IF;
  INSERT INTO queue_days AS q (business_id, branch_id, day, note)
  VALUES (b.id, p_branch_id, (now() AT TIME ZONE business_time_zone(b.country))::date, v_note)
  ON CONFLICT (business_id, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), day) DO UPDATE SET
    note = v_note, updated_at = now();
END;
$$;

-- 058's patient page, plus how many of those ahead haven't arrived yet.
CREATE OR REPLACE FUNCTION patient_page(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  a appointments%ROWTYPE;
  b businesses%ROWTYPE;
  v_today date;
  v_minutes integer;
BEGIN
  SELECT * INTO a FROM appointments WHERE manage_code = p_code;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'NOT_FOUND'); END IF;
  SELECT * INTO b FROM businesses WHERE id = a.business_id;
  v_today := (now() AT TIME ZONE business_time_zone(b.country))::date;
  IF a.appointment_date < v_today - 7 THEN RETURN jsonb_build_object('error', 'EXPIRED'); END IF;
  v_minutes := consult_minutes(b.id);

  RETURN jsonb_build_object(
    'client_name', a.client_name,
    'today', v_today,
    'business', jsonb_build_object(
      'name', b.name,
      'slug', coalesce(b.booking_slug, b.id::text),
      'logo_url', b.logo_url,
      'brand_color', b.brand_color,
      'public_phone', b.public_phone,
      'cancellation_policy', b.cancellation_policy
    ),
    'upcoming', (
      SELECT coalesce(jsonb_agg(row ORDER BY row->>'date', row->>'time'), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'id', x.id, 'date', x.appointment_date, 'time', to_char(x.appointment_time, 'HH24:MI'),
          'status', x.status, 'number', x.queue_number, 'service', s.name, 'branch', br.name, 'address', br.address,
          'map_url', br.map_url,
          'can_cancel', patient_can_cancel(x, b),
          'ahead', CASE WHEN x.status = 'confirmed' AND x.appointment_date = v_today THEN patients_ahead(x) END,
          'coming', CASE WHEN x.status = 'confirmed' AND x.appointment_date = v_today THEN patients_ahead_coming(x) END,
          'arrived', x.arrived_at IS NOT NULL,
          'inside', x.status = 'confirmed' AND x.appointment_date = v_today AND x.called_at IS NOT NULL,
          'eta_minutes', CASE WHEN x.status = 'confirmed' AND x.appointment_date = v_today THEN patients_ahead(x) * v_minutes END,
          'now_serving', CASE WHEN x.status = 'confirmed' AND x.appointment_date = v_today THEN (
            SELECT y.queue_number FROM appointments y
            WHERE y.business_id = x.business_id AND y.appointment_date = x.appointment_date
              AND y.branch_id IS NOT DISTINCT FROM x.branch_id AND y.appointment_time = x.appointment_time
              AND y.status = 'confirmed' AND y.called_at IS NOT NULL
            ORDER BY y.called_at DESC LIMIT 1) END
        ) AS row
        FROM appointments x
        LEFT JOIN services s ON s.id = x.service_id
        LEFT JOIN branches br ON br.id = x.branch_id
        WHERE x.business_id = a.business_id AND x.client_phone = a.client_phone
          AND x.status IN ('confirmed', 'waitlist') AND x.appointment_date >= v_today
      ) t
    ),
    'past', (
      SELECT coalesce(jsonb_agg(row ORDER BY row->>'date' DESC, row->>'time' DESC), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'id', x.id, 'date', x.appointment_date, 'time', to_char(x.appointment_time, 'HH24:MI'),
          'status', x.status, 'number', x.queue_number, 'service', s.name, 'branch', br.name
        ) AS row
        FROM appointments x
        LEFT JOIN services s ON s.id = x.service_id
        LEFT JOIN branches br ON br.id = x.branch_id
        WHERE x.business_id = a.business_id AND x.client_phone = a.client_phone
          AND NOT (x.status IN ('confirmed', 'waitlist') AND x.appointment_date >= v_today)
          AND x.appointment_date >= v_today - 365
        ORDER BY x.appointment_date DESC, x.appointment_time DESC
        LIMIT 10
      ) t
    )
  );
END;
$$;

-- 062's waiting-room screen, with the period the desk runs, its note, and
-- every waiting number for "what's my number?".
CREATE OR REPLACE FUNCTION public_queue_screen(p_ref text, p_branch_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  b businesses%ROWTYPE;
  br branches%ROWTYPE;
  d queue_days%ROWTYPE;
  v_today date;
  v_now time;
  v_period time;
  v_ended time[];
BEGIN
  SELECT * INTO b FROM businesses WHERE booking_slug = p_ref OR id::text = p_ref LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'NOT_FOUND'); END IF;
  IF b.is_active IS FALSE OR (b.trial_ends_at IS NOT NULL AND b.trial_ends_at < now()) THEN
    RETURN jsonb_build_object('error', 'LOCKED');
  END IF;
  SELECT * INTO br FROM branches
  WHERE business_id = b.id AND (p_branch_id IS NULL OR id = p_branch_id)
  ORDER BY is_main DESC, created_at LIMIT 1;
  v_today := (now() AT TIME ZONE business_time_zone(b.country))::date;
  v_now := (now() AT TIME ZONE business_time_zone(b.country))::time;
  SELECT * INTO d FROM queue_days WHERE business_id = b.id AND branch_id IS NOT DISTINCT FROM br.id AND day = v_today;
  v_ended := coalesce(d.ended_periods, '{}'::time[]);

  IF b.booking_mode = 'queue' THEN
    -- 1. The period the desk started.
    v_period := d.current_period;
    -- 2. The earliest with someone inside, or arrived and still waiting.
    IF v_period IS NULL THEN
      SELECT min(queue_period_of(a.business_id, a.branch_id, a.appointment_date, a.appointment_time)) INTO v_period
      FROM appointments a
      WHERE a.business_id = b.id AND a.appointment_date = v_today AND a.branch_id IS NOT DISTINCT FROM br.id
        AND a.status = 'confirmed' AND a.queue_number IS NOT NULL
        AND (a.called_at IS NOT NULL OR a.arrived_at IS NOT NULL);
    END IF;
    -- 3. By the clock: running now, else the next today, else the last; never one the desk ended.
    IF v_period IS NULL THEN
      SELECT coalesce(
        (SELECT p.start_time FROM queue_day_periods(b.id, br.id, v_today) p
          WHERE v_now >= p.start_time AND v_now < p.end_time AND NOT p.start_time = ANY(v_ended) ORDER BY 1 LIMIT 1),
        (SELECT min(p.start_time) FROM queue_day_periods(b.id, br.id, v_today) p
          WHERE p.start_time > v_now AND NOT p.start_time = ANY(v_ended)),
        (SELECT max(p.start_time) FROM queue_day_periods(b.id, br.id, v_today) p
          WHERE NOT p.start_time = ANY(v_ended)))
      INTO v_period;
    END IF;
    -- 4. A day with no period: where the bookings are.
    IF v_period IS NULL THEN
      SELECT min(queue_period_of(a.business_id, a.branch_id, a.appointment_date, a.appointment_time)) INTO v_period
      FROM appointments a
      WHERE a.business_id = b.id AND a.appointment_date = v_today AND a.branch_id IS NOT DISTINCT FROM br.id
        AND a.status = 'confirmed';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'name', b.name,
    'logo_url', b.logo_url,
    'brand_color', b.brand_color,
    'mode', b.booking_mode,
    'today', v_today,
    'period_start', to_char(v_period, 'HH24:MI'),
    'note', d.note,
    'minutes', consult_minutes(b.id),
    'branch', CASE WHEN br.id IS NULL THEN NULL ELSE jsonb_build_object('id', br.id, 'name', br.name) END,
    'branches', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name) ORDER BY x.is_main DESC, x.created_at), '[]'::jsonb)
                 FROM branches x WHERE x.business_id = b.id),
    'periods', CASE WHEN b.booking_mode = 'queue' THEN (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'start', to_char(p.start_time, 'HH24:MI'), 'end', to_char(p.end_time, 'HH24:MI'), 'name', p.name,
               'started', p.start_time = d.current_period, 'ended', p.start_time = ANY(v_ended)) ORDER BY p.start_time), '[]'::jsonb)
      FROM queue_day_period_list(b.id, br.id, v_today) p) ELSE '[]'::jsonb END,
    'inside', (
      SELECT jsonb_build_object('number', a.queue_number, 'time', to_char(a.appointment_time, 'HH24:MI'),
        'period', to_char(CASE WHEN a.queue_number IS NOT NULL THEN queue_period_of(a.business_id, a.branch_id, a.appointment_date, a.appointment_time) END, 'HH24:MI'))
      FROM appointments a
      WHERE a.business_id = b.id AND a.appointment_date = v_today
        AND a.branch_id IS NOT DISTINCT FROM br.id
        AND a.status = 'confirmed' AND a.called_at IS NOT NULL
      ORDER BY a.called_at DESC LIMIT 1),
    -- The line on screen: earlier periods' patients still here, then this period's.
    'line', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('number', t.queue_number, 'time', to_char(t.appointment_time, 'HH24:MI'),
               'period', to_char(t.p, 'HH24:MI'), 'arrived', t.arrived) ORDER BY t.p, t.k, t.created_at), '[]'::jsonb)
      FROM (
        SELECT a.queue_number, a.appointment_time, a.created_at, a.arrived_at IS NOT NULL AS arrived,
               CASE WHEN b.booking_mode = 'queue' AND a.queue_number IS NOT NULL
                    THEN queue_period_of(a.business_id, a.branch_id, a.appointment_date, a.appointment_time) END AS p,
               CASE WHEN b.booking_mode = 'queue' AND a.queue_number IS NOT NULL
                    THEN queue_period_key(a) ELSE queue_key(a) END AS k
        FROM appointments a
        WHERE a.business_id = b.id AND a.appointment_date = v_today
          AND a.branch_id IS NOT DISTINCT FROM br.id
          AND a.status = 'confirmed' AND a.called_at IS NULL
        LIMIT 500
      ) t
      WHERE v_period IS NULL OR t.p = v_period OR (t.p < v_period AND t.arrived)),
    -- Every number waiting today, for "what's my number?": its place and how
    -- many ahead haven't arrived. Numbers only.
    'waiting', CASE WHEN b.booking_mode = 'queue' THEN (
      SELECT coalesce(jsonb_agg(jsonb_build_object('number', a.queue_number,
               'period', to_char(queue_period_of(a.business_id, a.branch_id, a.appointment_date, a.appointment_time), 'HH24:MI'),
               'arrived', a.arrived_at IS NOT NULL, 'ahead', patients_ahead(a), 'coming', patients_ahead_coming(a))), '[]'::jsonb)
      FROM (
        SELECT * FROM appointments a
        WHERE a.business_id = b.id AND a.appointment_date = v_today
          AND a.branch_id IS NOT DISTINCT FROM br.id
          AND a.status = 'confirmed' AND a.called_at IS NULL AND a.queue_number IS NOT NULL
        LIMIT 500
      ) a) ELSE '[]'::jsonb END
  );
END;
$$;

REVOKE ALL ON FUNCTION queue_day_period_list(uuid, uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION queue_period_over(uuid, uuid, date, time) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION queue_ahead(appointments) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION patients_ahead(appointments) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION patients_ahead_coming(appointments) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION queue_place_after(appointments, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION queue_late_arrival() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION front_desk_push_back(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION front_desk_day(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION front_desk_period(uuid, uuid, time, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION front_desk_note(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION queue_day_period_list(uuid, uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION queue_period_over(uuid, uuid, date, time) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION queue_place_after(appointments, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION front_desk_push_back(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION front_desk_day(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION front_desk_period(uuid, uuid, time, text) TO authenticated;
GRANT EXECUTE ON FUNCTION front_desk_note(uuid, uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION patient_page(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION patient_page(text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public_queue_screen(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_queue_screen(text, uuid) TO anon, authenticated;
