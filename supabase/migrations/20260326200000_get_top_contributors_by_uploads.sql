-- Rank “Top contributors” by number of uploads (photos in library), not by uses/downloads.
CREATE OR REPLACE FUNCTION public.get_top_contributors(p_limit int DEFAULT 10)
RETURNS TABLE (
  user_id uuid,
  user_name text,
  user_initials text,
  photo_count bigint,
  download_uses bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    agg.photographer_id AS user_id,
    u.name AS user_name,
    u.initials AS user_initials,
    agg.photo_count,
    agg.download_uses
  FROM (
    SELECT
      p.photographer_id,
      COUNT(*)::bigint AS photo_count,
      COALESCE(SUM(p.downloads_count), 0)::bigint AS download_uses
    FROM public.photos p
    WHERE p.photographer_id IS NOT NULL
    GROUP BY p.photographer_id
  ) agg
  JOIN public.users u ON u.id = agg.photographer_id
  -- Primary sort: number of uploads (photos). Secondary: cumulative uses.
  ORDER BY agg.photo_count DESC, agg.download_uses DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
$$;

REVOKE ALL ON FUNCTION public.get_top_contributors(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_top_contributors(int) TO authenticated;

