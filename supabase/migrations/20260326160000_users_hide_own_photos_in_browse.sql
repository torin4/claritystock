-- Browse preference: hide own uploads from main Library grid (My Photos unaffected).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS hide_own_photos_in_browse boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.hide_own_photos_in_browse IS
  'When true, Library browse queries exclude rows where photographer_id = this user.';
