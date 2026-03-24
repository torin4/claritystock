/** Requested on Google sign-in so `session.provider_token` can call Chat REST as the user. */
export const GOOGLE_CHAT_SPACES_READONLY_SCOPE = 'https://www.googleapis.com/auth/chat.spaces.readonly'

export function workspaceChatSearchUrl(email: string) {
  return `https://mail.google.com/chat/u/0/#search/${encodeURIComponent(email)}`
}

/** `name` from findDirectMessage response, e.g. `spaces/abc123`. */
export function chatWebDmUrlFromSpaceName(spaceName: string): string | null {
  if (!spaceName.startsWith('spaces/')) return null
  const id = spaceName.slice('spaces/'.length)
  if (!id) return null
  return `https://chat.google.com/u/0/dm/${encodeURIComponent(id)}`
}
