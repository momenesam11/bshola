-- The front desk (/clinic): the secretary calls the next patient, marks who
-- arrived, sends a late patient back a few places, and the patient's page
-- shows who is inside and about how long is left. Plus a map link per branch.
--
--   appointments.arrived_at    the patient is at the clinic (وصل)
--   appointments.called_at     the patient was called in (جوه دلوقتي)
--   appointments.finished_at   set by the database when the visit is completed
--   appointments.queue_sort    a place in today's line set by "رجّعه"; NULL keeps
--                              the natural order (booking time, then number)
--   branches.map_url           a Google Maps link for directions
--
-- The order of the line everywhere is queue_key(a), then created_at. The time
-- a visit takes is measured from called_at to finished_at; consult_minutes()
-- averages the last 30 days and falls back to the services' durations.
--
-- Visitors can't set the new appointment columns: the trigger clears them on a
-- booking that isn't the clinic's own.
--
-- Additive: new nullable columns, new functions, and patient_page,
-- patients_ahead and public_queue_periods recreated with the same signatures.
-- Rollback: supabase/rollbacks/058_front_desk_down.sql.

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS arrived_at timestamptz;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS called_at timestamptz;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS finished_at timestamptz;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS queue_sort numeric;

-- At most one patient inside per branch and day, whatever two screens do at
-- once. (Two patients never share a number already: 057's unique index.)
CREATE UNIQUE INDEX IF NOT EXISTS appointments_one_inside_key
  ON appointments (business_id, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), appointment_date)
  WHERE status = 'confirmed' AND called_at IS NOT NULL;

ALTER TABLE branches ADD COLUMN IF NOT EXISTS map_url text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'branches_map_url_check') THEN
    ALTER TABLE branches ADD CONSTRAINT branches_map_url_check
      CHECK (map_url IS NULL OR (map_url ~* '^https://' AND length(map_url) <= 500));
  END IF;
END $$;

-- A visit's place in the day's line. Times are whole minutes, and a period's
-- numbers (at most 500) add under a second, so the natural order is the
-- booking time then the number. "رجّعه" writes a key between two others.
CREATE OR REPLACE FUNCTION queue_key(a appointments)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(a.queue_sort,
    extract(epoch FROM a.appointment_time)::numeric + coalesce(a.queue_number, 0)::numeric / 1000)
$$;

