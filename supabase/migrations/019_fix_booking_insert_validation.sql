-- SECURITY FIX (C2): the "public_insert" policy added in 011_fix_all_rls.sql
-- was `WITH CHECK (true)` — anon could POST directly to the appointments
-- table with ANY business_id/branch_id pair (even mismatched ones scraped
-- from other tenants), any status, any date. This locks the public-booking
-- insert path down to what the booking page actually does: a branch that
-- really belongs to the stated business, a non-past date, and a status of
-- either 'confirmed' or 'waitlist' (the only two BookingPage ever sends —
-- 'cancelled'/'no_show'/'completed' are owner-only transitions).
--
-- NOTE: this is app-level validation, not rate limiting. A flood of anon
-- inserts (booking spam) is still possible at the network layer and should
-- be addressed separately (e.g. Cloudflare/Supabase rate limiting in front
-- of the REST API) before running paid marketing traffic to booking pages.

DROP POLICY IF EXISTS "public_insert" ON appointments;

CREATE POLICY "public_insert" ON appointments
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    business_id IN (SELECT id FROM businesses)
    AND branch_id IN (SELECT b.id FROM branches b WHERE b.business_id = appointments.business_id)
    AND appointment_date >= CURRENT_DATE
    AND status IN ('confirmed', 'waitlist')
  );
