/**
 * Exchange a Google OAuth refresh token for a short-lived access token.
 * Use the **same** OAuth client (Client ID + secret) as Supabase → Auth → Google.
 * Enables Chat API when `provider_token` is missing or expired in the session.
 */
export async function googleAccessTokenFromRefreshToken(
  refreshToken: string,
): Promise<string | null> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret || !refreshToken) return null

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) return null
  const json = (await res.json()) as { access_token?: string }
  return json.access_token ?? null
}
