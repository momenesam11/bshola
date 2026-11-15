-- Booking by turn (بالدور) as an alternative to booking a time, per clinic.
--
--   businesses.booking_mode     'time' (default, as today) or 'queue'
--   businesses.queue_limit      most patients per period online; NULL = no limit
--   appointments.queue_number   the patient's number in their period
--   appointments.booking_ref    a random id the booking page sends, so it can
--                               read back the number of the row it just made
--
-- In queue mode a patient picks a day and one of its working periods (the
-- branch's schedule blocks); appointment_time holds the period's start. The
-- database gives the next number in that period. Numbers are never reused, so
-- a cancellation leaves everyone else's number as it was. Online bookings stop
-- at the limit (the page then offers the waitlist); the clinic can still add
-- patients past it from the dashboard.
--
-- check_capacity_before_insert is recreated from 047 with one change: queue
-- clinics skip the time-overlap check, since a whole period shares one start
-- time. Time clinics behave exactly as before.
--
-- Additive: new columns with defaults (existing clinics stay on 'time'), new
-- functions and triggers. Rollback: supabase/rollbacks/057_queue_booking_down.sql.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS booking_mode text NOT NULL DEFAULT 'time'
  CONSTRAINT businesses_booking_mode_check CHECK (booking_mode IN ('time', 'queue'));
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS queue_limit smallint
  CONSTRAINT businesses_queue_limit_check CHECK (queue_limit IS NULL OR queue_limit BETWEEN 1 AND 500);

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS queue_number integer;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS booking_ref uuid;
CREATE UNIQUE INDEX IF NOT EXISTS appointments_queue_number_key
  ON appointments (business_id, branch_id, appointment_date, appointment_time, queue_number)
  WHERE queue_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS appointments_booking_ref_idx ON appointments (booking_ref) WHERE booking_ref IS NOT NULL;

-- Gives a queue clinic's confirmed appointment the next number of its period.
-- SECURITY DEFINER because visitors can't read businesses or other bookings;
-- auth.uid() still names the caller, so the owner is told apart.
CREATE OR REPLACE FUNCTION assign_queue_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  b businesses%ROWTYPE;
  v_is_owner boolean;
  v_taken integer;
  v_start time;
BEGIN
  IF NEW.status <> 'confirmed' THEN
    RETURN NEW;
  END IF;
  SELECT * INTO b FROM businesses WHERE id = NEW.business_id;
  IF b.booking_mode IS DISTINCT FROM 'queue' THEN
    NEW.queue_number := NULL;
    RETURN NEW;
  END IF;

  -- A time inside a working period counts as that period: the dashboard's
  -- time picker can say 17:30 for the evening session that starts at 16:00.
  SELECT (blk->>'start')::time INTO v_start
  FROM branches br,
       jsonb_array_elements(coalesce(br.schedule_blocks -> (ARRAY['sun','mon','tue','wed','thu','fri','sat'])[extract(dow FROM NEW.appointment_date)::int + 1], '[]'::jsonb)) blk
  WHERE br.id = NEW.branch_id
    AND NEW.appointment_time >= (blk->>'start')::time
    AND NEW.appointment_time < (blk->>'end')::time
  LIMIT 1;
  IF v_start IS NOT NULL THEN
    NEW.appointment_time := v_start;
  END IF;

  -- An update keeps its number unless the visit moved to another period.
  IF TG_OP = 'UPDATE' AND OLD.queue_number IS NOT NULL
     AND NEW.appointment_date = OLD.appointment_date
     AND NEW.appointment_time = OLD.appointment_time
     AND NEW.branch_id IS NOT DISTINCT FROM OLD.branch_id THEN
    NEW.queue_number := OLD.queue_number;
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'queue|' || NEW.business_id::text || '|' || coalesce(NEW.branch_id::text, '') || '|'
      || NEW.appointment_date::text || '|' || NEW.appointment_time::text, 0));

  -- current_user is this function's owner here (SECURITY DEFINER), so the
  -- caller is told by the request: the owner and the service role may go past
  -- the limit, everyone else may not.
  v_is_owner := auth.uid() IS NOT NULL AND b.owner_id = auth.uid();
  IF NOT v_is_owner AND coalesce(auth.role(), '') <> 'service_role' AND b.queue_limit IS NOT NULL THEN
    SELECT count(*) INTO v_taken FROM appointments
      WHERE business_id = NEW.business_id AND branch_id IS NOT DISTINCT FROM NEW.branch_id
        AND appointment_date = NEW.appointment_date AND appointment_time = NEW.appointment_time
        AND status IN ('confirmed', 'completed', 'no_show')
        AND id <> coalesce(NEW.id, gen_random_uuid());
    IF v_taken >= b.queue_limit THEN
      RAISE EXCEPTION 'QUEUE_FULL: this period is fully booked';
    END IF;
  END IF;

  SELECT coalesce(max(queue_number), 0) + 1 INTO NEW.queue_number FROM appointments
    WHERE business_id = NEW.business_id AND branch_id IS NOT DISTINCT FROM NEW.branch_id
      AND appointment_date = NEW.appointment_date AND appointment_time = NEW.appointment_time;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_queue_number ON appointments;
CREATE TRIGGER assign_queue_number
  BEFORE INSERT OR UPDATE OF status, appointment_date, appointment_time, branch_id ON appointments
  FOR EACH ROW EXECUTE FUNCTION assign_queue_number();

-- 047's capacity guard, unchanged except for the queue-mode early return.
CREATE OR REPLACE FUNCTION check_capacity_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_duration int;
  new_start int;
  new_end int;
  max_capacity int;
  peak int;
