-- Undoes 060_queue_by_period.sql: patients_ahead and public_queue_screen go
-- back to their 058 versions (whole-day line), and assign_queue_number to its
-- 057 version (branch hours only). No data changes.

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
      AND (x.called_at IS NOT NULL OR (queue_key(x), x.created_at) < (queue_key(a), a.created_at))
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

  RETURN jsonb_build_object(
    'name', b.name,
    'logo_url', b.logo_url,
    'brand_color', b.brand_color,
    'mode', b.booking_mode,
    'today', v_today,
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
        ORDER BY queue_key(a), a.created_at
        LIMIT 200
      ) t)
  );
END;
$$;

REVOKE ALL ON FUNCTION patients_ahead(appointments) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public_queue_screen(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_queue_screen(text, uuid) TO anon, authenticated;

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
  IF NEW.status <> 'confirmed' THEN
    RETURN NEW;
  END IF;
  SELECT * INTO b FROM businesses WHERE id = NEW.business_id;
  IF b.booking_mode IS DISTINCT FROM 'queue' THEN
    NEW.queue_number := NULL;
    RETURN NEW;
  END IF;

  -- A time inside a working period counts as that period: the dashboard's
  -- time picker can say 17:30 for the evening session that starts at 16:00.
  SELECT (blk->>'start')::time INTO v_start
  FROM branches br,
       jsonb_array_elements(coalesce(br.schedule_blocks -> (ARRAY['sun','mon','tue','wed','thu','fri','sat'])[extract(dow FROM NEW.appointment_date)::int + 1], '[]'::jsonb)) blk
  WHERE br.id = NEW.branch_id
    AND NEW.appointment_time >= (blk->>'start')::time
    AND NEW.appointment_time < (blk->>'end')::time
  LIMIT 1;
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

  -- current_user is this function's owner here (SECURITY DEFINER), so the
  -- caller is told by the request: the owner and the service role may go past
  -- the limit, everyone else may not.
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
