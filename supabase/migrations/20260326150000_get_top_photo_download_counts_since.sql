-- Admin analytics: top photos by download *events* since a timestamp (bounded aggregate; no full-table fetch).

CREATE OR REPLACE FUNCTION public.get_top_photo_download_counts_since(
  p_since timestamptz,
  p_limit int DEFAULT 8
)
RETURNS TABLE (
  photo_id uuid,
  download_events bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (SELECT public.is_admin()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    d.photo_id,
    COUNT(*)::bigint AS download_events
  FROM public.downloads d
  WHERE d.created_at >= p_since
  GROUP BY d.photo_id
  ORDER BY download_events DESC, d.photo_id ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 8), 1), 50);
END;
$$;

REVOKE ALL ON FUNCTION public.get_top_photo_download_counts_since(timestamptz, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_top_photo_download_counts_since(timestamptz, int) TO authenticated;
