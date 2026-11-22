-- Undoes 065_queue_period_control.sql: the screen, «قدامك كام», «رجّعه» and the
-- patient page go back to their 058/062 versions, the late-arrival trigger and
-- the desk's period buttons and note go away. Patients already marked ما جاش by
-- «خلّص الفترة», and places already moved, stay as they are.

DROP TRIGGER IF EXISTS queue_late_arrival ON appointments;
DROP FUNCTION IF EXISTS queue_late_arrival();
DROP FUNCTION IF EXISTS front_desk_day(uuid, uuid);
DROP FUNCTION IF EXISTS front_desk_period(uuid, uuid, time, text);
DROP FUNCTION IF EXISTS front_desk_note(uuid, uuid, text);

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
        CASE WHEN a.queue_number IS NOT NULL AND x.queue_number IS NOT NULL THEN
          -- By turn: the same period, lower number first.
          queue_period_of(x.business_id, x.branch_id, x.appointment_date, x.appointment_time)
            = queue_period_of(a.business_id, a.branch_id, a.appointment_date, a.appointment_time)
          AND (queue_period_key(x), x.created_at) < (queue_period_key(a), a.created_at)
        ELSE (queue_key(x), x.created_at) < (queue_key(a), a.created_at) END
      ))
  ) END
$$;

CREATE OR REPLACE FUNCTION front_desk_push_back(p_appointment_id uuid, p_steps integer DEFAULT 3)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  a appointments%ROWTYPE;
  v_after numeric[];
  v_target numeric;
  v_next numeric;
  v_steps integer := least(greatest(coalesce(p_steps, 3), 1), 50);
BEGIN
  SELECT * INTO a FROM appointments WHERE id = p_appointment_id AND status = 'confirmed';
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_WAITING: this patient is not waiting'; END IF;
  -- One desk action at a time per branch and day: two screens pressing at
  -- once queue up here, and the second sees what the first did.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'desk|' || a.business_id::text || '|' || coalesce(a.branch_id::text, '') || '|' || a.appointment_date::text, 0));
  SELECT * INTO a FROM appointments WHERE id = p_appointment_id AND status = 'confirmed';
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_WAITING: this patient is not waiting'; END IF;

  SELECT array_agg(k ORDER BY k, c) INTO v_after FROM (
    SELECT queue_key(x) k, x.created_at c FROM appointments x
    WHERE x.business_id = a.business_id AND x.appointment_date = a.appointment_date
      AND x.branch_id IS NOT DISTINCT FROM a.branch_id
      AND x.status = 'confirmed' AND x.called_at IS NULL AND x.id <> a.id
      AND (queue_key(x), x.created_at) > (queue_key(a), a.created_at)
  ) t;

  IF v_after IS NULL THEN
    UPDATE appointments SET called_at = NULL, queue_notified_at = NULL WHERE id = a.id;
    RETURN;
  END IF;

  v_target := v_after[least(v_steps, array_length(v_after, 1))];
  v_next := v_after[least(v_steps, array_length(v_after, 1)) + 1];
  UPDATE appointments
  -- Sent back, they get told again when their turn comes near.
  SET called_at = NULL, queue_notified_at = NULL,
      queue_sort = CASE WHEN v_next IS NOT NULL AND v_next > v_target THEN (v_target + v_next) / 2
                        ELSE v_target + 0.0001 END
  WHERE id = a.id;
END;
$$;

