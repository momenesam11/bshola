-- INTEGRITY FIX: the public booking insert policy (019) checked that the
-- branch/business pair was real, but never checked whether the business
-- itself is suspended or its trial/subscription has lapsed. That meant
-- customers could keep booking real appointments on a business's public
-- link indefinitely after the owner stopped paying or got deactivated by
-- admin — the owner's own dashboard already blocks on this exact condition
-- (see TrialGuard.jsx's isExpired check), but the public booking page
-- never did. This brings the insert policy in line with it, enforced at
-- the database level so it can't be bypassed by calling the API directly.

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
    AND branch_id IN (SELECT b.id FROM branches b WHERE b.business_id = appointments.business_id)
    AND appointment_date >= CURRENT_DATE
    AND status IN ('confirmed', 'waitlist')
  );
