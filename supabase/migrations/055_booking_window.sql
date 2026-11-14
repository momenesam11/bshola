-- How far ahead patients may book online, per clinic.
--
--   businesses.booking_window_days   NULL keeps today's behaviour (the booking page
--                                    offers the next 30 open days); 1..365 lets
--                                    patients book from today up to that many days
--                                    ahead, in the clinic's local time.
--
-- Additive only: one nullable column, two functions and one trigger. No existing
-- row changes, and appointments already booked beyond a new window stay booked.
-- The clinic owner can still add any appointment on any day from the dashboard.
-- Needs business_time_zone() from 054.
--
-- Rollback: supabase/rollbacks/055_booking_window_down.sql.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS booking_window_days smallint
  CONSTRAINT businesses_booking_window_days_check
  CHECK (booking_window_days IS NULL OR booking_window_days BETWEEN 1 AND 365);

-- The last date a patient may book online, or NULL when the clinic set no window.
-- Visitors can't read businesses, so the booking page asks through this.
CREATE OR REPLACE FUNCTION last_bookable_date(p_business_id uuid)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN b.booking_window_days IS NULL THEN NULL
    ELSE (now() AT TIME ZONE business_time_zone(b.country))::date + b.booking_window_days
  END
  FROM businesses b
  WHERE b.id = p_business_id
$$;

REVOKE ALL ON FUNCTION last_bookable_date(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION last_bookable_date(uuid) TO anon, authenticated;

-- Refuses a visitor's booking past the window. Like guard_public_booking, it is
-- deliberately not SECURITY DEFINER so current_user is the caller's role, and
-- the owner and the service role pass straight through.
CREATE OR REPLACE FUNCTION enforce_booking_window()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_last date;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM businesses WHERE id = NEW.business_id AND owner_id = auth.uid()
  ) THEN
    RETURN NEW;
  END IF;
  v_last := last_bookable_date(NEW.business_id);
  IF v_last IS NOT NULL AND NEW.appointment_date > v_last THEN
    RAISE EXCEPTION 'INVALID_BOOKING: too_far';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_booking_window ON appointments;
CREATE TRIGGER enforce_booking_window
  BEFORE INSERT ON appointments
  FOR EACH ROW EXECUTE FUNCTION enforce_booking_window();
