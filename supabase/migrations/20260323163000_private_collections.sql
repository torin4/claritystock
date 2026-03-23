-- Make collections private per photographer and scope nav RPC.
-- Run via `supabase db push`.

DROP POLICY IF EXISTS "collections_read" ON public.collections;
CREATE POLICY "collections_read"
  ON public.collections FOR SELECT
  USING (auth.uid() = created_by);

CREATE OR REPLACE FUNCTION public.recent_collections_nav(p_limit integer DEFAULT 8)
RETURNS TABLE (
  id uuid,
  name text,
  category text,
  last_activity_at timestamptz,
  thumb_storage_path text,
  thumb_thumbnail_path text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.name,
    c.category,
    COALESCE(
      (SELECT MAX(p.created_at) FROM public.photos p WHERE p.collection_id = c.id),
      c.created_at
    ) AS last_activity_at,
    (SELECT p.storage_path FROM public.photos p
        WHERE p.collection_id = c.id
        ORDER BY p.created_at DESC NULLS LAST LIMIT 1),
    (SELECT p.thumbnail_path FROM public.photos p
        WHERE p.collection_id = c.id
        ORDER BY p.created_at DESC NULLS LAST LIMIT 1)
  FROM public.collections c
  WHERE c.created_by = auth.uid()
  ORDER BY last_activity_at DESC NULLS LAST
  LIMIT COALESCE(NULLIF(p_limit, 0), 8);
$$;

GRANT EXECUTE ON FUNCTION public.recent_collections_nav(integer) TO authenticated;
