-- Booking by turn numbers each period from 1 (057), but the patient's "ahead"
-- count and the waiting-room screen (058) looked at the whole day, so the
-- morning's leftovers counted against the evening and the screen showed two
-- number 1s. Now, for a clinic that books by turn:
--
--   patients_ahead()       counts whoever is inside plus the same period only
--   public_queue_screen()  shows the period running now (else the next one,
--                          else the day's last) and returns which one
--   assign_queue_number()  also snaps a time to its period with the clinic's
--                          own hours when the branch has none, so a period
--                          never gets a second number 1
--
-- Clinics that book by time are unchanged. Same signatures; additive, and safe
-- to run again.
-- Rollback: supabase/rollbacks/060_queue_by_period_down.sql (back to 058).

CREATE OR REPLACE FUNCTION patients_ahead(a appointments)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN a.called_at IS NOT NULL THEN 0 ELSE (
    SELECT count(*)::int FROM appointments x
    WHERE x.business_id = a.business_id
      AND x.appointment_date = a.appointment_date
      AND x.status = 'confirmed'
      AND x.id <> a.id
      AND (a.branch_id IS NULL OR x.branch_id IS NULL OR x.branch_id = a.branch_id)
      AND (x.called_at IS NOT NULL OR (
        (queue_key(x), x.created_at) < (queue_key(a), a.created_at)
        -- By turn: another period's numbers aren't ahead of this one's.
        AND (a.queue_number IS NULL OR x.queue_number IS NULL OR x.appointment_time = a.appointment_time)
      ))
  ) END
$$;

CREATE OR REPLACE FUNCTION public_queue_screen(p_ref text, p_branch_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  b businesses%ROWTYPE;
  br branches%ROWTYPE;
  v_today date;
  v_now time;
  v_blocks jsonb;
  v_period time;
BEGIN
  SELECT * INTO b FROM businesses WHERE booking_slug = p_ref OR id::text = p_ref LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'NOT_FOUND'); END IF;
  IF b.is_active IS FALSE OR (b.trial_ends_at IS NOT NULL AND b.trial_ends_at < now()) THEN
    RETURN jsonb_build_object('error', 'LOCKED');
  END IF;
  SELECT * INTO br FROM branches
  WHERE business_id = b.id AND (p_branch_id IS NULL OR id = p_branch_id)
  ORDER BY is_main DESC, created_at LIMIT 1;
  v_today := (now() AT TIME ZONE business_time_zone(b.country))::date;
  v_now := (now() AT TIME ZONE business_time_zone(b.country))::time;

  -- By turn: the period running now, else the next today, else the last.
  IF b.booking_mode = 'queue' THEN
    v_blocks := coalesce(br.schedule_blocks -> (ARRAY['sun','mon','tue','wed','thu','fri','sat'])[extract(dow FROM v_today)::int + 1], '[]'::jsonb);
    SELECT coalesce(
      (SELECT (k->>'start')::time FROM jsonb_array_elements(v_blocks) k
        WHERE v_now >= (k->>'start')::time AND v_now < (k->>'end')::time LIMIT 1),
      (SELECT min((k->>'start')::time) FROM jsonb_array_elements(v_blocks) k WHERE (k->>'start')::time > v_now),
      (SELECT max((k->>'start')::time) FROM jsonb_array_elements(v_blocks) k)
    ) INTO v_period;
    -- No schedule on the branch (clinic hours only): follow who is inside, else the earliest waiting.
    IF v_period IS NULL THEN
      SELECT coalesce(
        (SELECT a.appointment_time FROM appointments a
          WHERE a.business_id = b.id AND a.appointment_date = v_today AND a.branch_id IS NOT DISTINCT FROM br.id
            AND a.status = 'confirmed' AND a.called_at IS NOT NULL ORDER BY a.called_at DESC LIMIT 1),
        (SELECT min(a.appointment_time) FROM appointments a
          WHERE a.business_id = b.id AND a.appointment_date = v_today AND a.branch_id IS NOT DISTINCT FROM br.id
            AND a.status = 'confirmed'))
      INTO v_period;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'name', b.name,
    'logo_url', b.logo_url,
    'brand_color', b.brand_color,
    'mode', b.booking_mode,
    'today', v_today,
    'period_start', to_char(v_period, 'HH24:MI'),
    'minutes', consult_minutes(b.id),
    'branch', CASE WHEN br.id IS NULL THEN NULL ELSE jsonb_build_object('id', br.id, 'name', br.name) END,
    'branches', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name) ORDER BY x.is_main DESC, x.created_at), '[]'::jsonb)
                 FROM branches x WHERE x.business_id = b.id),
    'inside', (
      SELECT jsonb_build_object('number', a.queue_number, 'time', to_char(a.appointment_time, 'HH24:MI'))
      FROM appointments a
      WHERE a.business_id = b.id AND a.appointment_date = v_today
        AND a.branch_id IS NOT DISTINCT FROM br.id
        AND a.status = 'confirmed' AND a.called_at IS NOT NULL
      ORDER BY a.called_at DESC LIMIT 1),
    'line', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('number', t.queue_number, 'time', to_char(t.appointment_time, 'HH24:MI')) ORDER BY t.k, t.created_at), '[]'::jsonb)
      FROM (
        SELECT a.queue_number, a.appointment_time, a.created_at, queue_key(a) k
        FROM appointments a
        WHERE a.business_id = b.id AND a.appointment_date = v_today
          AND a.branch_id IS NOT DISTINCT FROM br.id
          AND a.status = 'confirmed' AND a.called_at IS NULL
          AND (v_period IS NULL OR a.appointment_time = v_period)
        ORDER BY queue_key(a), a.created_at
        LIMIT 200
      ) t)
  );
END;
$$;

-- 057's numbering, now also for a clinic whose branch has no hours of its own
-- (the booking page then uses businesses.working_hours): a time inside one of
-- those periods snaps to the period's start too, so a booking added from the
-- calendar at 17:30 joins the 17:00 period's numbers instead of starting a
-- second number 1. Numbers already given stay as they are.
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

REVOKE ALL ON FUNCTION patients_ahead(appointments) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public_queue_screen(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_queue_screen(text, uuid) TO anon, authenticated;