-- Stamps the visit's end, and keeps the front-desk columns the clinic's own.
CREATE OR REPLACE FUNCTION front_desk_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- A request from the site (a visitor, or a signed-in user who isn't this
  -- clinic's owner). The service role and the SQL Editor have no such role.
  IF TG_OP = 'INSERT'
     AND coalesce(auth.role(), '') IN ('anon', 'authenticated')
     AND NOT (auth.uid() IS NOT NULL AND EXISTS (
       SELECT 1 FROM businesses WHERE id = NEW.business_id AND owner_id = auth.uid())) THEN
    NEW.arrived_at := NULL;
    NEW.called_at := NULL;
    NEW.finished_at := NULL;
    NEW.queue_sort := NULL;
  END IF;

  IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed') THEN
    NEW.finished_at := coalesce(NEW.finished_at, now());
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'confirmed' AND OLD.status IN ('completed', 'no_show') THEN
    -- Back to waiting (a mistaken "خلص" or "ما جاش"): they wait in their
    -- place again, not inside, since someone else may be inside by now.
    NEW.finished_at := NULL;
    NEW.called_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS front_desk_fields ON appointments;
CREATE TRIGGER front_desk_fields
  BEFORE INSERT OR UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION front_desk_fields();

-- About how many minutes one visit takes at this clinic: the average from
-- called to finished over the last 30 days (3 visits at least, each 1 to 90
-- minutes), else the services' average duration, else the slot length.
-- SECURITY INVOKER: an owner reads only their own visits; patient_page runs it
-- with its own rights.
CREATE OR REPLACE FUNCTION consult_minutes(p_business_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT greatest(1, round(coalesce(
    (SELECT avg(m) FROM (
       SELECT extract(epoch FROM (a.finished_at - a.called_at)) / 60 AS m
       FROM appointments a
       WHERE a.business_id = p_business_id
         AND a.called_at IS NOT NULL AND a.finished_at IS NOT NULL
         AND a.appointment_date >= current_date - 30
     ) s WHERE m BETWEEN 1 AND 90 HAVING count(*) >= 3),
    (SELECT avg(duration_minutes) FROM services WHERE business_id = p_business_id AND duration_minutes > 0),
    (SELECT slot_duration FROM businesses WHERE id = p_business_id),
    15)))::int
$$;

-- Patients ahead (056, 057), now in queue_key order, and whoever is inside
-- counts as ahead of everyone still waiting. The one inside has none.
CREATE OR REPLACE FUNCTION patients_ahead(a appointments)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN a.called_at IS NOT NULL THEN 0 ELSE (
    SELECT count(*)::int FROM appointments x
    WHERE x.business_id = a.business_id
      AND x.appointment_date = a.appointment_date
      AND x.status = 'confirmed'
      AND x.id <> a.id
      AND (a.branch_id IS NULL OR x.branch_id IS NULL OR x.branch_id = a.branch_id)
      AND (x.called_at IS NOT NULL OR (queue_key(x), x.created_at) < (queue_key(a), a.created_at))
  ) END
$$;

-- The front desk's "call": whoever is inside on that day and branch is done,
-- and this patient goes in. One transaction, under the caller's own rights.
CREATE OR REPLACE FUNCTION front_desk_call(p_appointment_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  a appointments%ROWTYPE;
BEGIN
  SELECT * INTO a FROM appointments WHERE id = p_appointment_id AND status = 'confirmed';
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_WAITING: this patient is not waiting'; END IF;
  -- One desk action at a time per branch and day: two screens pressing at
  -- once queue up here, and the second sees what the first did.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'desk|' || a.business_id::text || '|' || coalesce(a.branch_id::text, '') || '|' || a.appointment_date::text, 0));
  SELECT * INTO a FROM appointments WHERE id = p_appointment_id AND status = 'confirmed';
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_WAITING: this patient is not waiting'; END IF;

  UPDATE appointments SET status = 'completed'
  WHERE business_id = a.business_id AND appointment_date = a.appointment_date
    AND branch_id IS NOT DISTINCT FROM a.branch_id
    AND status = 'confirmed' AND called_at IS NOT NULL AND id <> a.id;

  -- Called is not arrived: someone called who never shows goes back with "ما دخلش"
  -- and must still get their heads-up, so arrived_at stays as the desk set it.
  UPDATE appointments SET called_at = now()
  WHERE id = a.id;
END;
$$;

-- "رجّعه": a late patient goes back p_steps places among those waiting after
-- them (or to the end, if fewer), and is no longer inside.
CREATE OR REPLACE FUNCTION front_desk_push_back(p_appointment_id uuid, p_steps integer DEFAULT 3)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  a appointments%ROWTYPE;
  v_after numeric[];
  v_target numeric;
  v_next numeric;
  v_steps integer := least(greatest(coalesce(p_steps, 3), 1), 50);
BEGIN
  SELECT * INTO a FROM appointments WHERE id = p_appointment_id AND status = 'confirmed';
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_WAITING: this patient is not waiting'; END IF;
  -- One desk action at a time per branch and day: two screens pressing at
  -- once queue up here, and the second sees what the first did.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'desk|' || a.business_id::text || '|' || coalesce(a.branch_id::text, '') || '|' || a.appointment_date::text, 0));
  SELECT * INTO a FROM appointments WHERE id = p_appointment_id AND status = 'confirmed';
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_WAITING: this patient is not waiting'; END IF;

  SELECT array_agg(k ORDER BY k, c) INTO v_after FROM (
    SELECT queue_key(x) k, x.created_at c FROM appointments x
    WHERE x.business_id = a.business_id AND x.appointment_date = a.appointment_date
      AND x.branch_id IS NOT DISTINCT FROM a.branch_id
      AND x.status = 'confirmed' AND x.called_at IS NULL AND x.id <> a.id
      AND (queue_key(x), x.created_at) > (queue_key(a), a.created_at)
  ) t;

  IF v_after IS NULL THEN
    UPDATE appointments SET called_at = NULL, queue_notified_at = NULL WHERE id = a.id;
    RETURN;
  END IF;

  v_target := v_after[least(v_steps, array_length(v_after, 1))];
  v_next := v_after[least(v_steps, array_length(v_after, 1)) + 1];
  UPDATE appointments
  -- Sent back, they get told again when their turn comes near.
  SET called_at = NULL, queue_notified_at = NULL,
      queue_sort = CASE WHEN v_next IS NOT NULL AND v_next > v_target THEN (v_target + v_next) / 2
                        ELSE v_target + 0.0001 END
  WHERE id = a.id;
