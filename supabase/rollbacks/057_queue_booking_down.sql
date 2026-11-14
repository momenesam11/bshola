-- Undoes 057_queue_booking.sql. Every clinic goes back to booking by time; queue
-- numbers already given are dropped with their column. Restores the 047 capacity
-- guard and the 056 patient page and queue count.
DROP TRIGGER IF EXISTS assign_queue_number ON appointments;
DROP FUNCTION IF EXISTS assign_queue_number();
DROP FUNCTION IF EXISTS public_my_queue_number(uuid);
DROP FUNCTION IF EXISTS public_queue_periods(uuid, uuid, date);
DROP FUNCTION IF EXISTS public_booking_mode(uuid);

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
    AND (x.appointment_time, x.created_at) < (a.appointment_time, a.created_at)
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
          'status', x.status, 'service', s.name, 'branch', br.name, 'address', br.address,
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
          'status', x.status, 'service', s.name, 'branch', br.name
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

DROP INDEX IF EXISTS appointments_booking_ref_idx;
DROP INDEX IF EXISTS appointments_queue_number_key;
ALTER TABLE appointments DROP COLUMN IF EXISTS booking_ref;
ALTER TABLE appointments DROP COLUMN IF EXISTS queue_number;
ALTER TABLE businesses DROP COLUMN IF EXISTS queue_limit;
ALTER TABLE businesses DROP COLUMN IF EXISTS booking_mode;
