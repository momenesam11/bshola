-- Rollback for supabase/migrations/039_security_hardening.sql.
-- Run 040's rollback first if 040 was applied. The frontend from this PR needs the
-- public_* functions, so revert the frontend before running this.
DROP TABLE IF EXISTS admin_login_attempts;

DROP POLICY IF EXISTS "auth upload business assets" ON storage.objects;
DROP POLICY IF EXISTS "auth update business assets" ON storage.objects;
DROP POLICY IF EXISTS "auth delete business assets" ON storage.objects;
CREATE POLICY "auth upload business assets" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'business-assets');
CREATE POLICY "auth update business assets" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'business-assets');
CREATE POLICY "auth delete business assets" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'business-assets');

DROP TRIGGER IF EXISTS guard_business_billing_fields ON businesses;
DROP FUNCTION IF EXISTS guard_business_billing_fields();

DROP TRIGGER IF EXISTS guard_public_booking ON appointments;
DROP FUNCTION IF EXISTS guard_public_booking();
DROP FUNCTION IF EXISTS check_public_booking(uuid, text, text, uuid);
DROP INDEX IF EXISTS idx_appointments_booking_ip;
ALTER TABLE appointments DROP COLUMN IF EXISTS booking_ip_hash;

DROP POLICY IF EXISTS "public_insert" ON appointments;
CREATE POLICY "public_insert" ON appointments
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    business_id IN (
      SELECT id FROM businesses
      WHERE is_active = true
        AND (trial_ends_at IS NULL OR trial_ends_at >= now())
    )
    AND (SELECT b.business_id FROM branches b WHERE b.id = branch_id) = business_id
    AND appointment_date >= CURRENT_DATE
    AND status IN ('confirmed', 'waitlist')
  );

DROP FUNCTION IF EXISTS business_accepts_bookings(uuid);
DROP FUNCTION IF EXISTS booking_slug_taken(text);
DROP FUNCTION IF EXISTS public_booked_slots(uuid, date, uuid);
DROP FUNCTION IF EXISTS public_business_profile(text);
