-- =============================================================================
-- Ingest provenance on photos (server-to-server ingest, e.g. AutoFocus 2).
--   source_app     which app sent the photo ('af2'); NULL for in-app uploads
--   source_ref     the sender's idempotency key (e.g. 'photo:<id>')
--   sent_by_email  the sender's workspace email as sent
--   consent_text   the consent wording the photographer agreed to
--   consented_at   when they agreed
-- A unique partial index on (source_app, source_ref) makes a double send of the
-- same source photo collapse onto one row.
-- Apply before the AF2 integration is switched on. Safe to re-run.
-- =============================================================================

ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS source_app text,
  ADD COLUMN IF NOT EXISTS source_ref text,
  ADD COLUMN IF NOT EXISTS sent_by_email text,
  ADD COLUMN IF NOT EXISTS consent_text text,
  ADD COLUMN IF NOT EXISTS consented_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS photos_source_app_source_ref_key
  ON public.photos (source_app, source_ref)
  WHERE source_ref IS NOT NULL;
