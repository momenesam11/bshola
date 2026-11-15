-- More of each clinic's activity in /admin, counts only (never patient rows):
--
--   admin_feature_usage()   per clinic: by time or by turn, the front desk
--                           (calls and arrivals, 058), WhatsApp "come now"
--                           messages (053), and how complete the setup is
--   admin_platform_stats()  every clinic together: bookings today and this
--                           week, clinics active this week, messages, and 12
--                           weeks of bookings and signups
--
-- Service role only, called through the admin Edge Function like
-- admin_business_activity (050). Needs 058 (called_at, arrived_at, map_url).
-- Additive: two new functions. Rollback: supabase/rollbacks/059_admin_insights_down.sql.

CREATE OR REPLACE FUNCTION admin_feature_usage()
RETURNS TABLE (
  business_id uuid,
  booking_mode text,
  calls_30d integer,
  arrivals_30d integer,
  heads_up_30d integer,
  services integer,
  has_hours boolean,
  has_logo boolean,
  has_map boolean
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    b.id,
    b.booking_mode,
    coalesce(u.calls, 0),
    coalesce(u.arrivals, 0),
    coalesce(u.heads_up, 0),
    (SELECT count(*)::int FROM services s WHERE s.business_id = b.id),
    EXISTS (
      SELECT 1 FROM branches br, jsonb_each(coalesce(br.schedule_blocks, '{}'::jsonb)) d
      WHERE br.business_id = b.id AND jsonb_typeof(d.value) = 'array' AND jsonb_array_length(d.value) > 0
    ) OR EXISTS (
      SELECT 1 FROM jsonb_each(coalesce(b.working_hours, '{}'::jsonb)) d
      WHERE jsonb_typeof(d.value) = 'object' AND (d.value->>'active')::boolean IS TRUE
    ),
    b.logo_url IS NOT NULL AND b.logo_url <> '',
    EXISTS (SELECT 1 FROM branches br WHERE br.business_id = b.id AND br.map_url IS NOT NULL)
  FROM businesses b
  LEFT JOIN (
    SELECT a.business_id,
      (count(*) FILTER (WHERE a.called_at > now() - interval '30 days'))::int AS calls,
      (count(*) FILTER (WHERE a.arrived_at > now() - interval '30 days'))::int AS arrivals,
      (count(*) FILTER (WHERE a.queue_notified_at > now() - interval '30 days'))::int AS heads_up
    FROM appointments a
    WHERE a.appointment_date >= current_date - 31
    GROUP BY a.business_id
  ) u ON u.business_id = b.id
$$;

CREATE OR REPLACE FUNCTION admin_platform_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH cairo AS (SELECT (now() AT TIME ZONE 'Africa/Cairo')::date AS today),
  weeks AS (
    SELECT generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') AS week_start
  )
  SELECT jsonb_build_object(
    'bookings_today', (SELECT count(*) FROM appointments a, cairo
                       WHERE (a.created_at AT TIME ZONE 'Africa/Cairo')::date = cairo.today),
    'bookings_7d', (SELECT count(*) FROM appointments WHERE created_at > now() - interval '7 days'),
    'active_clinics_7d', (SELECT count(DISTINCT business_id) FROM appointments WHERE created_at > now() - interval '7 days'),
    'heads_up_7d', (SELECT count(*) FROM appointments WHERE queue_notified_at > now() - interval '7 days'),
    'reminders_7d', (SELECT count(*) FROM appointments a, cairo
                     WHERE a.reminder_sent AND a.appointment_date BETWEEN cairo.today - 6 AND cairo.today + 1),
    'queue_clinics', (SELECT count(*) FROM businesses WHERE booking_mode = 'queue'),
    'front_desk_clinics_30d', (SELECT count(DISTINCT business_id) FROM appointments WHERE called_at > now() - interval '30 days'),
    'weekly', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'week', to_char(w.week_start, 'YYYY-MM-DD'),
        'bookings', (SELECT count(*) FROM appointments a WHERE a.created_at >= w.week_start AND a.created_at < w.week_start + interval '1 week'),
        'signups', (SELECT count(*) FROM businesses x WHERE x.created_at >= w.week_start AND x.created_at < w.week_start + interval '1 week')
      ) ORDER BY w.week_start), '[]'::jsonb)
      FROM weeks w
    )
  )
$$;

REVOKE ALL ON FUNCTION admin_feature_usage() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION admin_platform_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_feature_usage() TO service_role;
GRANT EXECUTE ON FUNCTION admin_platform_stats() TO service_role;
