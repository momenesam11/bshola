-- Undoes 058_front_desk.sql: drops the front-desk functions, trigger and
-- columns, and restores the 057 patient page, queue count and patients_ahead.
-- Arrival, call and finish times recorded since 058 are lost with the columns.
-- Run as one script in the SQL Editor.

DROP TRIGGER IF EXISTS front_desk_fields ON appointments;
DROP FUNCTION IF EXISTS front_desk_fields();
DROP FUNCTION IF EXISTS front_desk_call(uuid);
DROP FUNCTION IF EXISTS front_desk_push_back(uuid, integer);
DROP INDEX IF EXISTS appointments_one_inside_key;
DROP FUNCTION IF EXISTS public_queue_screen(text, uuid);

CREATE OR REPLACE FUNCTION patients_ahead(a appointments)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT count(*)::int FROM appointments x
  WHERE x.business_id = a.business_id
    AND x.appointment_date = a.appointment_date
    AND x.status = 'confirmed'
    AND x.id <> a.id
    AND (a.branch_id IS NULL OR x.branch_id IS NULL OR x.branch_id = a.branch_id)
    AND (x.appointment_time, coalesce(x.queue_number, 0), x.created_at)
      < (a.appointment_time, coalesce(a.queue_number, 0), a.created_at)
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
    (min(a.queue_number) FILTER (WHERE a.status = 'confirmed'))::int,
    bool_or(a.status IN ('completed', 'no_show'))
  FROM appointments a
  WHERE a.business_id = p_business_id
    AND a.branch_id IS NOT DISTINCT FROM p_branch_id
    AND a.appointment_date = p_date
    AND a.queue_number IS NOT NULL
  GROUP BY a.appointment_time
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
BEGIN
  SELECT * INTO a FROM appointments WHERE manage_code = p_code;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'NOT_FOUND'); END IF;
  SELECT * INTO b FROM businesses WHERE id = a.business_id;
  v_today := (now() AT TIME ZONE business_time_zone(b.country))::date;
  IF a.appointment_date < v_today - 7 THEN RETURN jsonb_build_object('error', 'EXPIRED'); END IF;

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
          'can_cancel', patient_can_cancel(x, b),
          'ahead', CASE WHEN x.status = 'confirmed' AND x.appointment_date = v_today THEN patients_ahead(x) END
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

DROP FUNCTION IF EXISTS consult_minutes(uuid);
DROP FUNCTION IF EXISTS queue_key(appointments);

ALTER TABLE branches DROP CONSTRAINT IF EXISTS branches_map_url_check;
ALTER TABLE branches DROP COLUMN IF EXISTS map_url;
ALTER TABLE appointments DROP COLUMN IF EXISTS queue_sort;
ALTER TABLE appointments DROP COLUMN IF EXISTS finished_at;
ALTER TABLE appointments DROP COLUMN IF EXISTS called_at;
ALTER TABLE appointments DROP COLUMN IF EXISTS arrived_at;
