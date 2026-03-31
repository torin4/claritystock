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

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS hide_own_photos_in_browse boolean NOT NULL DEFAULT false;

-- 1b. Google OAuth refresh token vault (Chat API); ciphertext from app, RLS own-row only
CREATE TABLE IF NOT EXISTS public.user_google_credentials (
  user_id             uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  refresh_ciphertext  text,
  access_ciphertext   text,
  access_stored_at    timestamptz,
  updated_at          timestamptz NOT NULL DEFAULT now()
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
  display_path     text,
  content_hash     text,
  downloads_count  int         NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS display_path text;

ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS content_hash text;

CREATE INDEX IF NOT EXISTS photos_content_hash_idx
  ON public.photos (content_hash)
  WHERE content_hash IS NOT NULL;

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

-- 5b. bulk ZIP upload jobs
CREATE TABLE IF NOT EXISTS public.bulk_upload_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  summary jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS bulk_upload_jobs_photographer_started_idx
  ON public.bulk_upload_jobs (photographer_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.bulk_upload_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.bulk_upload_jobs (id) ON DELETE CASCADE,
  relative_path text NOT NULL,
  folder_name text NOT NULL,
  collection_id uuid REFERENCES public.collections (id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('pending', 'processing', 'success', 'failed')),
  photo_id uuid REFERENCES public.photos (id) ON DELETE SET NULL,
  error_message text,
  storage_path text,
  thumbnail_path text,
  display_path text,
  content_hash text,
  form_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, relative_path)
);

CREATE INDEX IF NOT EXISTS bulk_upload_items_job_idx ON public.bulk_upload_items (job_id);

ALTER TABLE public.bulk_upload_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_upload_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bulk_upload_jobs_select_own ON public.bulk_upload_jobs;
CREATE POLICY bulk_upload_jobs_select_own
  ON public.bulk_upload_jobs FOR SELECT TO authenticated
  USING (photographer_id = auth.uid());

DROP POLICY IF EXISTS bulk_upload_jobs_insert_own ON public.bulk_upload_jobs;
CREATE POLICY bulk_upload_jobs_insert_own
  ON public.bulk_upload_jobs FOR INSERT TO authenticated
  WITH CHECK (photographer_id = auth.uid());

DROP POLICY IF EXISTS bulk_upload_jobs_update_own ON public.bulk_upload_jobs;
CREATE POLICY bulk_upload_jobs_update_own
  ON public.bulk_upload_jobs FOR UPDATE TO authenticated
  USING (photographer_id = auth.uid())
  WITH CHECK (photographer_id = auth.uid());

DROP POLICY IF EXISTS bulk_upload_items_select_via_job ON public.bulk_upload_items;
CREATE POLICY bulk_upload_items_select_via_job
  ON public.bulk_upload_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bulk_upload_jobs j
      WHERE j.id = bulk_upload_items.job_id AND j.photographer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS bulk_upload_items_insert_via_job ON public.bulk_upload_items;
CREATE POLICY bulk_upload_items_insert_via_job
  ON public.bulk_upload_items FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bulk_upload_jobs j
      WHERE j.id = bulk_upload_items.job_id AND j.photographer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS bulk_upload_items_update_via_job ON public.bulk_upload_items;
CREATE POLICY bulk_upload_items_update_via_job
  ON public.bulk_upload_items FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bulk_upload_jobs j
      WHERE j.id = bulk_upload_items.job_id AND j.photographer_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bulk_upload_jobs j
      WHERE j.id = bulk_upload_items.job_id AND j.photographer_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.bulk_upload_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.bulk_upload_items TO authenticated;

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
    coalesce(NEW.subarea, '') || ' ' ||
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

-- Remove collection when its last photo is deleted or moved out
CREATE OR REPLACE FUNCTION public.purge_empty_collection_after_photo_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_coll uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    old_coll := OLD.collection_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.collection_id IS NOT DISTINCT FROM NEW.collection_id THEN
      RETURN NEW;
    END IF;
    old_coll := OLD.collection_id;
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF old_coll IS NOT NULL THEN
    DELETE FROM public.collections c
    WHERE c.id = old_coll
      AND NOT EXISTS (SELECT 1 FROM public.photos p WHERE p.collection_id = c.id);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS photos_purge_empty_collection_on_delete ON public.photos;
CREATE TRIGGER photos_purge_empty_collection_on_delete
  AFTER DELETE ON public.photos
  FOR EACH ROW
  EXECUTE FUNCTION public.purge_empty_collection_after_photo_change();

DROP TRIGGER IF EXISTS photos_purge_empty_collection_on_update ON public.photos;
CREATE TRIGGER photos_purge_empty_collection_on_update
  AFTER UPDATE OF collection_id ON public.photos
  FOR EACH ROW
  EXECUTE FUNCTION public.purge_empty_collection_after_photo_change();

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY — enable
-- ---------------------------------------------------------------------------

