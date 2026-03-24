-- Copy emails from auth.users into public.users so admin mailto / Google Chat links work
-- without requiring everyone to sign in again after adding public.users.email.
-- Google OAuth always stores the Workspace address on auth.users.

UPDATE public.users u
SET email = lower(btrim(au.email))
FROM auth.users au
WHERE u.id = au.id
  AND au.email IS NOT NULL
  AND btrim(au.email) <> '';
