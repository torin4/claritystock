-- SHA-256 (hex) of original file bytes for exact-duplicate detection across the library
ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS content_hash text;

CREATE INDEX IF NOT EXISTS photos_content_hash_idx
  ON public.photos (content_hash)
  WHERE content_hash IS NOT NULL;
