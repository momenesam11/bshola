-- One clinic's last N days in numbers, for the summary the Beshola team sends
-- the doctor before renewal from /admin. Counts only: no patient names,
-- numbers or notes leave this function.
--
--   appointments      visits dated in the period, waitlist excluded
--   completed         of those, attended
--   no_shows          of those, marked as not attended
--   cancelled         of those, cancelled
--   online_bookings   of those, booked by patients from the booking page
--                     (guard_public_booking stamps booking_ip_hash on these)
--   reminders_sent    of those, reminded on WhatsApp
--   patients          distinct numbers among those
--   new_patients      numbers whose first visit at this clinic is in the period
--   review_requests   Google review requests sent in the period (051)
--
-- Only the service role (the admin Edge Function) can call it.
--
-- Rollback: supabase/rollbacks/052_admin_business_summary_down.sql.

CREATE OR REPLACE FUNCTION admin_business_summary(p_business_id uuid, p_days integer DEFAULT 30)
RETURNS TABLE (
  period_start date,
  period_end date,
  appointments integer,
  completed integer,
  no_shows integer,
  cancelled integer,
  online_bookings integer,
  reminders_sent integer,
  patients integer,
  new_patients integer,
  review_requests integer
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH period AS (
    SELECT current_date - (greatest(1, least(p_days, 366)) - 1) AS start_d, current_date AS end_d
  ),
  visits AS (
    SELECT a.*
    FROM appointments a, period p
    WHERE a.business_id = p_business_id
      AND a.status <> 'waitlist'
      AND a.appointment_date BETWEEN p.start_d AND p.end_d
  ),
  first_visits AS (
    SELECT client_phone, min(appointment_date) AS first_date
    FROM appointments
    WHERE business_id = p_business_id AND status <> 'waitlist'
    GROUP BY client_phone
  )
  SELECT
    p.start_d,
    p.end_d,
    (SELECT count(*) FROM visits)::int,
    (SELECT count(*) FROM visits WHERE status = 'completed')::int,
    (SELECT count(*) FROM visits WHERE status = 'no_show')::int,
    (SELECT count(*) FROM visits WHERE status = 'cancelled')::int,
    (SELECT count(*) FROM visits WHERE booking_ip_hash IS NOT NULL)::int,
    (SELECT count(*) FROM visits WHERE reminder_sent)::int,
    (SELECT count(DISTINCT client_phone) FROM visits)::int,
    (SELECT count(*) FROM first_visits f WHERE f.first_date BETWEEN p.start_d AND p.end_d)::int,
    (SELECT count(*) FROM appointments a
      WHERE a.business_id = p_business_id
        AND a.review_requested_at >= p.start_d::timestamptz)::int
  FROM period p
$$;

REVOKE ALL ON FUNCTION admin_business_summary(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_business_summary(uuid, integer) TO service_role;
