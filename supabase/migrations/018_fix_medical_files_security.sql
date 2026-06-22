-- SECURITY FIX (C1): migration 017 made the "medical-files" bucket public and
-- granted anon SELECT on it, to fix broken thumbnails (the app rendered
-- getPublicUrl() output in <img src>, which a private bucket rejects).
-- That traded a UI bug for a real patient-data leak: anyone who knows/guesses
-- a file path (businessId/clientPhone/file) can view X-rays/lab results with
-- no auth at all. This migration reverts the bucket to private and replaces
-- the blanket "authenticated can read everything" policy from 011 with one
-- scoped to the file's owning business. The app now fetches short-lived
-- signed URLs instead of permanent public URLs (see usePatientRecord.js).

UPDATE storage.buckets SET public = false WHERE id = 'medical-files';

DROP POLICY IF EXISTS "public read medical files" ON storage.objects;
DROP POLICY IF EXISTS "auth read medical files" ON storage.objects;
DROP POLICY IF EXISTS "auth upload medical files" ON storage.objects;
DROP POLICY IF EXISTS "auth update medical files" ON storage.objects;
DROP POLICY IF EXISTS "auth delete medical files" ON storage.objects;

-- Path layout is `${businessId}/${clientPhone}/${fileName}`, so the first
-- folder segment is the owning business's id.
CREATE POLICY "owner_read_medical_files" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'medical-files'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM businesses WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "owner_upload_medical_files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'medical-files'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM businesses WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "owner_update_medical_files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'medical-files'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM businesses WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "owner_delete_medical_files" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'medical-files'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM businesses WHERE owner_id = auth.uid()
    )
  );

-- Store the storage path directly (not a permanent public URL) so signed
-- URLs can be minted on demand. Backfill existing rows from their old
-- public URL.
ALTER TABLE medical_attachments ADD COLUMN IF NOT EXISTS file_path text;

UPDATE medical_attachments
SET file_path = substring(file_url FROM 'medical-files/(.*)$')
WHERE file_path IS NULL AND file_url LIKE '%medical-files/%';
