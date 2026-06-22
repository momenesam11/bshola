-- SECURITY/INTEGRITY FIX (C4): capacity was only checked in the frontend
-- (count existing confirmed bookings, compare to branch.capacity, then
-- insert) before writing. Two requests racing the same slot — most likely
-- on the public booking page, e.g. two people tapping "confirm" on the same
-- last open clinic slot within the same second — can both pass that check
-- before either insert lands, over-booking past capacity. This is most
-- dangerous for capacity = 1 clinics, where it means two patients booked
-- for the exact same appointment. Postgres itself is now the final
-- authority: the trigger re-counts inside the same transaction as the
-- write, so the second writer is always rejected.

CREATE OR REPLACE FUNCTION check_capacity_before_insert()
RETURNS TRIGGER AS $$
DECLARE
  current_count int;
  max_capacity int;
BEGIN
  -- Only confirmed bookings consume capacity (waitlist/cancelled/no_show/
  -- completed don't compete for the slot — matches useBookedSlotCounts()).
  IF NEW.status != 'confirmed' THEN
    RETURN NEW;
  END IF;

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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_capacity_on_insert ON appointments;
CREATE TRIGGER enforce_capacity_on_insert
  BEFORE INSERT ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION check_capacity_before_insert();

-- Also re-check when an existing row transitions INTO 'confirmed' (e.g. a
-- waitlisted appointment gets manually confirmed by the owner).
DROP TRIGGER IF EXISTS enforce_capacity_on_update ON appointments;
CREATE TRIGGER enforce_capacity_on_update
  BEFORE UPDATE ON appointments
  FOR EACH ROW
  WHEN (NEW.status = 'confirmed' AND (OLD.status IS DISTINCT FROM 'confirmed' OR OLD.appointment_time IS DISTINCT FROM NEW.appointment_time OR OLD.appointment_date IS DISTINCT FROM NEW.appointment_date OR OLD.branch_id IS DISTINCT FROM NEW.branch_id))
  EXECUTE FUNCTION check_capacity_before_insert();
