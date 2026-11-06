-- Raises the cap on public bookings from one address from 20 to 60 per hour, per
-- business. Egyptian mobile networks put many real customers behind one address,
-- and a medical center running a campaign could reach 20 honestly. 60 still stops
-- a script filling a calendar. Safe to run at any time; nothing else changes.

CREATE OR REPLACE FUNCTION check_public_booking(p_business_id uuid, p_phone text, p_status text, p_service_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_headers json;
  v_ip text;
  v_hash text;
BEGIN
  IF p_service_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM services WHERE id = p_service_id AND business_id = p_business_id
  ) THEN
    RAISE EXCEPTION 'INVALID_BOOKING: service does not belong to this business';
  END IF;

  IF p_status = 'confirmed' AND (
    SELECT count(*) FROM appointments
    WHERE business_id = p_business_id
      AND client_phone = p_phone
      AND status IN ('confirmed', 'waitlist')
      AND appointment_date >= CURRENT_DATE
  ) >= 2 THEN
    RAISE EXCEPTION 'BOOKING_LIMIT: too many active bookings for this phone';
  END IF;

  BEGIN
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  EXCEPTION WHEN others THEN
    v_headers := NULL;
  END;
  v_ip := coalesce(
    v_headers ->> 'cf-connecting-ip',
    v_headers ->> 'x-real-ip',
    nullif(btrim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), '')
  );
  IF v_ip IS NULL THEN
    RETURN NULL;
  END IF;
  v_hash := md5(v_ip);

  IF (
    SELECT count(*) FROM appointments
    WHERE business_id = p_business_id
      AND booking_ip_hash = v_hash
      AND created_at > now() - interval '1 hour'
  ) >= 60 THEN
    RAISE EXCEPTION 'RATE_LIMITED: too many bookings from this address';
  END IF;

  RETURN v_hash;
END;
$$;
