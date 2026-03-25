'use client'

import { GOOGLE_CHAT_OAUTH_SCOPES } from '@/lib/admin/googleChatDm'
import {
  OAUTH_SAVE_GOOGLE_CREDENTIALS_COOKIE,
  OAUTH_SAVE_GOOGLE_CREDENTIALS_MAX_AGE_SEC,
} from '@/lib/auth/googleOAuthCookies'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

/**
 * One-time Google OAuth with Chat scopes + vault save (see auth callback).
 * Required for “Google Chat” contact from admin analytics.
 */
export default function ConnectGoogleChatBanner() {
  const connect = async () => {
    const supabase = getSupabaseBrowserClient()
    const queryParams: Record<string, string> = { access_type: 'offline' }
    if (process.env.NEXT_PUBLIC_GOOGLE_OAUTH_PROMPT_CONSENT === '1') {
      queryParams.prompt = 'consent'
    }

    document.cookie = `${OAUTH_SAVE_GOOGLE_CREDENTIALS_COOKIE}=1; Path=/; Max-Age=${OAUTH_SAVE_GOOGLE_CREDENTIALS_MAX_AGE_SEC}; SameSite=Lax`

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: `openid email profile ${GOOGLE_CHAT_OAUTH_SCOPES}`,
        queryParams,
      },
    })
  }

  return (
    <div
      style={{
        margin: '0 20px 16px',
        padding: '12px 14px',
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: 'var(--surface-2)',
        fontSize: 12,
        color: 'var(--text-2)',
        lineHeight: 1.5,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <span>
        <strong style={{ color: 'var(--text)' }}>Google Chat (admins):</strong> connect once so “Google Chat” in Penny
        jar can open DMs. Regular sign-in no longer requests Chat scopes.
      </span>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => void connect()}>
        Connect Google Chat
      </button>
    </div>
  )
}
