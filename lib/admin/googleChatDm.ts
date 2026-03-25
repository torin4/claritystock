/**
 * Penny jar “Google Chat” opens this workspace URL in a new tab (no per-user DM API).
 * Set `NEXT_PUBLIC_GOOGLE_WORKSPACE_CHAT_URL` if your team uses a different Chat entry point.
 */
export const GOOGLE_WORKSPACE_CHAT_URL =
  process.env.NEXT_PUBLIC_GOOGLE_WORKSPACE_CHAT_URL ?? 'https://mail.google.com/chat/u/0/'
