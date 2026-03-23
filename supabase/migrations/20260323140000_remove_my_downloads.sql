-- Removes your download history for given photos; decrements photos.downloads_count.
-- Run in Supabase SQL or via `supabase db push`.

DROP FUNCTION IF EXISTS public.remove_my_downloads(uuid[]);

CREATE OR REPLACE FUNCTION public.remove_my_downloads(p_photo_ids uuid[])
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

  WITH deleted AS (
    DELETE FROM public.downloads d
    WHERE d.downloaded_by = uid
      AND d.photo_id = ANY(p_photo_ids)
    RETURNING d.photo_id
  ),
  counts AS (
    SELECT photo_id, COUNT(*)::int AS n
    FROM deleted
    GROUP BY photo_id
  )
  UPDATE public.photos p
  SET downloads_count = GREATEST(0, p.downloads_count - c.n)
  FROM counts c
  WHERE p.id = c.photo_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_my_downloads(uuid[]) TO authenticated;
