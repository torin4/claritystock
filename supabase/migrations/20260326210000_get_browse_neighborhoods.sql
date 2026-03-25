-- Distinct neighborhood values for Library filter dropdown (same visibility as browse grid).

CREATE OR REPLACE FUNCTION public.get_browse_neighborhoods(
  p_exclude_photographer_id uuid DEFAULT NULL
)
RETURNS TABLE (neighborhood text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT trim(p.neighborhood) AS neighborhood
  FROM public.photos p
  WHERE p.neighborhood IS NOT NULL
    AND trim(p.neighborhood) <> ''
    AND (
      p_exclude_photographer_id IS NULL
      OR p.photographer_id IS NULL
      OR p.photographer_id <> p_exclude_photographer_id
    )
  ORDER BY 1;
$$;

REVOKE ALL ON FUNCTION public.get_browse_neighborhoods(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_browse_neighborhoods(uuid) TO authenticated;
