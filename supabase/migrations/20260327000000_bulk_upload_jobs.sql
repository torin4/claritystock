-- Bulk ZIP upload jobs (folder → collection) with per-file outcomes for review/retry.

CREATE TABLE public.bulk_upload_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  summary jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

COMMENT ON TABLE public.bulk_upload_jobs IS
  'Bulk ZIP import: one job per upload; status drives notifications and review UI.';

CREATE INDEX bulk_upload_jobs_photographer_started_idx
  ON public.bulk_upload_jobs (photographer_id, started_at DESC);

CREATE TABLE public.bulk_upload_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.bulk_upload_jobs (id) ON DELETE CASCADE,
  relative_path text NOT NULL,
  folder_name text NOT NULL,
  collection_id uuid REFERENCES public.collections (id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('pending', 'processing', 'success', 'failed')),
  photo_id uuid REFERENCES public.photos (id) ON DELETE SET NULL,
  error_message text,
  storage_path text,
  thumbnail_path text,
  display_path text,
  content_hash text,
  form_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, relative_path)
);

COMMENT ON COLUMN public.bulk_upload_items.form_snapshot IS
  'PhotoFormValues + description when publish failed after storage — for retry.';

CREATE INDEX bulk_upload_items_job_idx ON public.bulk_upload_items (job_id);

ALTER TABLE public.bulk_upload_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_upload_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY bulk_upload_jobs_select_own
  ON public.bulk_upload_jobs FOR SELECT
  TO authenticated
  USING (photographer_id = auth.uid());

CREATE POLICY bulk_upload_jobs_insert_own
  ON public.bulk_upload_jobs FOR INSERT
  TO authenticated
  WITH CHECK (photographer_id = auth.uid());

CREATE POLICY bulk_upload_jobs_update_own
  ON public.bulk_upload_jobs FOR UPDATE
  TO authenticated
  USING (photographer_id = auth.uid())
  WITH CHECK (photographer_id = auth.uid());

CREATE POLICY bulk_upload_items_select_via_job
  ON public.bulk_upload_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bulk_upload_jobs j
      WHERE j.id = bulk_upload_items.job_id AND j.photographer_id = auth.uid()
    )
  );

CREATE POLICY bulk_upload_items_insert_via_job
  ON public.bulk_upload_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bulk_upload_jobs j
      WHERE j.id = bulk_upload_items.job_id AND j.photographer_id = auth.uid()
    )
  );

CREATE POLICY bulk_upload_items_update_via_job
  ON public.bulk_upload_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bulk_upload_jobs j
      WHERE j.id = bulk_upload_items.job_id AND j.photographer_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bulk_upload_jobs j
      WHERE j.id = bulk_upload_items.job_id AND j.photographer_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.bulk_upload_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.bulk_upload_items TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'bulk_upload_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bulk_upload_jobs;
  END IF;
END $$;
