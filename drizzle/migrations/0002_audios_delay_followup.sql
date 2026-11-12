ALTER TABLE public.clinic_settings
  ADD COLUMN reply_delay_seconds int NOT NULL DEFAULT 0,
  ADD COLUMN followup_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN followup_minutes int NOT NULL DEFAULT 20,
  ADD COLUMN followup_text text NOT NULL DEFAULT 'Oi! A doutora ainda está em atendimento, mas já já ela te responde, tá? 💛',
  ADD COLUMN followup_audio_id uuid;
ALTER TABLE public.conversations ADD COLUMN followup_sent_at timestamptz;

CREATE TABLE public.clinic_audios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  use_when text NOT NULL DEFAULT '',
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_audios TO authenticated;
GRANT ALL ON public.clinic_audios TO service_role;
ALTER TABLE public.clinic_audios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage audios" ON public.clinic_audios FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'staff')) WITH CHECK (public.has_role(auth.uid(), 'staff'));

ALTER TABLE public.messages ADD COLUMN audio_id uuid;

CREATE POLICY "staff upload clinic audios" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'clinic-audios' AND public.has_role(auth.uid(), 'staff'));
CREATE POLICY "staff delete clinic audios" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'clinic-audios' AND public.has_role(auth.uid(), 'staff'));