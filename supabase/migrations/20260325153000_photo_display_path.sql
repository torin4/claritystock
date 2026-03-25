ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS display_path text;
