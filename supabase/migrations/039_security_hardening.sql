-- Security hardening, part 1 of 2. Safe to run while the current site is live:
-- it only adds functions, a column, a table and tighter write rules.
-- Run this BEFORE the matching frontend deploys. Run 040 AFTER it deploys.

-- ── Narrow public reads ───────────────────────────────────────────────────
-- The booking page used to read businesses directly, and the policy behind that
-- let anyone read every column of every business (owner phones included). These
-- functions return only what a visitor needs. 040 removes the open policy.

CREATE OR REPLACE FUNCTION public_business_profile(p_ref text)
RETURNS TABLE (
  id uuid, name text, type text, working_hours jsonb, slot_duration int,
  logo_url text, cover_url text, brand_color text, bio text, specialty text,
  years_experience int, welcome_message text, cancellation_policy text,
  instagram_url text, facebook_url text, google_reviews_url text,
  booking_slug text, public_phone text, is_locked boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT b.id, b.name, b.type, b.working_hours, b.slot_duration,
         b.logo_url, b.cover_url, b.brand_color, b.bio, b.specialty,
         b.years_experience, b.welcome_message, b.cancellation_policy,
         b.instagram_url, b.facebook_url, b.google_reviews_url,
         b.booking_slug, b.public_phone,
         (b.is_active IS FALSE OR (b.trial_ends_at IS NOT NULL AND b.trial_ends_at < now()))
  FROM businesses b
  WHERE b.booking_slug = p_ref OR b.id::text = p_ref
  ORDER BY (b.booking_slug = p_ref) DESC NULLS LAST
  LIMIT 1;
$$;

-- How many confirmed bookings each time has. Times and counts only, never who
-- booked. Past days are refused so the history of a business can't be scraped.
CREATE OR REPLACE FUNCTION public_booked_slots(p_business_id uuid, p_date date, p_branch_id uuid DEFAULT NULL)
RETURNS TABLE (slot_time text, booked int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT to_char(a.appointment_time, 'HH24:MI'), count(*)::int
  FROM appointments a
  WHERE a.business_id = p_business_id
    AND a.appointment_date = p_date
    AND p_date >= CURRENT_DATE - 1
    AND a.status = 'confirmed'
    AND (p_branch_id IS NULL OR a.branch_id = p_branch_id)
  GROUP BY 1;
$$;

-- Used by onboarding and settings to check a booking link is free.
CREATE OR REPLACE FUNCTION booking_slug_taken(p_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM businesses WHERE booking_slug = p_slug);
$$;

-- The booking policy can't read businesses directly once 040 removes the open
-- policy, so it asks this function instead.
CREATE OR REPLACE FUNCTION business_accepts_bookings(p_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM businesses
    WHERE id = p_business_id
      AND is_active = true
      AND (trial_ends_at IS NULL OR trial_ends_at >= now())
  );
$$;

GRANT EXECUTE ON FUNCTION public_business_profile(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public_booked_slots(uuid, date, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION business_accepts_bookings(uuid) TO anon, authenticated;
REVOKE ALL ON FUNCTION booking_slug_taken(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION booking_slug_taken(text) TO authenticated;

DROP POLICY IF EXISTS "public_insert" ON appointments;
CREATE POLICY "public_insert" ON appointments
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    business_accepts_bookings(business_id)
    AND (SELECT b.business_id FROM branches b WHERE b.id = branch_id) = business_id
    AND appointment_date >= CURRENT_DATE
    AND status IN ('confirmed', 'waitlist')
  );

-- ── Public booking guard ──────────────────────────────────────────────────
-- Until now the limit of 2 active bookings per phone lived only in the page, and
-- a direct API call could also set a price or touch a client's visit plan.

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS booking_ip_hash text;
CREATE INDEX IF NOT EXISTS idx_appointments_booking_ip
  ON appointments (business_id, booking_ip_hash, created_at)
  WHERE booking_ip_hash IS NOT NULL;

-- Runs with full read access because visitors can't read appointments. Raises on
-- a refused booking, otherwise returns the hashed visitor IP to store.
-- 20 per hour per business is high on purpose: Egyptian mobile networks put many
-- real customers behind one IP address.
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
  ) >= 20 THEN
    RAISE EXCEPTION 'RATE_LIMITED: too many bookings from this address';
  END IF;

  RETURN v_hash;
END;
$$;

GRANT EXECUTE ON FUNCTION check_public_booking(uuid, text, text, uuid) TO anon, authenticated;

-- Deliberately not SECURITY DEFINER: current_user has to be the caller's role.
-- Business owners and the service role (Edge Functions) pass straight through.
CREATE OR REPLACE FUNCTION guard_public_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM businesses WHERE id = NEW.business_id AND owner_id = auth.uid()
  ) THEN
    RETURN NEW;
  END IF;

  NEW.client_name := btrim(NEW.client_name);
  IF length(NEW.client_name) NOT BETWEEN 2 AND 100 THEN
    RAISE EXCEPTION 'INVALID_BOOKING: name';
  END IF;
  IF NEW.client_phone !~ '^[0-9]{10,15}$' THEN
    RAISE EXCEPTION 'INVALID_BOOKING: phone';
  END IF;
  IF NEW.appointment_date > CURRENT_DATE + 365 THEN
    RAISE EXCEPTION 'INVALID_BOOKING: date';
  END IF;

  -- A visitor only ever sends name, phone, service, branch, date and time.
  NEW.notes := NULL;
  NEW.price := NULL;
  NEW.payment_status := 'unpaid';
  NEW.payment_type := NULL;
  NEW.amount_paid := 0;
  NEW.plan_visit_id := NULL;
  NEW.reminder_sent := false;

  NEW.booking_ip_hash := check_public_booking(NEW.business_id, NEW.client_phone, NEW.status, NEW.service_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_public_booking ON appointments;
CREATE TRIGGER guard_public_booking
  BEFORE INSERT ON appointments
  FOR EACH ROW EXECUTE FUNCTION guard_public_booking();

-- ── Subscription fields ───────────────────────────────────────────────────
-- owner_all lets an owner update their whole row, so anyone could have activated
-- their own subscription from the browser console. Only the admin Edge Function
-- and the growth functions may change these now; both run as a different role.
-- Values are restored silently so the existing settings forms keep working.

CREATE OR REPLACE FUNCTION guard_business_billing_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.subscription_type := 'trial';
    NEW.is_active := true;
    NEW.trial_started_at := now();
    NEW.trial_ends_at := now() + interval '14 days';
    NEW.activated_at := NULL;
    NEW.activated_by := NULL;
  ELSE
    NEW.owner_id := OLD.owner_id;
    NEW.subscription_type := OLD.subscription_type;
    NEW.is_active := OLD.is_active;
    NEW.trial_started_at := OLD.trial_started_at;
    NEW.trial_ends_at := OLD.trial_ends_at;
    NEW.activated_at := OLD.activated_at;
    NEW.activated_by := OLD.activated_by;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_business_billing_fields ON businesses;
CREATE TRIGGER guard_business_billing_fields
  BEFORE INSERT OR UPDATE ON businesses
  FOR EACH ROW EXECUTE FUNCTION guard_business_billing_fields();

-- ── Logos and covers ──────────────────────────────────────────────────────
-- Any logged-in user could overwrite or delete any other business's images.
-- Paths are `${businessId}/${type}.${ext}`, so the first folder names the owner.

DROP POLICY IF EXISTS "auth upload business assets" ON storage.objects;
DROP POLICY IF EXISTS "auth update business assets" ON storage.objects;
DROP POLICY IF EXISTS "auth delete business assets" ON storage.objects;

CREATE POLICY "auth upload business assets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'business-assets'
    AND (storage.foldername(name))[1] IN (SELECT id::text FROM businesses WHERE owner_id = auth.uid())
  );

CREATE POLICY "auth update business assets" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'business-assets'
    AND (storage.foldername(name))[1] IN (SELECT id::text FROM businesses WHERE owner_id = auth.uid())
  );

CREATE POLICY "auth delete business assets" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'business-assets'
    AND (storage.foldername(name))[1] IN (SELECT id::text FROM businesses WHERE owner_id = auth.uid())
  );

-- ── Admin login attempts ──────────────────────────────────────────────────
-- Read and written only by the admin Edge Function, through the service role.

CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ip_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_login_attempts ON admin_login_attempts (ip_hash, created_at);
ALTER TABLE admin_login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_login_attempts FROM anon, authenticated;
