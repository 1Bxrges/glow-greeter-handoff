CREATE POLICY "staff read clinic audios" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'clinic-audios' AND public.has_role(auth.uid(), 'staff'));