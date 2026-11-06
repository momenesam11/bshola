-- Rollback for supabase/migrations/040_lock_business_reads.sql.
-- Warning: this reopens owner phone numbers to anyone. Use only to restore booking
-- pages in an emergency, then fix the cause and run 040 again.
DROP POLICY IF EXISTS "public_select_businesses" ON businesses;
CREATE POLICY "public_select_businesses" ON businesses
  FOR SELECT
  TO anon, authenticated
  USING (true);
