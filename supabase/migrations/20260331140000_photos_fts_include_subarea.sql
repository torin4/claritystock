-- Include sub-area (free-text complement to canonical neighborhood) in library/browse FTS.
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

-- Rebuild fts for existing rows (trigger runs on UPDATE).
UPDATE public.photos SET title = title;
