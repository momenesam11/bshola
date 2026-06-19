-- Run this in Supabase SQL Editor to verify and fix RLS policies
-- Go to: Supabase Dashboard → SQL Editor → New query

-- 1. Check existing policies
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public';

-- 2. Drop and recreate policies to ensure they're correct

-- BUSINESSES
DROP POLICY IF EXISTS "owner_all" ON businesses;
CREATE POLICY "owner_all" ON businesses
  FOR ALL
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- SERVICES (owner)
DROP POLICY IF EXISTS "owner_all" ON services;
CREATE POLICY "owner_all" ON services
  FOR ALL
  TO authenticated
  USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));

-- SERVICES (public read)
DROP POLICY IF EXISTS "public_select" ON services;
CREATE POLICY "public_select" ON services
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- APPOINTMENTS (owner)
DROP POLICY IF EXISTS "owner_all" ON appointments;
CREATE POLICY "owner_all" ON appointments
  FOR ALL
  TO authenticated
  USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));

-- APPOINTMENTS (public insert for booking page)
DROP POLICY IF EXISTS "public_insert" ON appointments;
CREATE POLICY "public_insert" ON appointments
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- 3. Verify RLS is enabled
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- 4. Quick test: this should return your businesses count
SELECT count(*) as my_businesses FROM businesses WHERE owner_id = auth.uid();