ALTER TABLE public.users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_google_credentials ENABLE ROW LEVEL SECURITY;
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
-- RLS POLICIES — user_google_credentials
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "user_google_credentials_select_own" ON public.user_google_credentials;
CREATE POLICY "user_google_credentials_select_own"
  ON public.user_google_credentials FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_google_credentials_insert_own" ON public.user_google_credentials;
CREATE POLICY "user_google_credentials_insert_own"
  ON public.user_google_credentials FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_google_credentials_update_own" ON public.user_google_credentials;
CREATE POLICY "user_google_credentials_update_own"
  ON public.user_google_credentials FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_google_credentials_delete_own" ON public.user_google_credentials;
CREATE POLICY "user_google_credentials_delete_own"
  ON public.user_google_credentials FOR DELETE
  USING (auth.uid() = user_id);

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
  WITH CHECK (
    bucket_id = 'photos'
    AND auth.uid() IS NOT NULL
    AND name LIKE (auth.uid()::text || '/%')
  );

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

  IF cardinality(p_photo_ids) > 25 THEN
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
-- Canonical location labels (app autocomplete + save-time resolution)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.neighborhood_canonicals (
  label text PRIMARY KEY
);

COMMENT ON TABLE public.neighborhood_canonicals IS
  'Location labels for autocomplete and save-time normalization: all WA cities/towns; Seattle neighborhoods; Puget Sound colloquial names.';

