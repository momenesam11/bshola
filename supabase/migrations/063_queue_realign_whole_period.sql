-- «انقلهم لفتراتهم» (061) moved only the waiting patients, so a period whose
-- done and no-show visits sat on other start times (a clinic that switched
-- from booking by time, each visit numbered 1 for its own time) kept a column
-- of 1s. It now realigns the whole period from today on:
--
--   every booking that isn't cancelled, whatever its status, moves to the
--   start of the period it falls in, and the period is numbered once:
--   done visits first (in the order they went in), then whoever is inside,
--   then the waiting (by who booked first), then no-shows.
--
-- The plan also returns called_at, so the page messages only the patients
-- still waiting whose number changed. 062 already keeps new bookings from
-- repeating a number; this clears the ones made before it.
--
-- The return type changes, so both functions are dropped and created again.
-- Rollback: supabase/rollbacks/063_queue_realign_whole_period_down.sql (back to 061).

DROP FUNCTION IF EXISTS queue_realign(uuid, boolean);
DROP FUNCTION IF EXISTS queue_realign_plan(uuid);

CREATE FUNCTION queue_realign_plan(p_business_id uuid)
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

CREATE FUNCTION queue_realign(p_business_id uuid, p_apply boolean DEFAULT false)
RETURNS TABLE (
  id uuid, client_name text, client_phone text, appointment_date date, branch_id uuid,
  old_time time, new_time time, old_number integer, new_number integer, status text, called_at timestamptz
)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ids uuid[];
  v_times time[];
  v_numbers integer[];
BEGIN
  IF NOT p_apply THEN
    RETURN QUERY SELECT * FROM queue_realign_plan(p_business_id);
    RETURN;
  END IF;

  -- One realignment at a time per clinic.
  PERFORM pg_advisory_xact_lock(hashtextextended('realign|' || p_business_id::text, 0));

  SELECT array_agg(p.id), array_agg(p.new_time), array_agg(p.new_number)
    INTO v_ids, v_times, v_numbers
  FROM queue_realign_plan(p_business_id) p;

  IF v_ids IS NOT NULL THEN
    RETURN QUERY SELECT * FROM queue_realign_plan(p_business_id);
    PERFORM set_config('beshola.queue_realign', 'on', true);
    -- Out of the way first (negative numbers never clash), then into place.
    UPDATE appointments a SET queue_number = -u.n
      FROM unnest(v_ids, v_numbers) AS u(id, n) WHERE a.id = u.id;
    UPDATE appointments a SET appointment_time = u.t, queue_number = u.n
      FROM unnest(v_ids, v_times, v_numbers) AS u(id, t, n) WHERE a.id = u.id;
    PERFORM set_config('beshola.queue_realign', 'off', true);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION queue_realign_plan(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION queue_realign(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION queue_realign_plan(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION queue_realign(uuid, boolean) TO authenticated;
