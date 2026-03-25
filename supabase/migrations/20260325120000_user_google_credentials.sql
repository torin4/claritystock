-- Encrypted Google OAuth refresh token per user (written in auth callback from exchangeCodeForSession).
-- Lets the server mint access tokens for Google Chat API when Supabase cookies omit provider_token.

CREATE TABLE IF NOT EXISTS public.user_google_credentials (
  user_id            uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  refresh_ciphertext text        NOT NULL,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_google_credentials IS
  'AES-GCM ciphertext of Google OAuth refresh token; only the owning user may read/write (RLS).';

ALTER TABLE public.user_google_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_google_credentials_select_own" ON public.user_google_credentials;
CREATE POLICY "user_google_credentials_select_own"
  ON public.user_google_credentials FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_google_credentials_insert_own" ON public.user_google_credentials;
CREATE POLICY "user_google_credentials_insert_own"
  ON public.user_google_credentials FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_google_credentials_update_own" ON public.user_google_credentials;
CREATE POLICY "user_google_credentials_update_own"
  ON public.user_google_credentials FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_google_credentials_delete_own" ON public.user_google_credentials;
CREATE POLICY "user_google_credentials_delete_own"
  ON public.user_google_credentials FOR DELETE
  USING (auth.uid() = user_id);
