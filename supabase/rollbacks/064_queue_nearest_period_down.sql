-- Undoes 064_queue_nearest_period.sql: queue_period_of and the realign plan go
-- back to their 062/063 versions (a booking outside every period stays on its
-- own). Bookings already moved stay where they are.

CREATE OR REPLACE FUNCTION queue_period_of(p_business_id uuid, p_branch_id uuid, p_date date, p_time time)
RETURNS time
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(queue_period_start(p_business_id, p_branch_id, p_date, p_time), p_time)
$$;

CREATE OR REPLACE FUNCTION queue_realign_plan(p_business_id uuid)
RETURNS TABLE (
  id uuid, client_name text, client_phone text, appointment_date date, branch_id uuid,
  old_time time, new_time time, old_number integer, new_number integer, status text, called_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH biz AS (
    SELECT b.id, (now() AT TIME ZONE business_time_zone(b.country))::date AS today
    FROM businesses b WHERE b.id = p_business_id AND b.booking_mode = 'queue'
  ),
  cand AS (
    SELECT a.*, queue_period_start(a.business_id, a.branch_id, a.appointment_date, a.appointment_time) AS target
    FROM appointments a, biz
    WHERE a.business_id = biz.id AND a.appointment_date >= biz.today AND a.queue_number IS NOT NULL
  ),
  moving AS (
    SELECT * FROM cand c WHERE c.status <> 'cancelled' AND c.target IS NOT NULL AND c.target <> c.appointment_time
  ),
  groups AS (SELECT DISTINCT m.appointment_date, m.branch_id, m.target FROM moving m),
  members AS (
    SELECT c.*, g.target AS dest
    FROM cand c
    JOIN groups g ON c.appointment_date = g.appointment_date AND c.branch_id IS NOT DISTINCT FROM g.branch_id
    WHERE c.appointment_time = g.target
       OR (c.status <> 'cancelled' AND c.target = g.target AND c.appointment_time <> g.target)
  ),
  numbered AS (
    SELECT m.*, row_number() OVER (
      PARTITION BY m.appointment_date, m.branch_id, m.dest
      ORDER BY
        CASE WHEN m.status = 'completed' THEN 0
             WHEN m.status = 'confirmed' AND m.called_at IS NOT NULL THEN 1
             WHEN m.status = 'confirmed' THEN 2
             WHEN m.status = 'no_show' THEN 3
             ELSE 4 END,
        CASE WHEN m.status = 'completed' THEN coalesce(m.called_at, m.finished_at, m.created_at) END,
        m.created_at, m.queue_number
    )::int AS n
    FROM members m
  )
  SELECT x.id, x.client_name, x.client_phone, x.appointment_date, x.branch_id,
         x.appointment_time, x.dest, x.queue_number, x.n, x.status, x.called_at
  FROM numbered x
  WHERE x.appointment_time <> x.dest OR x.queue_number <> x.n
  ORDER BY x.appointment_date, x.dest, x.n
$$;

DROP FUNCTION IF EXISTS queue_nearest_period(uuid, uuid, date, time);
DROP FUNCTION IF EXISTS queue_day_periods(uuid, uuid, date);
