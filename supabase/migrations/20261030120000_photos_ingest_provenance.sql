-- =============================================================================
-- Ingest provenance on photos (server-to-server ingest, e.g. AutoFocus 2).
--   source_app     which app sent the photo ('af2'); NULL for in-app uploads
--   source_ref     the sender's idempotency key (e.g. 'photo:<id>')
--   consent_text   the consent wording the photographer agreed to
--   consented_at   when they agreed
-- A unique partial index on (source_app, source_ref) makes a double send of the
-- same source photo collapse onto one row. A trigger keeps provenance and
-- consent admin-only once written.
-- Apply before the AF2 integration is switched on. Safe to re-run.
-- =============================================================================

ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS source_app text,
  ADD COLUMN IF NOT EXISTS source_ref text,
  ADD COLUMN IF NOT EXISTS consent_text text,
  ADD COLUMN IF NOT EXISTS consented_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS photos_source_app_source_ref_key
  ON public.photos (source_app, source_ref)
  WHERE source_ref IS NOT NULL;

-- Consent and provenance are fixed once written: only an admin may change them.
-- RLS lets an owner update their own photo row with no column scoping, so guard
-- the columns with a trigger (same pattern as users_guard_role). Inserts are not
-- affected; the ingest route only ever inserts these columns.
CREATE OR REPLACE FUNCTION public.prevent_photo_provenance_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (
    NEW.source_app IS DISTINCT FROM OLD.source_app
    OR NEW.source_ref IS DISTINCT FROM OLD.source_ref
    OR NEW.consent_text IS DISTINCT FROM OLD.consent_text
    OR NEW.consented_at IS DISTINCT FROM OLD.consented_at
  ) AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins may change photo provenance or consent' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS photos_guard_provenance ON public.photos;
CREATE TRIGGER photos_guard_provenance
  BEFORE UPDATE ON public.photos
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_photo_provenance_edit();
