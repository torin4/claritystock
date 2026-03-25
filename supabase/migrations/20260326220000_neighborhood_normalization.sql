-- Case + typo normalization for photos.neighborhood (browse filter + consistency).
-- Requires pg_trgm for similarity(). On Supabase: Dashboard → Database → Extensions → pg_trgm (if needed).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public.normalize_neighborhood_case(p_input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_input IS NULL THEN NULL
    WHEN trim(p_input) = '' THEN NULL
    ELSE initcap(lower(trim(p_input)))
  END;
$$;

-- One-time: align existing rows to consistent casing before the trigger runs.
UPDATE public.photos
SET neighborhood = public.normalize_neighborhood_case(neighborhood)
WHERE neighborhood IS NOT NULL;

CREATE OR REPLACE FUNCTION public.photos_normalize_neighborhood()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
  raw text;
  trimmed text;
  best text;
  best_sim real;
BEGIN
  IF NEW.neighborhood IS NULL THEN
    RETURN NEW;
  END IF;

  raw := trim(NEW.neighborhood);
  IF raw = '' THEN
    NEW.neighborhood := NULL;
    RETURN NEW;
  END IF;

  trimmed := initcap(lower(raw));

  -- Reuse an existing spelling if the label matches ignoring case.
  SELECT p.neighborhood INTO best
  FROM public.photos p
  WHERE p.neighborhood IS NOT NULL
    AND trim(p.neighborhood) <> ''
    AND lower(trim(p.neighborhood)) = lower(raw)
  LIMIT 1;

  IF best IS NOT NULL THEN
    NEW.neighborhood := best;
    RETURN NEW;
  END IF;

  -- Merge likely typos into the closest existing label (trigram similarity).
  SELECT p.neighborhood, similarity(lower(trim(p.neighborhood)), lower(raw))
  INTO best, best_sim
  FROM public.photos p
  WHERE p.neighborhood IS NOT NULL
    AND trim(p.neighborhood) <> ''
    AND (TG_OP = 'INSERT' OR p.id IS DISTINCT FROM NEW.id)
  ORDER BY similarity(lower(trim(p.neighborhood)), lower(raw)) DESC
  LIMIT 1;

  IF best IS NOT NULL AND best_sim IS NOT NULL AND best_sim >= 0.45 THEN
    NEW.neighborhood := best;
    RETURN NEW;
  END IF;

  NEW.neighborhood := trimmed;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS photos_normalize_neighborhood_trigger ON public.photos;
CREATE TRIGGER photos_normalize_neighborhood_trigger
  BEFORE INSERT OR UPDATE OF neighborhood ON public.photos
  FOR EACH ROW
  EXECUTE FUNCTION public.photos_normalize_neighborhood();
