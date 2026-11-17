-- Undoes 062_queue_number_per_period.sql: numbering goes back to per start time
-- (061), and the counts, ahead and screen to their 058/060 versions. Numbers
-- already given stay.

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

CREATE OR REPLACE FUNCTION public_queue_periods(p_business_id uuid, p_branch_id uuid, p_date date)
RETURNS TABLE (period_start time, taken integer, next_number integer, current_number integer, started boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    a.appointment_time,
    (count(*) FILTER (WHERE a.status IN ('confirmed', 'completed', 'no_show')))::int,
    (coalesce(max(a.queue_number), 0) + 1)::int,
    coalesce(
      (array_agg(a.queue_number ORDER BY a.called_at DESC) FILTER (WHERE a.status = 'confirmed' AND a.called_at IS NOT NULL))[1],
      (array_agg(a.queue_number ORDER BY queue_key(a), a.created_at) FILTER (WHERE a.status = 'confirmed'))[1]
    )::int,
    bool_or(a.status IN ('completed', 'no_show') OR a.called_at IS NOT NULL)
  FROM appointments a
  WHERE a.business_id = p_business_id
    AND a.branch_id IS NOT DISTINCT FROM p_branch_id
    AND a.appointment_date = p_date
    AND a.queue_number IS NOT NULL
  GROUP BY a.appointment_time
$$;

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

DROP FUNCTION IF EXISTS queue_period_key(appointments);
DROP FUNCTION IF EXISTS queue_period_of(uuid, uuid, date, time);
