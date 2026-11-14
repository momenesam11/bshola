-- A shorter, expiring patient link, a phone check before cancelling, and the
-- patient's place in today's queue. Replaces the /my/<uuid> page from 054,
-- which was never sent to patients.
--
--   appointments.manage_code   12 characters the database makes (/m/<code>); the
--                              link works until 7 days after that appointment
--   patient_link_attempts      wrong phone checks, to stop guessing the 3 digits
--
-- Additive: one column, filled for existing rows by its default while it is
-- added (no trigger runs and no other value changes), one table and new
-- functions. The 054 functions are kept but closed to visitors.
--
-- Rollback: supabase/rollbacks/056_patient_short_link_down.sql.

-- Letters and digits that can't be mistaken for each other (no 0/O, 1/l/I).
-- The randomness comes from gen_random_uuid(); the version bytes are skipped.
CREATE OR REPLACE FUNCTION new_manage_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
  alphabet constant text := 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  positions constant int[] := ARRAY[0, 1, 2, 3, 4, 5, 7, 9, 10, 11, 12, 13];
  code text := '';
  i int;
BEGIN
  FOREACH i IN ARRAY positions LOOP
    code := code || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  END LOOP;
  RETURN code;
END;
$$;

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS manage_code text DEFAULT new_manage_code();
ALTER TABLE appointments ALTER COLUMN manage_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS appointments_manage_code_key ON appointments (manage_code);

-- As in 054, the database alone makes the link and it never changes.
CREATE OR REPLACE FUNCTION appointments_own_manage_token()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.manage_token := gen_random_uuid();
    NEW.manage_code := new_manage_code();
    NEW.cancelled_by_patient_at := NULL;
    IF current_user = 'anon' THEN
      NEW.review_requested_at := NULL;
      NEW.queue_notified_at := NULL;
    END IF;
  ELSE
    NEW.manage_token := OLD.manage_token;
    NEW.manage_code := OLD.manage_code;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS patient_link_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  manage_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS patient_link_attempts_code_idx ON patient_link_attempts (manage_code, created_at);
ALTER TABLE patient_link_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON patient_link_attempts FROM anon, authenticated;

-- How many wait before this appointment today: confirmed visits of the same
-- clinic and branch, earlier in booking-time order (the dashboard queue, 053).
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
    AND (x.appointment_time, x.created_at) < (a.appointment_time, a.created_at)
$$;

-- Everything /m/<code> shows, or {"error": "NOT_FOUND" | "EXPIRED"}.
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
          'status', x.status, 'service', s.name, 'branch', br.name, 'address', br.address,
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
          'status', x.status, 'service', s.name, 'branch', br.name
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

-- Cancels one of the link holder's appointments once they type the last 3
-- digits of their number. Five wrong tries in an hour lock the link for the
-- hour. Errors come back as {"error": ...} rather than exceptions, so a wrong
-- try is recorded instead of rolled back.
CREATE OR REPLACE FUNCTION patient_cancel(p_code text, p_appointment_id uuid, p_phone_tail text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  a appointments%ROWTYPE;
  x appointments%ROWTYPE;
  b businesses%ROWTYPE;
  v_page jsonb;
  v_waiting integer;
BEGIN
  v_page := patient_page(p_code);
  IF v_page ? 'error' THEN RETURN v_page; END IF;
  IF (SELECT count(*) FROM patient_link_attempts
      WHERE manage_code = p_code AND created_at > now() - interval '1 hour') >= 5 THEN
    RETURN jsonb_build_object('error', 'TOO_MANY_TRIES');
  END IF;

  SELECT * INTO a FROM appointments WHERE manage_code = p_code;
  IF coalesce(p_phone_tail, '') !~ '^[0-9]{3}$' OR right(a.client_phone, 3) <> p_phone_tail THEN
    INSERT INTO patient_link_attempts (manage_code) VALUES (p_code);
    RETURN jsonb_build_object('error', 'WRONG_PHONE');
  END IF;

  SELECT * INTO x FROM appointments
    WHERE id = p_appointment_id AND business_id = a.business_id AND client_phone = a.client_phone
    FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'NOT_FOUND'); END IF;
  SELECT * INTO b FROM businesses WHERE id = a.business_id;
  IF NOT patient_can_cancel(x, b) THEN RETURN jsonb_build_object('error', 'CANNOT_CANCEL'); END IF;

  UPDATE appointments SET status = 'cancelled', cancelled_by_patient_at = now() WHERE id = x.id;

  IF x.status = 'confirmed' THEN
    SELECT count(*) INTO v_waiting FROM appointments
      WHERE business_id = x.business_id AND appointment_date = x.appointment_date
        AND status = 'waitlist' AND (x.branch_id IS NULL OR branch_id = x.branch_id);
    UPDATE notifications
      SET body = x.client_name || ' لغى ميعاده بنفسه من لينك المواعيد'
        || CASE WHEN v_waiting > 0 THEN '، وفي ' || v_waiting || ' في قايمة الانتظار لنفس اليوم' ELSE '' END
      WHERE related_appointment_id = x.id AND type = 'cancellation' AND created_at = now();
  END IF;

  DELETE FROM patient_link_attempts WHERE created_at < now() - interval '1 day';
  RETURN patient_page(p_code);
END;
$$;

-- The insert trigger and the column default run as the caller, so visitors
-- need it too. It only returns random characters.
REVOKE ALL ON FUNCTION new_manage_code() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION new_manage_code() TO anon, authenticated;
REVOKE ALL ON FUNCTION patients_ahead(appointments) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION patient_page(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION patient_cancel(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION patient_page(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION patient_cancel(text, uuid, text) TO anon, authenticated;

-- The uuid page from 054 is replaced: visitors can no longer call it.
REVOKE EXECUTE ON FUNCTION patient_portal(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION patient_cancel_appointment(uuid, uuid) FROM anon, authenticated;
