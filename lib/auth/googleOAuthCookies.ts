/**
 * Set by the client immediately before Google OAuth when we need to persist
 * provider tokens to `user_google_credentials` (Chat). Normal login skips vault writes.
 */
export const OAUTH_SAVE_GOOGLE_CREDENTIALS_COOKIE = 'clarity_oauth_save_google'

export const OAUTH_SAVE_GOOGLE_CREDENTIALS_MAX_AGE_SEC = 600
