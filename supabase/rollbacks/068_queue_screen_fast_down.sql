-- Rollback for 068: back to the 066 public_queue_screen.

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
  d queue_days%ROWTYPE;
  v_today date;
  v_now time;
  v_period time;
  v_ended time[];
BEGIN
  SELECT * INTO b FROM businesses WHERE booking_slug = p_ref OR id::text = p_ref LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'NOT_FOUND'); END IF;
  IF b.is_active IS FALSE OR (b.trial_ends_at IS NOT NULL AND b.trial_ends_at < now()) THEN
    RETURN jsonb_build_object('error', 'LOCKED');
  END IF;
  SELECT * INTO br FROM branches
  WHERE business_id = b.id AND (p_branch_id IS NULL OR id = p_branch_id)
  ORDER BY is_main DESC, created_at LIMIT 1;
  v_today := clinic_day(b.id, br.id);
  v_now := clinic_day_time(b.id, br.id);
  SELECT * INTO d FROM queue_days WHERE business_id = b.id AND branch_id IS NOT DISTINCT FROM br.id AND day = v_today;
  v_ended := coalesce(d.ended_periods, '{}'::time[]);

  IF b.booking_mode = 'queue' THEN
    -- 1. The period the desk started.
    v_period := d.current_period;
    -- 2. The earliest with someone inside, or arrived and still waiting.
    IF v_period IS NULL THEN
      SELECT min(queue_period_of(a.business_id, a.branch_id, a.appointment_date, a.appointment_time)) INTO v_period
      FROM appointments a
      WHERE a.business_id = b.id AND a.appointment_date = v_today AND a.branch_id IS NOT DISTINCT FROM br.id
        AND a.status = 'confirmed' AND a.queue_number IS NOT NULL
        AND (a.called_at IS NOT NULL OR a.arrived_at IS NOT NULL);
    END IF;
    -- 3. By the clock: running now, else the next today, else the last; never one the desk ended.
    IF v_period IS NULL THEN
      SELECT coalesce(
        (SELECT p.start_time FROM queue_day_periods(b.id, br.id, v_today) p
          WHERE v_now >= p.start_time AND v_now < p.end_time AND NOT p.start_time = ANY(v_ended) ORDER BY 1 LIMIT 1),
        (SELECT min(p.start_time) FROM queue_day_periods(b.id, br.id, v_today) p
          WHERE p.start_time > v_now AND NOT p.start_time = ANY(v_ended)),
        (SELECT max(p.start_time) FROM queue_day_periods(b.id, br.id, v_today) p
          WHERE NOT p.start_time = ANY(v_ended)))
      INTO v_period;
    END IF;
    -- 4. A day with no period: where the bookings are.
    IF v_period IS NULL THEN
      SELECT min(queue_period_of(a.business_id, a.branch_id, a.appointment_date, a.appointment_time)) INTO v_period
      FROM appointments a
      WHERE a.business_id = b.id AND a.appointment_date = v_today AND a.branch_id IS NOT DISTINCT FROM br.id
        AND a.status = 'confirmed';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'name', b.name,
    'logo_url', b.logo_url,
    'brand_color', b.brand_color,
    'mode', b.booking_mode,
    'today', v_today,
    'period_start', to_char(v_period, 'HH24:MI'),
    'note', d.note,
    'minutes', consult_minutes(b.id),
    'branch', CASE WHEN br.id IS NULL THEN NULL ELSE jsonb_build_object('id', br.id, 'name', br.name) END,
    'branches', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name) ORDER BY x.is_main DESC, x.created_at), '[]'::jsonb)
                 FROM branches x WHERE x.business_id = b.id),
    'periods', CASE WHEN b.booking_mode = 'queue' THEN (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'start', to_char(p.start_time, 'HH24:MI'), 'end', to_char(p.end_time, 'HH24:MI'), 'name', p.name,
               'started', p.start_time = d.current_period, 'ended', p.start_time = ANY(v_ended)) ORDER BY p.start_time), '[]'::jsonb)
      FROM queue_day_period_list(b.id, br.id, v_today) p) ELSE '[]'::jsonb END,
    'inside', (
      SELECT jsonb_build_object('number', a.queue_number, 'time', to_char(a.appointment_time, 'HH24:MI'),
        'period', to_char(CASE WHEN a.queue_number IS NOT NULL THEN queue_period_of(a.business_id, a.branch_id, a.appointment_date, a.appointment_time) END, 'HH24:MI'))
      FROM appointments a
      WHERE a.business_id = b.id AND a.appointment_date = v_today
        AND a.branch_id IS NOT DISTINCT FROM br.id
        AND a.status = 'confirmed' AND a.called_at IS NOT NULL
      ORDER BY a.called_at DESC LIMIT 1),
    -- The line on screen: earlier periods' patients still here, then this period's.
    'line', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('number', t.queue_number, 'time', to_char(t.appointment_time, 'HH24:MI'),
               'period', to_char(t.p, 'HH24:MI'), 'arrived', t.arrived) ORDER BY t.p, t.k, t.created_at), '[]'::jsonb)
      FROM (
        SELECT a.queue_number, a.appointment_time, a.created_at, a.arrived_at IS NOT NULL AS arrived,
               CASE WHEN b.booking_mode = 'queue' AND a.queue_number IS NOT NULL
                    THEN queue_period_of(a.business_id, a.branch_id, a.appointment_date, a.appointment_time) END AS p,
               CASE WHEN b.booking_mode = 'queue' AND a.queue_number IS NOT NULL
                    THEN queue_period_key(a) ELSE queue_key(a) END AS k
        FROM appointments a
        WHERE a.business_id = b.id AND a.appointment_date = v_today
          AND a.branch_id IS NOT DISTINCT FROM br.id
          AND a.status = 'confirmed' AND a.called_at IS NULL
        LIMIT 500
      ) t
      WHERE v_period IS NULL OR t.p = v_period OR (t.p < v_period AND t.arrived)),
    -- Every number waiting today, for "what's my number?": its place and how
    -- many ahead haven't arrived. Numbers only.
    'waiting', CASE WHEN b.booking_mode = 'queue' THEN (
      SELECT coalesce(jsonb_agg(jsonb_build_object('number', a.queue_number,
               'period', to_char(queue_period_of(a.business_id, a.branch_id, a.appointment_date, a.appointment_time), 'HH24:MI'),
               'arrived', a.arrived_at IS NOT NULL, 'ahead', patients_ahead(a), 'coming', patients_ahead_coming(a))), '[]'::jsonb)
      FROM (
        SELECT * FROM appointments a
        WHERE a.business_id = b.id AND a.appointment_date = v_today
          AND a.branch_id IS NOT DISTINCT FROM br.id
          AND a.status = 'confirmed' AND a.called_at IS NULL AND a.queue_number IS NOT NULL
        LIMIT 500
      ) a) ELSE '[]'::jsonb END
  );
END;
$$;

REVOKE ALL ON FUNCTION public_queue_screen(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_queue_screen(text, uuid) TO anon, authenticated;
