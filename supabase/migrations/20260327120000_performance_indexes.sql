-- Performance indexes for frequently-queried columns.
-- Nearly all hot query paths were doing sequential scans on these columns.

-- photos: photographer filter + recency sort (my-photos, sidebar recents, admin impact)
CREATE INDEX IF NOT EXISTS photos_photographer_created_idx
  ON public.photos (photographer_id, created_at DESC);

-- photos: category filter (browse)
CREATE INDEX IF NOT EXISTS photos_category_idx
  ON public.photos (category)
  WHERE category IS NOT NULL;

-- photos: neighborhood filter (browse)
CREATE INDEX IF NOT EXISTS photos_neighborhood_idx
  ON public.photos (neighborhood)
  WHERE neighborhood IS NOT NULL;

-- photos: collection filter (browse, collection view)
CREATE INDEX IF NOT EXISTS photos_collection_idx
  ON public.photos (collection_id)
  WHERE collection_id IS NOT NULL;

-- downloads: photo_id lookup (used everywhere — favorites, insights, browse)
CREATE INDEX IF NOT EXISTS downloads_photo_id_idx
  ON public.downloads (photo_id);

-- downloads: who downloaded (insights, admin)
CREATE INDEX IF NOT EXISTS downloads_downloaded_by_idx
  ON public.downloads (downloaded_by, created_at DESC);

-- downloads: time-range queries (admin this-month analytics, insights)
CREATE INDEX IF NOT EXISTS downloads_created_at_idx
  ON public.downloads (created_at DESC);

-- downloads: soft-archive filter (browse excludes archived downloads)
CREATE INDEX IF NOT EXISTS downloads_archived_at_idx
  ON public.downloads (archived_at)
  WHERE archived_at IS NULL;

-- favorites: user's favorites list + photo lookup
CREATE INDEX IF NOT EXISTS favorites_user_id_idx
  ON public.favorites (user_id);

CREATE INDEX IF NOT EXISTS favorites_photo_id_idx
  ON public.favorites (photo_id);

-- collections: creator filter + recency sort (sidebar, my collections)
CREATE INDEX IF NOT EXISTS collections_created_by_created_idx
  ON public.collections (created_by, created_at DESC);
