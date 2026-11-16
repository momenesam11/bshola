-- When a clinic that books by turn changes its hours, bookings already made
-- keep the old start time and their own numbering: a period that moved from
-- 18:55 to 18:00 then holds two number 1s. This lets the clinic move those
-- bookings into the period they now fall in.
--
--   queue_period_start(business, branch, date, time)
--       the start of the working period that time falls in, by the branch's
--       hours if it has any, else the clinic's (the booking page's rule).
--       assign_queue_number() now uses it too, so the two never disagree.
--   queue_realign_plan(business)
--       from today on: waiting bookings whose time is inside a period but not
--       its start, and the new numbers of each period they join. Numbers go
--       by who booked first (waiting and done before no-shows), so a moved
--       patient who booked earlier keeps a low number.
--   queue_realign(business, apply)
--       returns the plan; with apply = true, carries it out.
--
-- Under the caller's own rights: an owner sees and moves only their bookings.
-- Additive. Rollback: supabase/rollbacks/061_queue_realign_down.sql.

CREATE OR REPLACE FUNCTION queue_period_start(p_business_id uuid, p_branch_id uuid, p_date date, p_time time)
RETURNS time
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_day text := (ARRAY['sun','mon','tue','wed','thu','fri','sat'])[extract(dow FROM p_date)::int + 1];
  v_hours jsonb;
  v_start time;
BEGIN
  IF EXISTS (
    SELECT 1 FROM branches br, jsonb_each(coalesce(br.schedule_blocks, '{}'::jsonb)) d
    WHERE br.id = p_branch_id AND jsonb_typeof(d.value) = 'array' AND jsonb_array_length(d.value) > 0
  ) THEN
    SELECT (blk->>'start')::time INTO v_start
    FROM branches br, jsonb_array_elements(coalesce(br.schedule_blocks -> v_day, '[]'::jsonb)) blk
    WHERE br.id = p_branch_id
      AND p_time >= (blk->>'start')::time AND p_time < (blk->>'end')::time
    LIMIT 1;
    RETURN v_start;
  END IF;

  SELECT b.working_hours -> v_day INTO v_hours FROM businesses b WHERE b.id = p_business_id;
  IF jsonb_typeof(v_hours) = 'object' AND coalesce((v_hours->>'active')::boolean, false) THEN
    SELECT (p->>'open')::time INTO v_start
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(v_hours->'periods') = 'array' AND jsonb_array_length(v_hours->'periods') > 0
           THEN v_hours->'periods'
           WHEN v_hours ? 'open' THEN jsonb_build_array(jsonb_build_object('open', v_hours->>'open', 'close', v_hours->>'close'))
           ELSE '[]'::jsonb END) p
    WHERE p_time >= (p->>'open')::time AND p_time < (p->>'close')::time
    LIMIT 1;
  END IF;
  RETURN v_start;
END;
$$;

-- 060's numbering, with the period lookup moved into queue_period_start(),
-- and a way for queue_realign() to set times and numbers itself.
CREATE OR REPLACE FUNCTION assign_queue_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  b businesses%ROWTYPE;
  v_is_owner boolean;
  v_taken integer;
  v_start time;
