-- Security: bind downloads to auth.uid(), cap bulk RPC, tighten storage insert, path ownership on photos

-- ---------------------------------------------------------------------------
-- record_download: ignore caller-supplied user id (SECURITY DEFINER bypassed RLS)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.record_download(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.record_download(
  p_photo_id uuid,
  p_job_ref  text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_download_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.downloads (photo_id, downloaded_by, job_ref)
  VALUES (p_photo_id, v_uid, p_job_ref)
  RETURNING id INTO v_download_id;

  UPDATE public.photos
  SET downloads_count = downloads_count + 1
  WHERE id = p_photo_id;

  RETURN v_download_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_download(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- record_downloads_bulk: cap batch size (aligns with ZIP_DOWNLOAD_MAX_PHOTOS = 25)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.record_downloads_bulk(uuid[], text);

CREATE OR REPLACE FUNCTION public.record_downloads_bulk(
  p_photo_ids uuid[],
  p_job_ref   text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  n int;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_photo_ids IS NULL OR cardinality(p_photo_ids) = 0 THEN
    RETURN;
  END IF;

  n := cardinality(p_photo_ids);
  IF n > 25 THEN
    RAISE EXCEPTION 'Too many photo ids (max 25)';
  END IF;

  INSERT INTO public.downloads (photo_id, downloaded_by, job_ref)
  SELECT unnest(p_photo_ids), uid, p_job_ref;

  UPDATE public.photos p
  SET downloads_count = downloads_count + 1
  WHERE p.id IN (SELECT unnest(p_photo_ids));
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_downloads_bulk(uuid[], text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Storage: uploads only under the caller's folder (matches lib/utils/storage.ts)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "storage_insert" ON storage.objects;
CREATE POLICY "storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'photos'
    AND auth.uid() IS NOT NULL
    AND name LIKE (auth.uid()::text || '/%')
  );

-- ---------------------------------------------------------------------------
-- photos: persisted paths must live under photographer_id when both are set
-- ---------------------------------------------------------------------------
ALTER TABLE public.photos
  DROP CONSTRAINT IF EXISTS photos_storage_paths_under_photographer;

ALTER TABLE public.photos
  ADD CONSTRAINT photos_storage_paths_under_photographer CHECK (
    photographer_id IS NULL
    OR (
      (storage_path IS NULL OR storage_path LIKE photographer_id::text || '/%')
      AND (thumbnail_path IS NULL OR thumbnail_path LIKE photographer_id::text || '/%')
      AND (display_path IS NULL OR display_path LIKE photographer_id::text || '/%')
    )
  ) NOT VALID;