END;
$$;

-- 057's per-period counts; the number inside is now whoever was called, else
-- the first still waiting in line order.
CREATE OR REPLACE FUNCTION public_queue_periods(p_business_id uuid, p_branch_id uuid, p_date date)
RETURNS TABLE (period_start time, taken integer, next_number integer, current_number integer, started boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    a.appointment_time,
    (count(*) FILTER (WHERE a.status IN ('confirmed', 'completed', 'no_show')))::int,
    (coalesce(max(a.queue_number), 0) + 1)::int,
    coalesce(
      (array_agg(a.queue_number ORDER BY a.called_at DESC) FILTER (WHERE a.status = 'confirmed' AND a.called_at IS NOT NULL))[1],
      (array_agg(a.queue_number ORDER BY queue_key(a), a.created_at) FILTER (WHERE a.status = 'confirmed'))[1]
    )::int,
    bool_or(a.status IN ('completed', 'no_show') OR a.called_at IS NOT NULL)
  FROM appointments a
  WHERE a.business_id = p_business_id
    AND a.branch_id IS NOT DISTINCT FROM p_branch_id
    AND a.appointment_date = p_date
    AND a.queue_number IS NOT NULL
  GROUP BY a.appointment_time
$$;

-- 057's patient page, plus for today's visit: whether they're inside, the
-- number inside, about how many minutes are left, and the branch's map link.
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

REVOKE ALL ON FUNCTION queue_key(appointments) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION front_desk_fields() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION consult_minutes(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION front_desk_call(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION front_desk_push_back(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION patients_ahead(appointments) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION queue_key(appointments) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION consult_minutes(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION front_desk_call(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION front_desk_push_back(uuid, integer) TO authenticated;

-- The waiting-room screen /q/<slug> (a TV in the clinic, or a patient's phone
-- from its QR code): today's line of one branch, numbers only. Who is inside,
-- the numbers waiting in order, and about how long a visit takes. No names or
-- phones. A time clinic has no numbers, so its line is booking times.
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
  v_today date;
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

  RETURN jsonb_build_object(
    'name', b.name,
    'logo_url', b.logo_url,
    'brand_color', b.brand_color,
    'mode', b.booking_mode,
    'today', v_today,
    'minutes', consult_minutes(b.id),
    'branch', CASE WHEN br.id IS NULL THEN NULL ELSE jsonb_build_object('id', br.id, 'name', br.name) END,
    'branches', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name) ORDER BY x.is_main DESC, x.created_at), '[]'::jsonb)
                 FROM branches x WHERE x.business_id = b.id),
    'inside', (
      SELECT jsonb_build_object('number', a.queue_number, 'time', to_char(a.appointment_time, 'HH24:MI'))
      FROM appointments a
      WHERE a.business_id = b.id AND a.appointment_date = v_today
        AND a.branch_id IS NOT DISTINCT FROM br.id
        AND a.status = 'confirmed' AND a.called_at IS NOT NULL
      ORDER BY a.called_at DESC LIMIT 1),
    'line', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('number', t.queue_number, 'time', to_char(t.appointment_time, 'HH24:MI')) ORDER BY t.k, t.created_at), '[]'::jsonb)
      FROM (
        SELECT a.queue_number, a.appointment_time, a.created_at, queue_key(a) k
        FROM appointments a
        WHERE a.business_id = b.id AND a.appointment_date = v_today
          AND a.branch_id IS NOT DISTINCT FROM br.id
          AND a.status = 'confirmed' AND a.called_at IS NULL
        ORDER BY queue_key(a), a.created_at
        LIMIT 200
      ) t)
  );
END;
$$;

REVOKE ALL ON FUNCTION public_queue_screen(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_queue_screen(text, uuid) TO anon, authenticated;
