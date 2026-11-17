-- The clinic's screens put a booking that falls in no period (booked before the
-- clinic booked by turn, or before its hours changed) under the nearest period,
-- but the database left it on its own: its own numbering, never moved by
-- «انقلهم لفتراتهم». A clinic page then showed a column of 1s with no banner.
-- Now the database follows the screens' rule:
--
--   queue_day_periods(business, branch, date)
--       the day's periods, by the branch's hours if it has any, else the
--       clinic's (as queue_period_start, 061).
--   queue_nearest_period(business, branch, date, time)
--       the period the time falls in, else the nearest one (the earlier on a
--       tie), else NULL on a day with no period.
--   queue_period_of()   (062) now uses the nearest period, so numbering,
--       counts, «قدامك كام» and the screen treat those bookings as part of it.
--   queue_realign_plan() (063) moves them into the nearest period too; on a day
--       with no period at all, the whole day goes to its earliest booked time
--       and is numbered once.
--
-- Same signatures; safe to run again.
-- Rollback: supabase/rollbacks/064_queue_nearest_period_down.sql.

CREATE OR REPLACE FUNCTION queue_day_periods(p_business_id uuid, p_branch_id uuid, p_date date)
RETURNS TABLE (start_time time, end_time time)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_day text := (ARRAY['sun','mon','tue','wed','thu','fri','sat'])[extract(dow FROM p_date)::int + 1];
  v_hours jsonb;
BEGIN
  IF EXISTS (
    SELECT 1 FROM branches br, jsonb_each(coalesce(br.schedule_blocks, '{}'::jsonb)) d
    WHERE br.id = p_branch_id AND jsonb_typeof(d.value) = 'array' AND jsonb_array_length(d.value) > 0
  ) THEN
    RETURN QUERY
      SELECT (blk->>'start')::time, (blk->>'end')::time
      FROM branches br, jsonb_array_elements(coalesce(br.schedule_blocks -> v_day, '[]'::jsonb)) blk
      WHERE br.id = p_branch_id;
    RETURN;
  END IF;

  SELECT b.working_hours -> v_day INTO v_hours FROM businesses b WHERE b.id = p_business_id;
  IF jsonb_typeof(v_hours) = 'object' AND coalesce((v_hours->>'active')::boolean, false) THEN
    RETURN QUERY
      SELECT (p->>'open')::time, (p->>'close')::time
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(v_hours->'periods') = 'array' AND jsonb_array_length(v_hours->'periods') > 0
             THEN v_hours->'periods'
             WHEN v_hours ? 'open' THEN jsonb_build_array(jsonb_build_object('open', v_hours->>'open', 'close', v_hours->>'close'))
             ELSE '[]'::jsonb END) p;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION queue_nearest_period(p_business_id uuid, p_branch_id uuid, p_date date, p_time time)
RETURNS time
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(
    (SELECT d.start_time FROM queue_day_periods(p_business_id, p_branch_id, p_date) d
      WHERE p_time >= d.start_time AND p_time < d.end_time ORDER BY d.start_time LIMIT 1),
    (SELECT d.start_time FROM queue_day_periods(p_business_id, p_branch_id, p_date) d
      ORDER BY abs(extract(epoch FROM d.start_time) - extract(epoch FROM p_time)), d.start_time LIMIT 1)
  )
$$;

-- 062's "the period a booking is in", now the nearest period when outside all.
CREATE OR REPLACE FUNCTION queue_period_of(p_business_id uuid, p_branch_id uuid, p_date date, p_time time)
RETURNS time
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(queue_nearest_period(p_business_id, p_branch_id, p_date, p_time), p_time)
$$;

-- 063's plan, with the nearest period as the target, and on a day with no
-- period the day's earliest booked time, so that day is numbered once too.
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
  base AS (
    SELECT a.*,
           queue_nearest_period(a.business_id, a.branch_id, a.appointment_date, a.appointment_time) AS nearest,
           min(a.appointment_time) FILTER (WHERE a.status <> 'cancelled')
             OVER (PARTITION BY a.appointment_date, a.branch_id) AS day_first
    FROM appointments a, biz
    WHERE a.business_id = biz.id AND a.appointment_date >= biz.today AND a.queue_number IS NOT NULL
  ),
  cand AS (
    SELECT b.*, coalesce(b.nearest, b.day_first) AS target FROM base b
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

REVOKE ALL ON FUNCTION queue_day_periods(uuid, uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION queue_nearest_period(uuid, uuid, date, time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION queue_day_periods(uuid, uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION queue_nearest_period(uuid, uuid, date, time) TO authenticated, service_role;
REVOKE ALL ON FUNCTION queue_period_of(uuid, uuid, date, time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION queue_period_of(uuid, uuid, date, time) TO authenticated, service_role;
REVOKE ALL ON FUNCTION queue_realign_plan(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION queue_realign_plan(uuid) TO authenticated;
