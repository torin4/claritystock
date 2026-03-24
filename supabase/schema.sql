-- =============================================================================
-- Clarity Stock — Supabase Schema
-- =============================================================================
-- Safe to re-run: policies and triggers are dropped before recreate.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- TABLES (in dependency order)
-- ---------------------------------------------------------------------------

-- 1. users
CREATE TABLE IF NOT EXISTS public.users (
  id          uuid        PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  name        text,
  initials    text,
  role        text        NOT NULL DEFAULT 'photographer',
  avatar_url  text,
  email       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. collections
CREATE TABLE IF NOT EXISTS public.collections (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  category    text,
  created_by  uuid        REFERENCES public.users ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 3. photos
CREATE TABLE IF NOT EXISTS public.photos (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title            text        NOT NULL,
  photographer_id  uuid        REFERENCES public.users ON DELETE SET NULL,
  collection_id    uuid        REFERENCES public.collections ON DELETE SET NULL,
  category         text,
  neighborhood     text,
  subarea          text,
  lat              float,
  lng              float,
  captured_date    date,
  tags             text[],
  notes            text,
  description      text,
  storage_path     text,
  thumbnail_path   text,
  downloads_count  int         NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- 4. downloads
CREATE TABLE IF NOT EXISTS public.downloads (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id       uuid        REFERENCES public.photos ON DELETE CASCADE,
  downloaded_by  uuid        REFERENCES public.users ON DELETE SET NULL,
  job_ref        text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- 5. favorites
CREATE TABLE IF NOT EXISTS public.favorites (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id    uuid        REFERENCES public.photos ON DELETE CASCADE,
  user_id     uuid        REFERENCES public.users ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (photo_id, user_id)
);

-- ---------------------------------------------------------------------------
-- FULL-TEXT SEARCH
-- ---------------------------------------------------------------------------

ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS fts tsvector;

CREATE INDEX IF NOT EXISTS photos_fts_idx ON public.photos USING GIN (fts);

-- Trigger function to keep fts up to date
CREATE OR REPLACE FUNCTION public.photos_fts_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.fts := to_tsvector(
    'english',
    coalesce(NEW.title, '') || ' ' ||
    coalesce(NEW.neighborhood, '') || ' ' ||
    coalesce(NEW.description, '') || ' ' ||
    coalesce(array_to_string(NEW.tags, ' '), '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS photos_fts_trigger ON public.photos;
CREATE TRIGGER photos_fts_trigger
  BEFORE INSERT OR UPDATE ON public.photos
  FOR EACH ROW EXECUTE FUNCTION public.photos_fts_update();

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY — enable
-- ---------------------------------------------------------------------------

ALTER TABLE public.users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.downloads   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites   ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- RLS POLICIES — users
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "users_read" ON public.users;
CREATE POLICY "users_read"
  ON public.users FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "users_insert" ON public.users;
CREATE POLICY "users_insert"
  ON public.users FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "users_update" ON public.users;
CREATE POLICY "users_update"
  ON public.users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- RLS POLICIES — photos
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "photos_read" ON public.photos;
CREATE POLICY "photos_read"
  ON public.photos FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "photos_insert" ON public.photos;
CREATE POLICY "photos_insert"
  ON public.photos FOR INSERT
  WITH CHECK (auth.uid() = photographer_id);

DROP POLICY IF EXISTS "photos_update" ON public.photos;
CREATE POLICY "photos_update"
  ON public.photos FOR UPDATE
  USING (auth.uid() = photographer_id)
  WITH CHECK (auth.uid() = photographer_id);

DROP POLICY IF EXISTS "photos_delete" ON public.photos;
CREATE POLICY "photos_delete"
  ON public.photos FOR DELETE
  USING (auth.uid() = photographer_id);

-- ---------------------------------------------------------------------------
-- RLS POLICIES — collections
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "collections_read" ON public.collections;
CREATE POLICY "collections_read"
  ON public.collections FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "collections_insert" ON public.collections;
CREATE POLICY "collections_insert"
  ON public.collections FOR INSERT
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "collections_update" ON public.collections;
CREATE POLICY "collections_update"
  ON public.collections FOR UPDATE
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "collections_delete" ON public.collections;
CREATE POLICY "collections_delete"
  ON public.collections FOR DELETE
  USING (auth.uid() = created_by);

-- ---------------------------------------------------------------------------
-- RLS POLICIES — downloads
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "downloads_read" ON public.downloads;
CREATE POLICY "downloads_read"
  ON public.downloads FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "downloads_insert" ON public.downloads;
CREATE POLICY "downloads_insert"
  ON public.downloads FOR INSERT
  WITH CHECK (auth.uid() = downloaded_by);

DROP POLICY IF EXISTS "downloads_update" ON public.downloads;
CREATE POLICY "downloads_update"
  ON public.downloads FOR UPDATE
  USING (auth.uid() = downloaded_by)
  WITH CHECK (auth.uid() = downloaded_by);

-- ---------------------------------------------------------------------------
-- RLS POLICIES — favorites
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "favorites_all" ON public.favorites;
CREATE POLICY "favorites_all"
  ON public.favorites
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- STORAGE RLS POLICIES — 'photos' bucket
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "storage_read" ON storage.objects;
CREATE POLICY "storage_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'photos' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "storage_insert" ON storage.objects;
CREATE POLICY "storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'photos' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "storage_delete" ON storage.objects;
CREATE POLICY "storage_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ---------------------------------------------------------------------------
-- Admin helper + policies (role = 'admin' in public.users)
-- ---------------------------------------------------------------------------

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

DROP POLICY IF EXISTS "collections_read_admin" ON public.collections;
CREATE POLICY "collections_read_admin"
  ON public.collections FOR SELECT
  TO authenticated
  USING (public.is_admin());

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

DROP POLICY IF EXISTS "storage_delete_admin" ON storage.objects;
CREATE POLICY "storage_delete_admin"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'photos' AND public.is_admin());

-- ---------------------------------------------------------------------------
-- RPC FUNCTION — record_download
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_download(
  p_photo_id      uuid,
  p_downloaded_by uuid,
  p_job_ref       text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_download_id uuid;
BEGIN
  -- Insert download record
  INSERT INTO public.downloads (photo_id, downloaded_by, job_ref)
  VALUES (p_photo_id, p_downloaded_by, p_job_ref)
  RETURNING id INTO v_download_id;

  -- Atomically increment downloads_count on the photo
  UPDATE public.photos
  SET downloads_count = downloads_count + 1
  WHERE id = p_photo_id;

  RETURN v_download_id;
END;
$$;

-- Bulk ZIP downloads: one row per photo + increment counts (same semantics as N × record_download)
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

-- Clear current user’s download rows for these photos (Browse “downloaded” checkmark off); keeps photos in library
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

-- ---------------------------------------------------------------------------
-- RPC — recent collections for nav (all users’ collections, by last activity)
-- ---------------------------------------------------------------------------

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
  ORDER BY last_activity_at DESC NULLS LAST
  LIMIT COALESCE(NULLIF(p_limit, 0), 8);
$$;

GRANT EXECUTE ON FUNCTION public.recent_collections_nav(integer) TO authenticated;
