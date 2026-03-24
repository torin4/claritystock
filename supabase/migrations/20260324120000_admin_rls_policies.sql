-- Admin: full read/write on photos/collections + storage delete anywhere (for moderation / proxy upload).
-- Uses public.users.role = 'admin'.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;

-- Photos: admins may insert/update/delete any row (e.g. proxy upload, moderation).
DROP POLICY IF EXISTS "photos_insert_admin" ON public.photos;
CREATE POLICY "photos_insert_admin"
  ON public.photos FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "photos_update_admin" ON public.photos;
CREATE POLICY "photos_update_admin"
  ON public.photos FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "photos_delete_admin" ON public.photos;
CREATE POLICY "photos_delete_admin"
  ON public.photos FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- Collections: admins may read any collection (browse + admin upload UI).
DROP POLICY IF EXISTS "collections_read_admin" ON public.collections;
CREATE POLICY "collections_read_admin"
  ON public.collections FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Collections: admins may manage any collection.
DROP POLICY IF EXISTS "collections_insert_admin" ON public.collections;
CREATE POLICY "collections_insert_admin"
  ON public.collections FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "collections_update_admin" ON public.collections;
CREATE POLICY "collections_update_admin"
  ON public.collections FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "collections_delete_admin" ON public.collections;
CREATE POLICY "collections_delete_admin"
  ON public.collections FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- Storage: admins may delete any object in photos bucket (e.g. when deleting another user's photo).
DROP POLICY IF EXISTS "storage_delete_admin" ON storage.objects;
CREATE POLICY "storage_delete_admin"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'photos' AND public.is_admin());