INSERT INTO public.neighborhood_canonicals (label) VALUES
  ('Aberdeen'),
  ('Adams'),
  ('Airway Heights'),
  ('Albion'),
  ('Algona'),
  ('Alki Point'),
  ('Almira'),
  ('Anacortes'),
  ('Arbor Heights'),
  ('Arlington'),
  ('Asotin'),
  ('Atlantic'),
  ('Auburn'),
  ('Bainbridge Island'),
  ('Ballard'),
  ('Battle Ground'),
  ('Beacon Hill'),
  ('Beaux Arts Village'),
  ('Bellevue'),
  ('Bellingham'),
  ('Belltown'),
  ('Benton City'),
  ('Bingen'),
  ('Bitter Lake'),
  ('Black Diamond'),
  ('Blaine'),
  ('Blue Ridge'),
  ('Bonney Lake'),
  ('Bothell'),
  ('Bremerton'),
  ('Brewster'),
  ('Briarcliff'),
  ('Bridgeport'),
  ('Brier'),
  ('Brighton'),
  ('Broadmoor'),
  ('Broadview'),
  ('Broadway'),
  ('Bryant'),
  ('Buckley'),
  ('Bucoda'),
  ('Burien'),
  ('Burlington'),
  ('Camas'),
  ('Capitol Hill'),
  ('Carbonado'),
  ('Carnation'),
  ('Cascade'),
  ('Cashmere'),
  ('Castle Rock'),
  ('Cathlamet'),
  ('Cedar Park'),
  ('Central Business District'),
  ('Central District'),
  ('Central Waterfront'),
  ('Centralia'),
  ('Chehalis'),
  ('Chelan'),
  ('Cheney'),
  ('Cherry Hill'),
  ('Chewelah'),
  ('Chinatown-International District'),
  ('Clarkston'),
  ('Cle Elum'),
  ('Clyde Hill'),
  ('Colfax'),
  ('College Place'),
  ('Colton'),
  ('Columbia City'),
  ('Colville'),
  ('Conconully'),
  ('Concrete'),
  ('Connell'),
  ('Cosmopolis'),
  ('Coulee City'),
  ('Coulee Dam'),
  ('Coupeville'),
  ('Covington'),
  ('Creston'),
  ('Crown Hill'),
  ('Cusick'),
  ('Darrington'),
  ('Davenport'),
  ('Dayton'),
  ('Deer Park'),
  ('Delridge'),
  ('Denny Regrade'),
  ('Denny Triangle'),
  ('Denny-Blaine'),
  ('Des Moines'),
  ('Downtown'),
  ('Dunlap'),
  ('DuPont'),
  ('Duvall'),
  ('East Queen Anne'),
  ('East Wenatchee'),
  ('Eastlake'),
  ('Eatonville'),
  ('Edgewood'),
  ('Edmonds'),
  ('Electric City'),
  ('Ellensburg'),
  ('Elma'),
  ('Elmer City'),
  ('Endicott'),
  ('Entiat'),
  ('Enumclaw'),
  ('Ephrata'),
  ('Everett'),
  ('Everson'),
  ('Fairfield'),
  ('Fairmount Park'),
  ('Fall City'),
  ('Farmington'),
  ('Fauntleroy'),
  ('Federal Way'),
  ('Ferndale'),
  ('Fife'),
  ('Fircrest'),
  ('First Hill'),
  ('Forks'),
  ('Frelard'),
  ('Fremont'),
  ('Friday Harbor'),
  ('Garfield'),
  ('Garfield High School'),
  ('Gatewood'),
  ('Genesee'),
  ('George'),
  ('Georgetown'),
  ('Gig Harbor'),
  ('Gold Bar'),
  ('Goldendale'),
  ('Grand Coulee'),
  ('Grandview'),
  ('Granger'),
  ('Granite Falls'),
  ('Green Lake'),
  ('Greenwood'),
  ('Haller Lake'),
  ('Hamilton'),
  ('Harbor Island'),
  ('Harrah'),
  ('Harrington'),
  ('Hartline'),
  ('Hatton'),
  ('Hawthorne Hills'),
  ('High Point'),
  ('Highland Park'),
  ('Hillman City'),
  ('Hoquiam'),
  ('Hunts Point'),
  ('Ilwaco'),
  ('Index'),
  ('Industrial District'),
  ('Interbay'),
  ('International District'),
  ('Ione'),
  ('Issaquah'),
  ('Judkins Park'),
  ('Junction'),
  ('Kahlotus'),
  ('Kalama'),
  ('Kelso'),
  ('Kenmore'),
  ('Kennewick'),
  ('Kent'),
  ('Kettle Falls'),
  ('Kirkland'),
  ('Kittitas'),
  ('Krupp'),
  ('La Center'),
  ('La Conner'),
  ('Lacey'),
  ('LaCrosse'),
  ('Lake City'),
  ('Lake Forest Park'),
  ('Lake Stevens'),
  ('Lakewood'),
  ('Lamont'),
  ('Langley'),
  ('Latah'),
  ('Laurelhurst'),
  ('Lawton Park'),
  ('Leavenworth'),
  ('Leschi'),
  ('Liberty Lake'),
  ('Licton Springs'),
  ('Lind'),
  ('Long Beach'),
  ('Longview'),
  ('Lower Queen Anne'),
  ('Loyal Heights'),
  ('Lyman'),
  ('Lynden'),
  ('Lynnwood'),
  ('Mabton'),
  ('Madison Park'),
  ('Madison Valley'),
  ('Madrona'),
  ('Madrona Valley'),
  ('Magnolia'),
  ('Malden'),
  ('Mann'),
  ('Mansfield'),
  ('Maple Leaf'),
  ('Maple Valley'),
  ('Marcus'),
  ('Marysville'),
  ('Mattawa'),
  ('Matthews Beach'),
  ('Maury Island'),
  ('McCleary'),
  ('Meadowbrook'),
  ('Medical Lake'),
  ('Medina'),
  ('Mercer Island'),
  ('Meridian'),
  ('Mesa'),
  ('Metaline'),
  ('Metaline Falls'),
  ('Mill Creek'),
  ('Millwood'),
  ('Milton'),
  ('Minor'),
  ('Monroe'),
  ('Montesano'),
  ('Montlake'),
  ('Morton'),
  ('Moses Lake'),
  ('Mossyrock'),
  ('Mount Baker'),
  ('Mount Vernon'),
  ('Mountlake Terrace'),
  ('Moxee'),
  ('Mukilteo'),
  ('Naches'),
  ('Napavine'),
  ('Nespelem'),
  ('Newcastle'),
  ('NewHolly'),
  ('Newport'),
  ('Nooksack'),
  ('Normandy Park'),
  ('North Admiral'),
  ('North Beach'),
  ('North Beacon Hill'),
  ('North Bend'),
  ('North Bonneville'),
  ('North Delridge'),
  ('North Queen Anne'),
  ('Northgate'),
  ('Northlake'),
  ('Northport'),
  ('Oak Harbor'),
  ('Oakesdale'),
  ('Oakville'),
  ('Ocean Shores'),
  ('Odessa'),
  ('Okanogan'),
  ('Olympia'),
  ('Olympic Hills'),
  ('Omak'),
  ('Oroville'),
  ('Orting'),
  ('Othello'),
  ('Pacific'),
  ('Palouse'),
  ('Pasco'),
  ('Pateros'),
  ('Pe Ell'),
  ('Phinney Ridge'),
  ('Pigeon Point'),
  ('Pike Place Market'),
  ('Pike-Pine Corridor'),
  ('Pinehurst'),
  ('Pioneer Square'),
  ('Pomeroy'),
  ('Port Angeles'),
  ('Port Orchard'),
  ('Port Townsend'),
  ('Poulsbo'),
  ('Prescott'),
  ('Preston'),
  ('Prosser'),
  ('Pullman'),
  ('Puyallup'),
  ('Queen Anne'),
  ('Quincy'),
  ('Rainier'),
  ('Rainier Beach'),
  ('Rainier Valley'),
  ('Rainier View'),
  ('Ravenna'),
  ('Raymond'),
  ('Reardan'),
  ('Redmond'),
  ('Renton'),
  ('Renton Hill'),
  ('Republic'),
  ('Richland'),
  ('Ridgefield'),
  ('Ritzville'),
  ('Riverside'),
  ('Riverview'),
  ('Roanoke'),
  ('Roanoke Park Historic District'),
  ('Rock Island'),
  ('Rockford'),
  ('Roosevelt'),
  ('Rosalia'),
  ('Roslyn'),
  ('Roxhill'),
  ('Roy'),
  ('Royal City'),
  ('Ruston'),
  ('Sammamish'),
  ('Sand Point'),
  ('SeaTac'),
  ('Seattle'),
  ('Seattle Hebrew Academy'),
  ('Seattle Landmarks'),
  ('Seattle Post-Intelligencer'),
  ('Seattle Public Library'),
  ('Seaview'),
  ('Sedro-Woolley'),
  ('Selah'),
  ('Sequim'),
  ('Seward Park'),
  ('Shelton'),
  ('Shoreline'),
  ('Skykomish'),
  ('SLU'),
  ('Snohomish'),
  ('Snoqualmie'),
  ('Soap Lake'),
  ('SoDo'),
  ('South Beacon Hill'),
  ('South Bend'),
  ('South Cle Elum'),
  ('South Delridge'),
  ('South End'),
  ('South Lake Union'),
  ('South Park'),
  ('South Prairie'),
  ('South Seattle'),
  ('Southeast Magnolia'),
  ('Southeast Seattle'),
  ('Spangle'),
  ('Spokane'),
  ('Spokane Valley'),
  ('Sprague'),
  ('Springdale'),
  ('Squire Park'),
  ('St. John'),
  ('Stanwood'),
  ('Starbuck'),
  ('Steilacoom'),
  ('Stevens'),
  ('Stevenson'),
  ('Street layout of Seattle'),
  ('Sultan'),
  ('Sumas'),
  ('Sumner'),
  ('Sunnyside'),
  ('Sunset Hill'),
  ('Tacoma'),
  ('Tekoa'),
  ('Tenino'),
  ('Tieton'),
  ('Toledo'),
  ('Tonasket'),
  ('Toppenish'),
  ('Tukwila'),
  ('Tumwater'),
  ('Twisp'),
  ('U District'),
  ('Union Gap'),
  ('Uniontown'),
  ('University District'),
  ('University Place'),
  ('University Village'),
  ('Vader'),
  ('Vancouver'),
  ('Vashon'),
  ('Victory Heights'),
  ('View Ridge'),
  ('Waitsburg'),
  ('Walla Walla'),
  ('Wallingford'),
  ('Wapato'),
  ('Warden'),
  ('Washington Park'),
  ('Washougal'),
  ('Washtucna'),
  ('Waterville'),
  ('Waverly'),
  ('Wedgwood'),
  ('Wenatchee'),
  ('West Edge'),
  ('West Queen Anne'),
  ('West Richland'),
  ('West Seattle'),
  ('West Seattle Junction'),
  ('West Woodland'),
  ('Westlake'),
  ('Westlake Seattle'),
  ('Westport'),
  ('White Center'),
  ('White Salmon'),
  ('Whittier Heights'),
  ('Wilbur'),
  ('Wilkeson'),
  ('Wilson Creek'),
  ('Windermere'),
  ('Winlock'),
  ('Winthrop'),
  ('Woodinville'),
  ('Woodland'),
  ('Woodway'),
  ('Yacolt'),
  ('Yakima'),
  ('Yarrow Point'),
  ('Yelm'),
  ('Yesler Terrace'),
  ('Zillah')
ON CONFLICT (label) DO NOTHING;

ALTER TABLE public.neighborhood_canonicals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "neighborhood_canonicals_select_authenticated" ON public.neighborhood_canonicals;
CREATE POLICY "neighborhood_canonicals_select_authenticated"
  ON public.neighborhood_canonicals FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON public.neighborhood_canonicals TO authenticated;
GRANT SELECT ON public.neighborhood_canonicals TO anon;

DROP POLICY IF EXISTS "neighborhood_canonicals_select_anon" ON public.neighborhood_canonicals;
CREATE POLICY "neighborhood_canonicals_select_anon"
  ON public.neighborhood_canonicals FOR SELECT
  TO anon
  USING (true);

-- ---------------------------------------------------------------------------
-- RPC — top contributors for Insights (by cumulative uses on their photos)
-- ---------------------------------------------------------------------------

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
  ORDER BY agg.photo_count DESC, agg.download_uses DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
$$;

REVOKE ALL ON FUNCTION public.get_top_contributors(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_top_contributors(int) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC — admin: top photos by download events since a timestamp
-- ---------------------------------------------------------------------------

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
