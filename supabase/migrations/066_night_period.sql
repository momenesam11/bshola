-- A night period goes on past midnight until the desk ends it.
--
-- Clinics see the evening's patients until 2, 4 or later. At 00:00 the
-- waiting-room screen, the front desk and the patient page moved to the new
-- date: the patients still waiting vanished and «خلّص الفترة» couldn't reach
-- their period. Now the evening before stays open while it has someone
-- waiting or inside in a period the desk didn't end, until one of:
--   - the desk ends that period («خلّص الفترة»);
--   - the desk starts a period of the new day («ابدأ الفترة»), which ends the
--     evening before the same way;
--   - the new day's first period begins by the clock (noon on a day without
--     periods), so the morning never opens on last night's line.
--
--   clinic_day(business, branch)       the day the screen, the desk and the
--                                      patient page are on (the evening before,
--                                      or today).
--   clinic_day_time(business, branch)  its time: 23:59:59 while on the evening
--                                      before, so the screen keeps its last period.
--   front_desk_day()      now also returns the day and the calendar date, and
--                         the started/ended periods of both days.
--   front_desk_period()   takes the day (the evening before or today). Ending a
--                         period also finishes whoever is still inside from it.
--   front_desk_note(), patient_page(), public_queue_screen()   use clinic_day().
--
-- Clinics that book by time are not affected (their day is the date). The
-- booking page and the reports keep the plain date. No data is changed.
-- Rollback: supabase/rollbacks/066_night_period_down.sql.

CREATE OR REPLACE FUNCTION clinic_day(p_business_id uuid, p_branch_id uuid, p_at timestamptz DEFAULT now())
RETURNS date
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_country text;
  v_local timestamp;
  v_today date;
  v_first time;
BEGIN
  SELECT country INTO v_country FROM businesses WHERE id = p_business_id;
  v_local := p_at AT TIME ZONE business_time_zone(v_country);
  v_today := v_local::date;
  -- The desk started a period of today.
  IF EXISTS (SELECT 1 FROM queue_days k
    WHERE k.business_id = p_business_id AND k.branch_id IS NOT DISTINCT FROM p_branch_id
      AND k.day = v_today AND k.current_period IS NOT NULL) THEN
    RETURN v_today;
  END IF;
  -- Today's first period has begun (noon on a day without periods).
  SELECT min(d.start_time) INTO v_first FROM queue_day_periods(p_business_id, p_branch_id, v_today) d;
  IF v_local::time >= coalesce(v_first, time '12:00') THEN
    RETURN v_today;
  END IF;
  -- The evening before still has someone waiting or inside, in a period the desk didn't end.
  IF EXISTS (
    SELECT 1 FROM appointments a
    LEFT JOIN queue_days k ON k.business_id = a.business_id AND k.branch_id IS NOT DISTINCT FROM a.branch_id
      AND k.day = a.appointment_date
    WHERE a.business_id = p_business_id AND a.branch_id IS NOT DISTINCT FROM p_branch_id
      AND a.appointment_date = v_today - 1 AND a.status = 'confirmed' AND a.queue_number IS NOT NULL
      AND NOT (queue_period_of(a.business_id, a.branch_id, a.appointment_date, a.appointment_time)
               = ANY(coalesce(k.ended_periods, '{}'::time[])))) THEN
    RETURN v_today - 1;
  END IF;
  RETURN v_today;
END;
$$;

CREATE OR REPLACE FUNCTION clinic_day_time(p_business_id uuid, p_branch_id uuid, p_at timestamptz DEFAULT now())
RETURNS time
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN (p_at AT TIME ZONE business_time_zone(b.country))::date > clinic_day(p_business_id, p_branch_id, p_at)
              THEN time '23:59:59'
              ELSE (p_at AT TIME ZONE business_time_zone(b.country))::time END
  FROM businesses b WHERE b.id = p_business_id
$$;

