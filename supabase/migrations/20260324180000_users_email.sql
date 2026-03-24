-- Store Google Workspace email on profile for admin contact links (mailto / Chat search).
-- Synced from OAuth on each login in app/auth/callback.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email text;

COMMENT ON COLUMN public.users.email IS 'Workspace email from Google OAuth; updated on login.';
