-- The "medical-files" bucket was created as private (migration 011), but the
-- app calls storage.getPublicUrl() to build the file_url stored on
-- medical_attachments rows and renders it directly in <img src>. A plain
-- <img> request carries no auth header, so against a private bucket every
-- such request is rejected — uploads succeed but thumbnails never render
-- (broken-image icon). Supabase only serves the public object endpoint for
-- buckets explicitly marked public, regardless of RLS, so this must flip.
UPDATE storage.buckets SET public = true WHERE id = 'medical-files';

DROP POLICY IF EXISTS "public read medical files" ON storage.objects;
CREATE POLICY "public read medical files" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'medical-files');
