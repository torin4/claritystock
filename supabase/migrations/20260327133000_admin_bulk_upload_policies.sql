-- Allow admins to run bulk ZIP imports on behalf of any photographer.
-- This complements public.is_admin() and the existing admin photo policies.

-- ---------------------------------------------------------------------------
-- bulk_upload_jobs: admins may select/insert/update any row
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS bulk_upload_jobs_select_admin ON public.bulk_upload_jobs;
CREATE POLICY bulk_upload_jobs_select_admin
  ON public.bulk_upload_jobs FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS bulk_upload_jobs_insert_admin ON public.bulk_upload_jobs;
CREATE POLICY bulk_upload_jobs_insert_admin
  ON public.bulk_upload_jobs FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS bulk_upload_jobs_update_admin ON public.bulk_upload_jobs;
CREATE POLICY bulk_upload_jobs_update_admin
  ON public.bulk_upload_jobs FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- bulk_upload_items: admins may select/insert/update any row
-- (we scope by job via the same admin check to avoid opening writes across other future uses)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS bulk_upload_items_select_admin ON public.bulk_upload_items;
CREATE POLICY bulk_upload_items_select_admin
  ON public.bulk_upload_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bulk_upload_jobs j
      WHERE j.id = bulk_upload_items.job_id AND public.is_admin()
    )
  );

DROP POLICY IF EXISTS bulk_upload_items_insert_admin ON public.bulk_upload_items;
CREATE POLICY bulk_upload_items_insert_admin
  ON public.bulk_upload_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bulk_upload_jobs j
      WHERE j.id = bulk_upload_items.job_id AND public.is_admin()
    )
  );

DROP POLICY IF EXISTS bulk_upload_items_update_admin ON public.bulk_upload_items;
CREATE POLICY bulk_upload_items_update_admin
  ON public.bulk_upload_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bulk_upload_jobs j
      WHERE j.id = bulk_upload_items.job_id AND public.is_admin()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bulk_upload_jobs j
      WHERE j.id = bulk_upload_items.job_id AND public.is_admin()
    )
  );

-- ---------------------------------------------------------------------------
-- Storage: admins may insert objects anywhere in photos bucket
-- Needed so an admin session can upload under photographer_id/...
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "storage_insert_admin" ON storage.objects;
CREATE POLICY "storage_insert_admin"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'photos' AND public.is_admin());

