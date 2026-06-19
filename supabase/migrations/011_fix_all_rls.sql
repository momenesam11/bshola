-- ============================================================
-- FIX ALL RLS POLICIES (run this in Supabase SQL Editor)
-- ============================================================

-- ── BUSINESSES ────────────────────────────────────────────
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_all" ON businesses;
CREATE POLICY "owner_all" ON businesses
  FOR ALL
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Allow public SELECT by booking_slug (for the booking page)
DROP POLICY IF EXISTS "public_select_businesses" ON businesses;
CREATE POLICY "public_select_businesses" ON businesses
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- ── SERVICES ──────────────────────────────────────────────
ALTER TABLE services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_all" ON services;
CREATE POLICY "owner_all" ON services
  FOR ALL
  TO authenticated
  USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "public_select" ON services;
CREATE POLICY "public_select" ON services
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- ── APPOINTMENTS ──────────────────────────────────────────
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_all" ON appointments;
CREATE POLICY "owner_all" ON appointments
  FOR ALL
  TO authenticated
  USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));

-- Public can INSERT (for the booking page)
DROP POLICY IF EXISTS "public_insert" ON appointments;
CREATE POLICY "public_insert" ON appointments
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- ── BRANCHES ──────────────────────────────────────────────
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_all_branches" ON branches;
CREATE POLICY "owner_all_branches" ON branches
  FOR ALL
  TO authenticated
  USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));

-- Public can SELECT branches (for the booking page)
DROP POLICY IF EXISTS "public_read_branches" ON branches;
CREATE POLICY "public_read_branches" ON branches
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- ── CLIENTS ───────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'clients') THEN
    EXECUTE 'ALTER TABLE clients ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "owner_all" ON clients';
    EXECUTE $p$
      CREATE POLICY "owner_all" ON clients
        FOR ALL
        TO authenticated
        USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()))
        WITH CHECK (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()))
    $p$;
  END IF;
END $$;

-- ── PATIENT RECORDS ───────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'patient_records') THEN
    EXECUTE 'ALTER TABLE patient_records ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "owner_all" ON patient_records';
    EXECUTE $p$
      CREATE POLICY "owner_all" ON patient_records
        FOR ALL
        TO authenticated
        USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()))
        WITH CHECK (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()))
    $p$;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'diagnoses') THEN
    EXECUTE 'ALTER TABLE diagnoses ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "owner_all" ON diagnoses';
    EXECUTE $p$
      CREATE POLICY "owner_all" ON diagnoses
        FOR ALL
        TO authenticated
        USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()))
        WITH CHECK (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()))
    $p$;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'prescriptions') THEN
    EXECUTE 'ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "owner_all" ON prescriptions';
    EXECUTE $p$
      CREATE POLICY "owner_all" ON prescriptions
        FOR ALL
        TO authenticated
        USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()))
        WITH CHECK (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()))
    $p$;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'attachments') THEN
    EXECUTE 'ALTER TABLE attachments ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "owner_all" ON attachments';
    EXECUTE $p$
      CREATE POLICY "owner_all" ON attachments
        FOR ALL
        TO authenticated
        USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()))
        WITH CHECK (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()))
    $p$;
  END IF;
END $$;

-- ── STORAGE: business-assets bucket ───────────────────────
-- Create the bucket if it doesn't exist (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('business-assets', 'business-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Drop old storage policies
DROP POLICY IF EXISTS "public read business assets" ON storage.objects;
DROP POLICY IF EXISTS "auth upload business assets" ON storage.objects;
DROP POLICY IF EXISTS "auth update business assets" ON storage.objects;
DROP POLICY IF EXISTS "auth delete business assets" ON storage.objects;

CREATE POLICY "public read business assets" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'business-assets');

CREATE POLICY "auth upload business assets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'business-assets');

CREATE POLICY "auth update business assets" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'business-assets');

CREATE POLICY "auth delete business assets" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'business-assets');

-- ── STORAGE: medical-files bucket ─────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('medical-files', 'medical-files', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "auth read medical files" ON storage.objects;
DROP POLICY IF EXISTS "auth upload medical files" ON storage.objects;
DROP POLICY IF EXISTS "auth update medical files" ON storage.objects;
DROP POLICY IF EXISTS "auth delete medical files" ON storage.objects;

CREATE POLICY "auth read medical files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'medical-files');

CREATE POLICY "auth upload medical files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'medical-files');

CREATE POLICY "auth update medical files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'medical-files');

CREATE POLICY "auth delete medical files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'medical-files');