BEGIN
  -- queue_realign() is placing these rows itself, in this transaction only.
  IF current_setting('beshola.queue_realign', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.status <> 'confirmed' THEN
    RETURN NEW;
  END IF;
  SELECT * INTO b FROM businesses WHERE id = NEW.business_id;
  IF b.booking_mode IS DISTINCT FROM 'queue' THEN
    NEW.queue_number := NULL;
    RETURN NEW;
  END IF;

  v_start := queue_period_start(NEW.business_id, NEW.branch_id, NEW.appointment_date, NEW.appointment_time);
  IF v_start IS NOT NULL THEN
    NEW.appointment_time := v_start;
  END IF;

  -- An update keeps its number unless the visit moved to another period.
  IF TG_OP = 'UPDATE' AND OLD.queue_number IS NOT NULL
     AND NEW.appointment_date = OLD.appointment_date
     AND NEW.appointment_time = OLD.appointment_time
     AND NEW.branch_id IS NOT DISTINCT FROM OLD.branch_id THEN
    NEW.queue_number := OLD.queue_number;
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'queue|' || NEW.business_id::text || '|' || coalesce(NEW.branch_id::text, '') || '|'
      || NEW.appointment_date::text || '|' || NEW.appointment_time::text, 0));

  v_is_owner := auth.uid() IS NOT NULL AND b.owner_id = auth.uid();
  IF NOT v_is_owner AND coalesce(auth.role(), '') <> 'service_role' AND b.queue_limit IS NOT NULL THEN
    SELECT count(*) INTO v_taken FROM appointments
      WHERE business_id = NEW.business_id AND branch_id IS NOT DISTINCT FROM NEW.branch_id
        AND appointment_date = NEW.appointment_date AND appointment_time = NEW.appointment_time
        AND status IN ('confirmed', 'completed', 'no_show')
        AND id <> coalesce(NEW.id, gen_random_uuid());
    IF v_taken >= b.queue_limit THEN
      RAISE EXCEPTION 'QUEUE_FULL: this period is fully booked';
    END IF;
  END IF;

  SELECT coalesce(max(queue_number), 0) + 1 INTO NEW.queue_number FROM appointments
    WHERE business_id = NEW.business_id AND branch_id IS NOT DISTINCT FROM NEW.branch_id
      AND appointment_date = NEW.appointment_date AND appointment_time = NEW.appointment_time;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION queue_realign_plan(p_business_id uuid)
RETURNS TABLE (
  id uuid, client_name text, client_phone text, appointment_date date, branch_id uuid,
  old_time time, new_time time, old_number integer, new_number integer, status text
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
    SELECT * FROM cand c WHERE c.status = 'confirmed' AND c.target IS NOT NULL AND c.target <> c.appointment_time
  ),
  groups AS (SELECT DISTINCT m.appointment_date, m.branch_id, m.target FROM moving m),
  members AS (
    SELECT c.*, g.target AS dest
    FROM cand c
    JOIN groups g ON c.appointment_date = g.appointment_date AND c.branch_id IS NOT DISTINCT FROM g.branch_id
    WHERE c.appointment_time = g.target
       OR (c.status = 'confirmed' AND c.target = g.target AND c.appointment_time <> g.target)
  ),
  numbered AS (
    SELECT m.*, row_number() OVER (
      PARTITION BY m.appointment_date, m.branch_id, m.dest
      ORDER BY CASE WHEN m.status IN ('confirmed', 'completed') THEN 0 WHEN m.status = 'no_show' THEN 1 ELSE 2 END,
               m.created_at, m.queue_number
    )::int AS n
    FROM members m
  )
  SELECT x.id, x.client_name, x.client_phone, x.appointment_date, x.branch_id,
         x.appointment_time, x.dest, x.queue_number, x.n, x.status
  FROM numbered x
  WHERE x.appointment_time <> x.dest OR x.queue_number <> x.n
  ORDER BY x.appointment_date, x.dest, x.n
$$;

CREATE OR REPLACE FUNCTION queue_realign(p_business_id uuid, p_apply boolean DEFAULT false)
RETURNS TABLE (
  id uuid, client_name text, client_phone text, appointment_date date, branch_id uuid,
  old_time time, new_time time, old_number integer, new_number integer, status text
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

  -- One realignment at a time per clinic, and none while a booking is numbered.
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

REVOKE ALL ON FUNCTION queue_period_start(uuid, uuid, date, time) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION queue_realign_plan(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION queue_realign(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION queue_period_start(uuid, uuid, date, time) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION queue_realign_plan(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION queue_realign(uuid, boolean) TO authenticated;
