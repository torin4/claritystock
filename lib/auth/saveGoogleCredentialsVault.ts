import type { Session } from '@supabase/supabase-js'
import { encryptGoogleRefreshTokenForStorage } from '@/lib/auth/googleRefreshVault'
import { createServiceClient } from '@/lib/supabase/service'
import { devError, devWarn } from '@/lib/utils/devLog'

/**
 * Persist Google tokens from the OAuth exchange using the service role so RLS / same-request
 * cookie timing cannot block the write. Merges with any existing row for this user.
 */
export async function saveGoogleCredentialsFromSession(userId: string, session: Session | null): Promise<void> {
  if (!session) return

  const googleRt = session.provider_refresh_token ?? null
  const googleAt = session.provider_token ?? null

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    devError('[saveGoogleCredentialsVault] SUPABASE_SERVICE_ROLE_KEY is not set')
    return
  }
  const svc = createServiceClient()

  const newRefreshEnc = googleRt ? encryptGoogleRefreshTokenForStorage(googleRt) : null
  const newAccessEnc = googleAt ? encryptGoogleRefreshTokenForStorage(googleAt) : null

  if (googleRt && !newRefreshEnc) {
    devWarn(
      '[saveGoogleCredentialsVault] provider_refresh_token present but encryption failed — set GOOGLE_REFRESH_TOKEN_ENCRYPTION_KEY (openssl rand -base64 32)',
    )
  }
  if (googleAt && !newAccessEnc) {
    devWarn('[saveGoogleCredentialsVault] provider_token present but encryption failed')
  }

  if (!newRefreshEnc && !newAccessEnc) {
    devWarn(
      '[saveGoogleCredentialsVault] No storable Google tokens on session (missing provider_token and provider_refresh_token).',
    )
    return
  }

  const { data: prev, error: selErr } = await svc
    .from('user_google_credentials')
    .select('refresh_ciphertext, access_ciphertext, access_stored_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (selErr) {
    devError('[saveGoogleCredentialsVault] select', selErr)
    return
  }

  const refresh_ciphertext = newRefreshEnc ?? prev?.refresh_ciphertext ?? null
  let access_ciphertext = newAccessEnc ?? prev?.access_ciphertext ?? null
  let access_stored_at = prev?.access_stored_at ?? null
  if (newAccessEnc) {
    access_ciphertext = newAccessEnc
    access_stored_at = new Date().toISOString()
  }

  if (!refresh_ciphertext && !access_ciphertext) return

  const { error: upErr } = await svc.from('user_google_credentials').upsert(
    {
      user_id: userId,
      refresh_ciphertext,
      access_ciphertext,
      access_stored_at,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )

  if (upErr) devError('[saveGoogleCredentialsVault] upsert', upErr)
}
