-- Run via Supabase SQL editor or `supabase db push`.
-- Bulk ZIP downloads: one downloads row per photo + increment downloads_count.

DROP FUNCTION IF EXISTS public.record_downloads_bulk(uuid[], text);

CREATE OR REPLACE FUNCTION public.record_downloads_bulk(
  p_photo_ids     uuid[],
  p_job_ref       text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_photo_ids IS NULL OR cardinality(p_photo_ids) = 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.downloads (photo_id, downloaded_by, job_ref)
  SELECT unnest(p_photo_ids), uid, p_job_ref;

  UPDATE public.photos p
  SET downloads_count = downloads_count + 1
  WHERE p.id IN (SELECT unnest(p_photo_ids));
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_downloads_bulk(uuid[], text) TO authenticated;
