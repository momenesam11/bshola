-- Booking by turn numbers each period from 1 (057), but the patient's "ahead"
-- count and the waiting-room screen (058) looked at the whole day, so the
-- morning's leftovers counted against the evening and the screen showed two
-- number 1s. Now, for a clinic that books by turn:
--
--   patients_ahead()       counts whoever is inside plus the same period only
--   public_queue_screen()  shows the period running now (else the next one,
--                          else the day's last) and returns which one
--
-- Clinics that book by time are unchanged. Same signatures; additive.
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

REVOKE ALL ON FUNCTION patients_ahead(appointments) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public_queue_screen(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_queue_screen(text, uuid) TO anon, authenticated;