-- The desk's state: the day it is on, the calendar date, and for the evening
-- before and today the period started and the ones ended; the note of the day.
DROP FUNCTION IF EXISTS front_desk_day(uuid, uuid);
CREATE OR REPLACE FUNCTION front_desk_day(p_business_id uuid, p_branch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  b businesses%ROWTYPE;
  v_day date;
  v_today date;
BEGIN
  SELECT * INTO b FROM businesses WHERE id = p_business_id AND owner_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_OWNER: not your clinic'; END IF;
  v_day := clinic_day(b.id, p_branch_id);
  v_today := (now() AT TIME ZONE business_time_zone(b.country))::date;
  RETURN jsonb_build_object(
    'day', v_day,
    'calendar_day', v_today,
    'note', (SELECT k.note FROM queue_days k WHERE k.business_id = b.id
               AND k.branch_id IS NOT DISTINCT FROM p_branch_id AND k.day = v_day),
    'days', (SELECT coalesce(jsonb_object_agg(d::text, jsonb_build_object(
               'current_period', to_char(k.current_period, 'HH24:MI'),
               'ended_periods', coalesce((SELECT jsonb_agg(to_char(t, 'HH24:MI') ORDER BY t) FROM unnest(k.ended_periods) t), '[]'::jsonb))), '{}'::jsonb)
             FROM unnest(ARRAY[v_today - 1, v_today]) d
             LEFT JOIN queue_days k ON k.business_id = b.id AND k.branch_id IS NOT DISTINCT FROM p_branch_id AND k.day = d));
END;
$$;

-- «ابدأ الفترة» / «خلّص الفترة» on a period of p_day (the evening before or
-- today; default the desk's day). Ending marks whoever never arrived ما جاش and
-- finishes whoever is still inside from it. Starting a period of today ends
-- the evening before's open periods the same way. Returns how many were
-- marked ما جاش.
DROP FUNCTION IF EXISTS front_desk_period(uuid, uuid, time, text);
CREATE OR REPLACE FUNCTION front_desk_period(p_business_id uuid, p_branch_id uuid, p_start time, p_action text, p_day date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  b businesses%ROWTYPE;
  v_today date;
  v_day date;
  v_marked integer := 0;
  v_open time;
BEGIN
  SELECT * INTO b FROM businesses WHERE id = p_business_id AND owner_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_OWNER: not your clinic'; END IF;
  IF p_branch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM branches WHERE id = p_branch_id AND business_id = b.id) THEN
    RAISE EXCEPTION 'NOT_OWNER: not your branch';
  END IF;
  IF p_action NOT IN ('start', 'end') OR p_start IS NULL THEN RAISE EXCEPTION 'BAD_ACTION'; END IF;
  v_today := (now() AT TIME ZONE business_time_zone(b.country))::date;
  v_day := coalesce(p_day, clinic_day(b.id, p_branch_id));
  IF v_day NOT IN (v_today - 1, v_today) THEN RAISE EXCEPTION 'BAD_DAY: only the evening before or today'; END IF;

  -- Starting a period of today closes what's left of the evening before.
  IF p_action = 'start' AND v_day = v_today THEN
    FOR v_open IN
      SELECT DISTINCT queue_period_of(a.business_id, a.branch_id, a.appointment_date, a.appointment_time)
      FROM appointments a
      LEFT JOIN queue_days k ON k.business_id = a.business_id AND k.branch_id IS NOT DISTINCT FROM a.branch_id
        AND k.day = a.appointment_date
      WHERE a.business_id = b.id AND a.branch_id IS NOT DISTINCT FROM p_branch_id
        AND a.appointment_date = v_today - 1 AND a.status = 'confirmed' AND a.queue_number IS NOT NULL
        AND NOT (queue_period_of(a.business_id, a.branch_id, a.appointment_date, a.appointment_time)
                 = ANY(coalesce(k.ended_periods, '{}'::time[])))
    LOOP
      PERFORM front_desk_period(b.id, p_branch_id, v_open, 'end', v_today - 1);
    END LOOP;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'desk|' || b.id::text || '|' || coalesce(p_branch_id::text, '') || '|' || v_day::text, 0));

  IF p_action = 'end' THEN
    UPDATE appointments a SET status = 'no_show'
    WHERE a.business_id = b.id AND a.branch_id IS NOT DISTINCT FROM p_branch_id
      AND a.appointment_date = v_day AND a.status = 'confirmed'
      AND a.called_at IS NULL AND a.arrived_at IS NULL AND a.queue_number IS NOT NULL
      AND queue_period_of(a.business_id, a.branch_id, a.appointment_date, a.appointment_time) = p_start;
    GET DIAGNOSTICS v_marked = ROW_COUNT;
    -- Whoever is still inside from this period is done.
    UPDATE appointments a SET status = 'completed'
    WHERE a.business_id = b.id AND a.branch_id IS NOT DISTINCT FROM p_branch_id
      AND a.appointment_date = v_day AND a.status = 'confirmed' AND a.called_at IS NOT NULL
      AND queue_period_of(a.business_id, a.branch_id, a.appointment_date, a.appointment_time) = p_start;
  END IF;

  INSERT INTO queue_days AS q (business_id, branch_id, day, current_period, ended_periods)
  VALUES (b.id, p_branch_id, v_day,
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
  VALUES (b.id, p_branch_id, clinic_day(b.id, p_branch_id), v_note)
  ON CONFLICT (business_id, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), day) DO UPDATE SET
    note = v_note, updated_at = now();
END;
$$;

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
  v_today := clinic_day(b.id, a.branch_id);
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
  v_today := clinic_day(b.id, br.id);
  v_now := clinic_day_time(b.id, br.id);
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

REVOKE ALL ON FUNCTION clinic_day(uuid, uuid, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION clinic_day_time(uuid, uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION clinic_day(uuid, uuid, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION clinic_day_time(uuid, uuid, timestamptz) TO authenticated, service_role;
REVOKE ALL ON FUNCTION front_desk_day(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION front_desk_period(uuid, uuid, time, text, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION front_desk_note(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION front_desk_day(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION front_desk_period(uuid, uuid, time, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION front_desk_note(uuid, uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION patient_page(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION patient_page(text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public_queue_screen(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_queue_screen(text, uuid) TO anon, authenticated;
