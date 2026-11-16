-- Undoes 061_queue_realign.sql: drops the realign functions and puts
-- assign_queue_number back to its 060 version. Bookings already moved stay
-- where they are.

DROP FUNCTION IF EXISTS queue_realign(uuid, boolean);
DROP FUNCTION IF EXISTS queue_realign_plan(uuid);

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
  v_day text;
  v_hours jsonb;
  v_has_blocks boolean;
BEGIN
  IF NEW.status <> 'confirmed' THEN
    RETURN NEW;
  END IF;
  SELECT * INTO b FROM businesses WHERE id = NEW.business_id;
  IF b.booking_mode IS DISTINCT FROM 'queue' THEN
    NEW.queue_number := NULL;
    RETURN NEW;
  END IF;

  -- A time inside a working period counts as that period. The branch's own
  -- hours if it has any (as the booking page decides), else the clinic's.
  v_day := (ARRAY['sun','mon','tue','wed','thu','fri','sat'])[extract(dow FROM NEW.appointment_date)::int + 1];
  SELECT EXISTS (
    SELECT 1 FROM branches br, jsonb_each(coalesce(br.schedule_blocks, '{}'::jsonb)) d
    WHERE br.id = NEW.branch_id AND jsonb_typeof(d.value) = 'array' AND jsonb_array_length(d.value) > 0
  ) INTO v_has_blocks;

  IF v_has_blocks THEN
    SELECT (blk->>'start')::time INTO v_start
    FROM branches br,
         jsonb_array_elements(coalesce(br.schedule_blocks -> v_day, '[]'::jsonb)) blk
    WHERE br.id = NEW.branch_id
      AND NEW.appointment_time >= (blk->>'start')::time
      AND NEW.appointment_time < (blk->>'end')::time
    LIMIT 1;
  ELSE
    v_hours := b.working_hours -> v_day;
    IF jsonb_typeof(v_hours) = 'object' AND coalesce((v_hours->>'active')::boolean, false) THEN
      SELECT (p->>'open')::time INTO v_start
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(v_hours->'periods') = 'array' AND jsonb_array_length(v_hours->'periods') > 0
             THEN v_hours->'periods'
             WHEN v_hours ? 'open' THEN jsonb_build_array(jsonb_build_object('open', v_hours->>'open', 'close', v_hours->>'close'))
             ELSE '[]'::jsonb END) p
      WHERE NEW.appointment_time >= (p->>'open')::time
        AND NEW.appointment_time < (p->>'close')::time
      LIMIT 1;
    END IF;
  END IF;
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

DROP FUNCTION IF EXISTS queue_period_start(uuid, uuid, date, time);
