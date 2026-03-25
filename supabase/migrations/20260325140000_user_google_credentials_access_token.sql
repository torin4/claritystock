-- Supabase often returns provider_token without provider_refresh_token; store both when present.
-- refresh_ciphertext may be null if only short-lived access is available.

ALTER TABLE public.user_google_credentials
  ALTER COLUMN refresh_ciphertext DROP NOT NULL;

ALTER TABLE public.user_google_credentials
  ADD COLUMN IF NOT EXISTS access_ciphertext text,
  ADD COLUMN IF NOT EXISTS access_stored_at timestamptz;

COMMENT ON COLUMN public.user_google_credentials.access_ciphertext IS
  'Encrypted Google OAuth access_token from last sign-in (~1h lifetime).';

COMMENT ON COLUMN public.user_google_credentials.access_stored_at IS
  'When access_ciphertext was written; app ignores access older than ~50 minutes.';
