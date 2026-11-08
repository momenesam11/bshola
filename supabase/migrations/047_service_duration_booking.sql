-- Online booking follows each service's own length. A one-hour service booked
-- at 10:00 now closes 10:30 too, for visitors only: the clinic can still add
-- anyone at any time from the dashboard, overlapping or not.

-- What's taken on a day: start and length only, never who booked or for what.
CREATE OR REPLACE FUNCTION public_busy_ranges(p_business_id uuid, p_date date, p_branch_id uuid DEFAULT NULL)
RETURNS TABLE (start_time text, duration_minutes int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT to_char(a.appointment_time, 'HH24:MI'),
         COALESCE(s.duration_minutes, b.slot_duration, 30)
  FROM appointments a
  JOIN businesses b ON b.id = a.business_id
  LEFT JOIN services s ON s.id = a.service_id
  WHERE a.business_id = p_business_id
    AND a.appointment_date = p_date
    AND p_date >= CURRENT_DATE - 1
    AND a.status = 'confirmed'
    AND (p_branch_id IS NULL OR a.branch_id = p_branch_id);
$$;

GRANT EXECUTE ON FUNCTION public_busy_ranges(uuid, date, uuid) TO anon, authenticated;

-- Refuses a visitor's booking when the whole of its length doesn't fit under
-- the branch's capacity. Times are compared in minutes because adding to a
-- `time` wraps around midnight.
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

-- A service length used to change nothing, so most still hold the default 30.
-- Giving those the clinic's old appointment length keeps its timetable as it was.
CREATE TABLE IF NOT EXISTS service_duration_047_log (
  service_id uuid PRIMARY KEY,
  old_minutes int NOT NULL
);
ALTER TABLE service_duration_047_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  INSERT INTO service_duration_047_log (service_id, old_minutes)
  SELECT s.id, s.duration_minutes
  FROM services s
  JOIN businesses b ON b.id = s.business_id
  WHERE s.duration_minutes = 30 AND b.slot_duration <> 30
  ON CONFLICT (service_id) DO NOTHING;

  UPDATE services s
  SET duration_minutes = b.slot_duration
  FROM businesses b, service_duration_047_log l
  WHERE b.id = s.business_id
    AND l.service_id = s.id
    AND s.duration_minutes = 30
    AND b.slot_duration <> 30;
END $$;