BEGIN
  IF NEW.status != 'confirmed' THEN
    RETURN NEW;
  END IF;

  -- A patient who walks in still has to go on the calendar.
  IF auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM businesses WHERE id = NEW.business_id AND owner_id = auth.uid()
  ) THEN
    RETURN NEW;
  END IF;

  -- Queue clinics (057): a period's patients share its start time, and
  -- assign_queue_number applies the clinic's limit instead.
  IF EXISTS (SELECT 1 FROM businesses WHERE id = NEW.business_id AND booking_mode = 'queue') THEN
    RETURN NEW;
  END IF;

  -- The whole day, since bookings at different times can now collide.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.branch_id::text || '|' || NEW.appointment_date::text, 0)
  );

  SELECT COALESCE(capacity, 1) INTO max_capacity FROM branches WHERE id = NEW.branch_id;
  max_capacity := COALESCE(max_capacity, 1);

  SELECT COALESCE(s.duration_minutes, b.slot_duration, 30) INTO new_duration
  FROM businesses b
  LEFT JOIN services s ON s.id = NEW.service_id
  WHERE b.id = NEW.business_id;
  new_duration := COALESCE(new_duration, 30);

  new_start := (EXTRACT(EPOCH FROM NEW.appointment_time) / 60)::int;
  new_end := new_start + new_duration;

  -- The most bookings running at once anywhere inside the new one. Counting
  -- every overlap would wrongly fill a two-chair branch with back-to-back visits.
  WITH busy AS (
    SELECT (EXTRACT(EPOCH FROM a.appointment_time) / 60)::int AS start_min,
           (EXTRACT(EPOCH FROM a.appointment_time) / 60)::int
             + COALESCE(s.duration_minutes, b.slot_duration, 30) AS end_min
    FROM appointments a
    JOIN businesses b ON b.id = a.business_id
    LEFT JOIN services s ON s.id = a.service_id
    WHERE a.branch_id = NEW.branch_id
      AND a.appointment_date = NEW.appointment_date
      AND a.status = 'confirmed'
      AND a.id != COALESCE(NEW.id, gen_random_uuid())
  ),
  points AS (
    SELECT new_start AS at_min
    UNION
    SELECT start_min FROM busy WHERE start_min > new_start AND start_min < new_end
  )
  SELECT COALESCE(MAX((SELECT count(*) FROM busy WHERE start_min <= at_min AND end_min > at_min)), 0)
  INTO peak
  FROM points;

  IF peak >= max_capacity THEN
    RAISE EXCEPTION 'CAPACITY_EXCEEDED: This time slot is fully booked';
  END IF;

  RETURN NEW;
END;
$$;

-- The booking page's view of a queue clinic: its mode and limit.
CREATE OR REPLACE FUNCTION public_booking_mode(p_business_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object('mode', b.booking_mode, 'queue_limit', b.queue_limit)
  FROM businesses b WHERE b.id = p_business_id
$$;

-- Per period of one day, counts only: how many took a number, the next
-- number, and (once the session has started) the number inside now, which is
-- the first patient still waiting, as on the dashboard queue.
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
    (min(a.queue_number) FILTER (WHERE a.status = 'confirmed'))::int,
    bool_or(a.status IN ('completed', 'no_show'))
  FROM appointments a
  WHERE a.business_id = p_business_id
    AND a.branch_id IS NOT DISTINCT FROM p_branch_id
    AND a.appointment_date = p_date
    AND a.queue_number IS NOT NULL
  GROUP BY a.appointment_time
$$;

-- The number of the row the booking page just made, found by the random id it
-- sent with the insert. Only within ten minutes, and only the number.
CREATE OR REPLACE FUNCTION public_my_queue_number(p_booking_ref uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT queue_number FROM appointments
  WHERE booking_ref = p_booking_ref AND created_at > now() - interval '10 minutes'
  ORDER BY created_at DESC LIMIT 1
$$;

-- Patients ahead (056) now also follow the number within a period.
CREATE OR REPLACE FUNCTION patients_ahead(a appointments)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT count(*)::int FROM appointments x
  WHERE x.business_id = a.business_id
    AND x.appointment_date = a.appointment_date
    AND x.status = 'confirmed'
    AND x.id <> a.id
    AND (a.branch_id IS NULL OR x.branch_id IS NULL OR x.branch_id = a.branch_id)
    AND (x.appointment_time, coalesce(x.queue_number, 0), x.created_at)
      < (a.appointment_time, coalesce(a.queue_number, 0), a.created_at)
$$;

-- 056's patient page, now with each visit's queue number (NULL for time clinics).
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
BEGIN
  SELECT * INTO a FROM appointments WHERE manage_code = p_code;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'NOT_FOUND'); END IF;
  SELECT * INTO b FROM businesses WHERE id = a.business_id;
  v_today := (now() AT TIME ZONE business_time_zone(b.country))::date;
  IF a.appointment_date < v_today - 7 THEN RETURN jsonb_build_object('error', 'EXPIRED'); END IF;

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
          'can_cancel', patient_can_cancel(x, b),
          'ahead', CASE WHEN x.status = 'confirmed' AND x.appointment_date = v_today THEN patients_ahead(x) END
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

REVOKE ALL ON FUNCTION public_booking_mode(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public_queue_periods(uuid, uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public_my_queue_number(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_booking_mode(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public_queue_periods(uuid, uuid, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public_my_queue_number(uuid) TO anon, authenticated;
