-- The patient's own page: /my/<token> lists their appointments at one clinic
-- and lets them cancel within the clinic's cancellation policy.
--
-- Every appointment gets a manage_token. The link reaches the patient only in
-- the WhatsApp messages the clinic sends to that number, and the database
-- always makes the token itself: a visitor who could choose it could book with
-- someone else's number and then read that person's appointments. The page
-- shows that number's appointments at that clinic only, with no notes,
-- prices, diagnoses or files.
--
-- Rollback: supabase/rollbacks/054_patient_self_service_down.sql.

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS manage_token uuid DEFAULT gen_random_uuid();
UPDATE appointments SET manage_token = gen_random_uuid() WHERE manage_token IS NULL;
ALTER TABLE appointments ALTER COLUMN manage_token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS appointments_manage_token_key ON appointments (manage_token);

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancelled_by_patient_at timestamptz;

-- The token is the database's alone: made fresh on every insert and never
-- changed after. A visitor's booking also can't arrive already marked as
-- reviewed, told its place, or cancelled by the patient.
CREATE OR REPLACE FUNCTION appointments_own_manage_token()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.manage_token := gen_random_uuid();
    NEW.cancelled_by_patient_at := NULL;
    IF current_user = 'anon' THEN
      NEW.review_requested_at := NULL;
      NEW.queue_notified_at := NULL;
    END IF;
  ELSE
    NEW.manage_token := OLD.manage_token;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_own_manage_token ON appointments;
CREATE TRIGGER appointments_own_manage_token
  BEFORE INSERT OR UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION appointments_own_manage_token();

-- Appointment times are the clinic's local time.
CREATE OR REPLACE FUNCTION business_time_zone(p_country text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_country
    WHEN 'SA' THEN 'Asia/Riyadh' WHEN 'AE' THEN 'Asia/Dubai' WHEN 'QA' THEN 'Asia/Qatar'
    WHEN 'KW' THEN 'Asia/Kuwait' WHEN 'BH' THEN 'Asia/Bahrain' WHEN 'OM' THEN 'Asia/Muscat'
    WHEN 'JO' THEN 'Asia/Amman' WHEN 'MA' THEN 'Africa/Casablanca' WHEN 'TN' THEN 'Africa/Tunis'
    WHEN 'DZ' THEN 'Africa/Algiers' WHEN 'LY' THEN 'Africa/Tripoli' WHEN 'IQ' THEN 'Asia/Baghdad'
    WHEN 'LB' THEN 'Asia/Beirut' WHEN 'SY' THEN 'Asia/Damascus' WHEN 'PS' THEN 'Asia/Hebron'
    WHEN 'SD' THEN 'Africa/Khartoum' WHEN 'YE' THEN 'Asia/Aden'
    ELSE 'Africa/Cairo'
  END
$$;

-- Hours of notice the clinic's cancellation policy asks for (the options in
-- src/lib/businessProfile.js). -1 means patients can't cancel online.
CREATE OR REPLACE FUNCTION cancellation_notice_hours(p_policy text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_policy LIKE '%لا يوجد إلغاء%' THEN -1
    WHEN p_policy LIKE '%48%' THEN 48
    WHEN p_policy LIKE '%24%' THEN 24
    ELSE 0
  END
$$;

-- Whether the patient may cancel this appointment now. A waitlist entry has no
-- time of its own, so it can be withdrawn until its day is over.
CREATE OR REPLACE FUNCTION patient_can_cancel(a appointments, b businesses)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN a.status = 'waitlist' THEN a.appointment_date >= (now() AT TIME ZONE business_time_zone(b.country))::date
    WHEN a.status <> 'confirmed' THEN false
    WHEN cancellation_notice_hours(b.cancellation_policy) < 0 THEN false
    ELSE ((a.appointment_date + a.appointment_time) AT TIME ZONE business_time_zone(b.country))
         > now() + make_interval(hours => cancellation_notice_hours(b.cancellation_policy))
  END
$$;

-- Everything /my/<token> shows. NULL when the token matches nothing.
CREATE OR REPLACE FUNCTION patient_portal(p_token uuid)
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
  SELECT * INTO a FROM appointments WHERE manage_token = p_token;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO b FROM businesses WHERE id = a.business_id;
  v_today := (now() AT TIME ZONE business_time_zone(b.country))::date;

  RETURN jsonb_build_object(
    'client_name', a.client_name,
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
          'can_cancel', patient_can_cancel(x, b)
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

-- Cancels one of the token holder's own appointments, if the policy allows,
-- and returns the refreshed page. The usual cancellation notification fires;
-- its text then says the patient did it and how many wait for that day.
CREATE OR REPLACE FUNCTION patient_cancel_appointment(p_token uuid, p_appointment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  a appointments%ROWTYPE;
  x appointments%ROWTYPE;
  b businesses%ROWTYPE;
  v_waiting integer;
BEGIN
  SELECT * INTO a FROM appointments WHERE manage_token = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO x FROM appointments
    WHERE id = p_appointment_id AND business_id = a.business_id AND client_phone = a.client_phone
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO b FROM businesses WHERE id = a.business_id;
  IF NOT patient_can_cancel(x, b) THEN RAISE EXCEPTION 'CANNOT_CANCEL'; END IF;

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

  RETURN patient_portal(p_token);
END;
$$;

REVOKE ALL ON FUNCTION patient_portal(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION patient_cancel_appointment(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION patient_can_cancel(appointments, businesses) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION patient_portal(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION patient_cancel_appointment(uuid, uuid) TO anon, authenticated;
