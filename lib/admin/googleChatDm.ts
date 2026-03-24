/**
 * Requested on Google sign-in so `session.provider_token` can call Chat REST as the user.
 * - readonly: findDirectMessage
 * - create: spaces:setup when no DM exists yet
 */
export const GOOGLE_CHAT_OAUTH_SCOPES =
  'https://www.googleapis.com/auth/chat.spaces.readonly https://www.googleapis.com/auth/chat.spaces.create'

export function workspaceChatSearchUrl(email: string) {
  return `https://mail.google.com/chat/u/0/#search/${encodeURIComponent(email)}`
}

function pickSpaceId(space: Record<string, unknown>): string | null {
  const n = space.name
  if (typeof n !== 'string' || !n.startsWith('spaces/')) return null
  const id = n.slice('spaces/'.length)
  return id || null
}

/**
 * Prefer API `spaceUri` (authoritative). Otherwise build URLs that match Gmail’s Chat surface
 * (`mail.google.com/chat/...`) and classic mail hash links.
 */
export function chatOpenUrlFromSpace(space: Record<string, unknown>): string | null {
  const uri =
    (typeof space.spaceUri === 'string' && space.spaceUri) ||
    (typeof space.space_uri === 'string' && space.space_uri) ||
    null
  if (uri) return uri

  const id = pickSpaceId(space)
  if (!id) return null
  const enc = encodeURIComponent(id)

  // Documented DM pattern (space id from API, not email). Gmail may embed Chat; this opens the thread.
  return `https://chat.google.com/u/0/dm/${enc}`
}
