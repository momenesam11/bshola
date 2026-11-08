-- Puts back service lengths changed by 047 and the exact-time double-booking
-- check from 023/024. Run the code rollback first: the booking page calls
-- public_busy_ranges, which this removes.

DO $$
BEGIN
  UPDATE services s
  SET duration_minutes = l.old_minutes
  FROM service_duration_047_log l, businesses b
  WHERE l.service_id = s.id
    AND b.id = s.business_id
    AND s.duration_minutes = b.slot_duration;
END $$;

DROP TABLE IF EXISTS service_duration_047_log;
DROP FUNCTION IF EXISTS public_busy_ranges(uuid, date, uuid);

CREATE OR REPLACE FUNCTION check_capacity_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_count int;
  max_capacity int;
BEGIN
  IF NEW.status != 'confirmed' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.branch_id::text || '|' || NEW.appointment_date::text || '|' || NEW.appointment_time::text, 0)
  );

  SELECT capacity INTO max_capacity FROM branches WHERE id = NEW.branch_id;
  IF max_capacity IS NULL THEN
    max_capacity := 1;
  END IF;

  SELECT COUNT(*) INTO current_count
  FROM appointments
  WHERE branch_id = NEW.branch_id
    AND appointment_date = NEW.appointment_date
    AND appointment_time = NEW.appointment_time
    AND status = 'confirmed'
    AND id != COALESCE(NEW.id, gen_random_uuid());

  IF current_count >= max_capacity THEN
    RAISE EXCEPTION 'CAPACITY_EXCEEDED: This time slot is fully booked';
  END IF;

  RETURN NEW;
END;
$$;
