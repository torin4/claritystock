-- When the last photo leaves a collection (delete or collection_id change), remove the collection row.
-- Runs as SECURITY DEFINER so RLS does not block the cleanup delete.

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

COMMENT ON FUNCTION public.purge_empty_collection_after_photo_change() IS
  'Deletes a collection when no photos reference it after a photo delete or collection_id change.';
