-- Undoes 055_booking_window.sql. Clinics go back to the default 30 open days;
-- no appointment changes.
DROP TRIGGER IF EXISTS enforce_booking_window ON appointments;
DROP FUNCTION IF EXISTS enforce_booking_window();
DROP FUNCTION IF EXISTS last_bookable_date(uuid);
ALTER TABLE businesses DROP COLUMN IF EXISTS booking_window_days;
