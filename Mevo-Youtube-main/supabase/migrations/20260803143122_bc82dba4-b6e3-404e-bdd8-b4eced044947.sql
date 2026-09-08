DROP POLICY IF EXISTS "Public can read audio files" ON storage.objects;
DROP POLICY IF EXISTS "Public can read cover images" ON storage.objects;
DROP POLICY IF EXISTS "Admins manage audio files" ON storage.objects;
DROP POLICY IF EXISTS "Admins manage cover images" ON storage.objects;

CREATE POLICY "Public can read audio files" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'audio-files');

CREATE POLICY "Public can read cover images" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'cover-images');

CREATE POLICY "Admins manage audio files" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'audio-files' AND public.is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'audio-files' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins manage cover images" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'cover-images' AND public.is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'cover-images' AND public.is_admin(auth.uid()));