CREATE OR REPLACE FUNCTION patient_page(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  a appointments%ROWTYPE;
  b businesses%ROWTYPE;
  v_today date;
  v_minutes integer;
BEGIN
  SELECT * INTO a FROM appointments WHERE manage_code = p_code;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'NOT_FOUND'); END IF;
  SELECT * INTO b FROM businesses WHERE id = a.business_id;
  v_today := (now() AT TIME ZONE business_time_zone(b.country))::date;
  IF a.appointment_date < v_today - 7 THEN RETURN jsonb_build_object('error', 'EXPIRED'); END IF;
  v_minutes := consult_minutes(b.id);

  RETURN jsonb_build_object(
    'client_name', a.client_name,
    'today', v_today,
    'business', jsonb_build_object(
      'name', b.name,
      'slug', coalesce(b.booking_slug, b.id::text),
      'logo_url', b.logo_url,
      'brand_color', b.brand_color,
      'public_phone', b.public_phone,
      'cancellation_policy', b.cancellation_policy
    ),
    'upcoming', (
      SELECT coalesce(jsonb_agg(row ORDER BY row->>'date', row->>'time'), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'id', x.id, 'date', x.appointment_date, 'time', to_char(x.appointment_time, 'HH24:MI'),
          'status', x.status, 'number', x.queue_number, 'service', s.name, 'branch', br.name, 'address', br.address,
          'map_url', br.map_url,
          'can_cancel', patient_can_cancel(x, b),
          'ahead', CASE WHEN x.status = 'confirmed' AND x.appointment_date = v_today THEN patients_ahead(x) END,
          'inside', x.status = 'confirmed' AND x.appointment_date = v_today AND x.called_at IS NOT NULL,
          'eta_minutes', CASE WHEN x.status = 'confirmed' AND x.appointment_date = v_today THEN patients_ahead(x) * v_minutes END,
          'now_serving', CASE WHEN x.status = 'confirmed' AND x.appointment_date = v_today THEN (
            SELECT y.queue_number FROM appointments y
            WHERE y.business_id = x.business_id AND y.appointment_date = x.appointment_date
              AND y.branch_id IS NOT DISTINCT FROM x.branch_id AND y.appointment_time = x.appointment_time
              AND y.status = 'confirmed' AND y.called_at IS NOT NULL
            ORDER BY y.called_at DESC LIMIT 1) END
        ) AS row
        FROM appointments x
        LEFT JOIN services s ON s.id = x.service_id
        LEFT JOIN branches br ON br.id = x.branch_id
        WHERE x.business_id = a.business_id AND x.client_phone = a.client_phone
          AND x.status IN ('confirmed', 'waitlist') AND x.appointment_date >= v_today
      ) t
    ),
    'past', (
      SELECT coalesce(jsonb_agg(row ORDER BY row->>'date' DESC, row->>'time' DESC), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'id', x.id, 'date', x.appointment_date, 'time', to_char(x.appointment_time, 'HH24:MI'),
          'status', x.status, 'number', x.queue_number, 'service', s.name, 'branch', br.name
        ) AS row
        FROM appointments x
        LEFT JOIN services s ON s.id = x.service_id
        LEFT JOIN branches br ON br.id = x.branch_id
        WHERE x.business_id = a.business_id AND x.client_phone = a.client_phone
          AND NOT (x.status IN ('confirmed', 'waitlist') AND x.appointment_date >= v_today)
          AND x.appointment_date >= v_today - 365
        ORDER BY x.appointment_date DESC, x.appointment_time DESC
        LIMIT 10
      ) t
    )
  );
END;
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

  IF b.booking_mode = 'queue' THEN
    -- The period running now (branch hours, else the clinic's), else the next today, else the last.
    v_period := queue_period_start(b.id, br.id, v_today, v_now);
    IF v_period IS NULL THEN
      v_blocks := coalesce(br.schedule_blocks -> (ARRAY['sun','mon','tue','wed','thu','fri','sat'])[extract(dow FROM v_today)::int + 1], '[]'::jsonb);
      SELECT coalesce(
        (SELECT min((k->>'start')::time) FROM jsonb_array_elements(v_blocks) k WHERE (k->>'start')::time > v_now),
        (SELECT max((k->>'start')::time) FROM jsonb_array_elements(v_blocks) k)
      ) INTO v_period;
    END IF;
    IF v_period IS NULL THEN
      SELECT coalesce(
        (SELECT queue_period_of(a.business_id, a.branch_id, a.appointment_date, a.appointment_time) FROM appointments a
          WHERE a.business_id = b.id AND a.appointment_date = v_today AND a.branch_id IS NOT DISTINCT FROM br.id
            AND a.status = 'confirmed' AND a.called_at IS NOT NULL ORDER BY a.called_at DESC LIMIT 1),
        (SELECT min(queue_period_of(a.business_id, a.branch_id, a.appointment_date, a.appointment_time)) FROM appointments a
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
        SELECT a.queue_number, a.appointment_time, a.created_at,
               -- By turn the line goes by number within the period.
               CASE WHEN b.booking_mode = 'queue' AND a.queue_number IS NOT NULL
                    THEN queue_period_key(a) ELSE queue_key(a) END AS k
        FROM appointments a
        WHERE a.business_id = b.id AND a.appointment_date = v_today
          AND a.branch_id IS NOT DISTINCT FROM br.id
          AND a.status = 'confirmed' AND a.called_at IS NULL
          AND (v_period IS NULL OR queue_period_of(a.business_id, a.branch_id, a.appointment_date, a.appointment_time) = v_period)
        ORDER BY 4, a.created_at
        LIMIT 200
      ) t)
  );
END;
$$;

DROP FUNCTION IF EXISTS patients_ahead_coming(appointments);
DROP FUNCTION IF EXISTS queue_ahead(appointments);
DROP FUNCTION IF EXISTS queue_place_after(appointments, integer);
DROP FUNCTION IF EXISTS queue_period_over(uuid, uuid, date, time);
DROP FUNCTION IF EXISTS queue_day_period_list(uuid, uuid, date);
DROP TABLE IF EXISTS queue_days;

REVOKE ALL ON FUNCTION patients_ahead(appointments) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION front_desk_push_back(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION front_desk_push_back(uuid, integer) TO authenticated;
REVOKE ALL ON FUNCTION patient_page(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION patient_page(text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public_queue_screen(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_queue_screen(text, uuid) TO anon, authenticated;
