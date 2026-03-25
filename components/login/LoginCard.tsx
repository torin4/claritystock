'use client'
import { GOOGLE_CHAT_OAUTH_SCOPES } from '@/lib/admin/googleChatDm'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import BrandTitle from '@/components/layout/BrandTitle'

export default function LoginCard() {
  const supabase = getSupabaseBrowserClient()

  const handleGoogleSignIn = async () => {
    /**
     * Google only returns a refresh token when `access_type=offline` is set.
     * Without it, `provider_refresh_token` stays null and server-side Chat API can’t mint tokens.
     * If still null after sign-in, set NEXT_PUBLIC_GOOGLE_OAUTH_PROMPT_CONSENT=1 once, sign out/in,
     * then unset (forces consent so Google re-issues a refresh token).
     */
    const queryParams: Record<string, string> = {
      access_type: 'offline',
    }
    if (process.env.NEXT_PUBLIC_GOOGLE_OAUTH_PROMPT_CONSENT === '1') {
      queryParams.prompt = 'consent'
    }

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
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: '12px',
      padding: '44px 40px 40px',
      width: 'min(100%, 400px)',
      maxWidth: '400px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '24px',
    }}>
      {/* Logo + wordmark (stacked) */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <BrandTitle layout="stack" priority />
        <div style={{
          fontSize: '13px',
          color: 'var(--label-library)',
          fontFamily: 'var(--font-mono)',
        }}>
          Internal photo library
        </div>
      </div>

      {/* Divider */}
      <div style={{ width: '100%', height: '1px', background: 'var(--border)' }} />

      {/* Sign in section */}
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ fontSize: '13px', color: 'var(--text-2)', textAlign: 'center' }}>
          Sign in with your Clarity Northwest account
        </div>
        <button
          onClick={handleGoogleSignIn}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            padding: '10px 16px',
            background: 'var(--surface-2)',
            border: '1px solid var(--border-hi)',
            borderRadius: '8px',
            color: 'var(--text)',
            fontFamily: 'var(--font-body)',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-hi)')}
        >
          {/* Google icon */}
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>
      </div>

      <div style={{ fontSize: '11px', color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.5 }}>
        Access restricted to<br />
        <span style={{ color: 'var(--text-2)' }}>@claritynw.com</span> accounts only
      </div>
    </div>
  )
}
