-- How much each clinic actually uses Beshola, for the "sleeping clinics" alert
-- in /admin. One row per business that has ever had an appointment, counts and
-- dates only: no patient names, numbers or notes leave this function.
--
--   last_booking_at   when the clinic or a patient last added an appointment
--   bookings_30d      appointments added in the last 30 days
--   visits_30d        appointments dated in the last 30 days, waitlist excluded
--   reminders_30d     of those visits, how many got a WhatsApp reminder
--
-- Only the service role (the admin Edge Function) can call it.
--
-- Rollback: supabase/rollbacks/050_admin_business_activity_down.sql.

CREATE OR REPLACE FUNCTION admin_business_activity()
RETURNS TABLE (
  business_id uuid,
  last_booking_at timestamptz,
  bookings_30d integer,
  visits_30d integer,
  reminders_30d integer
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    a.business_id,
    max(a.created_at),
    (count(*) FILTER (WHERE a.created_at > now() - interval '30 days'))::int,
    (count(*) FILTER (WHERE a.status <> 'waitlist'
      AND a.appointment_date BETWEEN current_date - 30 AND current_date))::int,
    (count(*) FILTER (WHERE a.status <> 'waitlist' AND a.reminder_sent
      AND a.appointment_date BETWEEN current_date - 30 AND current_date))::int
  FROM appointments a
  GROUP BY a.business_id
$$;

REVOKE ALL ON FUNCTION admin_business_activity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_business_activity() TO service_role;
