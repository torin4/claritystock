# Google OAuth + Domain Restriction Skill — Clarity Stock

## Overview
Authentication is Google OAuth only, restricted to `@claritynw.com` Google Workspace accounts. No email/password. No other OAuth providers.

---

## Supabase Dashboard Setup (do once)

1. Go to Supabase Dashboard → Authentication → Providers → Google
2. Enable Google provider
3. Add OAuth credentials:
   - Client ID: from Google Cloud Console
   - Client Secret: from Google Cloud Console
4. Copy the Supabase callback URL → paste into Google Cloud Console as authorized redirect URI
5. In Google Cloud Console → OAuth consent screen:
   - Set to "Internal" if using Google Workspace (restricts to your org automatically)
   - Or set to "External" and add domain restriction in the auth callback

---

## Google Cloud Console Setup

1. Create project or use existing
2. Enable Google+ API and Google Identity API
3. OAuth 2.0 Credentials → Create credentials → OAuth client ID
4. Application type: Web application
5. Authorized redirect URIs: `https://[your-supabase-project].supabase.co/auth/v1/callback`
6. Copy Client ID and Secret to Supabase

---

## Login Page

```tsx
// app/(auth)/login/page.tsx
'use client'

import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  const supabase = createClient()

  async function handleGoogleLogin() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        hd: 'claritynw.com', // Hints Google to show Workspace accounts first
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account',
        },
      },
    })
  }

  const errorMessages: Record<string, string> = {
    unauthorized_domain: 'Access is restricted to @claritynw.com accounts only.',
    auth_failed: 'Authentication failed. Please try again.',
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="font-head text-2xl font-bold text-text tracking-wide mb-1">
            Clarity <span className="text-accent">Stock</span>
          </div>
          <div className="text-text-3 text-sm font-mono">Team Photo Library</div>
        </div>

        {/* Error */}
        {searchParams.error && (
          <div className="bg-red/10 border border-red/30 text-red text-sm rounded-lg px-4 py-3 mb-6">
            {errorMessages[searchParams.error] ?? 'An error occurred.'}
          </div>
        )}

        {/* Login button */}
        <button
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center gap-3 bg-surface border border-border rounded-lg px-4 py-3 text-text text-sm font-medium hover:bg-surface-2 hover:border-border-hi transition-all"
        >
          <svg width="18" height="18" viewBox="0 0 18 18">
            {/* Google SVG icon */}
            <path d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z" fill="#4285F4"/>
            <path d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 01-7.18-2.54H1.83v2.07A8 8 0 008.98 17z" fill="#34A853"/>
            <path d="M4.5 10.52a4.8 4.8 0 010-3.04V5.41H1.83a8 8 0 000 7.18l2.67-2.07z" fill="#FBBC05"/>
            <path d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 001.83 5.4L4.5 7.49a4.77 4.77 0 014.48-3.31z" fill="#EA4335"/>
          </svg>
          Sign in with Google
        </button>

        <p className="text-center text-text-3 text-xs mt-4 font-mono">
          @claritynw.com accounts only
        </p>
      </div>
    </div>
  )
}
```

---

## Auth Callback — Domain Enforcement

```ts
// app/auth/callback/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const ALLOWED_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN ?? 'claritynw.com'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  const supabase = createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  const email = data.user.email ?? ''

  // Enforce domain restriction
  if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?error=unauthorized_domain`)
  }

  // Auto-create user profile on first login
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('id', data.user.id)
    .maybeSingle()

  if (!existingUser) {
    const fullName = data.user.user_metadata?.full_name ?? email.split('@')[0]
    const initials = fullName
      .split(' ')
      .map((n: string) => n[0] ?? '')
      .join('')
      .toUpperCase()
      .slice(0, 2)

    await supabase.from('users').insert({
      id: data.user.id,
      name: fullName,
      initials,
      role: 'photographer',
      avatar_url: data.user.user_metadata?.avatar_url ?? null,
    })
  }

  return NextResponse.redirect(`${origin}/`)
}
```

---

## Sign Out

```ts
// components/layout/Sidebar.tsx (or settings panel)
const supabase = createClient()
await supabase.auth.signOut()
router.push('/login')
```

---

## Getting Current User in Server Components

```ts
// Always use getUser() not getSession() — getUser() validates the JWT server-side
const supabase = createClient()
const { data: { user }, error } = await supabase.auth.getUser()

if (!user) redirect('/login')

// Get full profile
const { data: profile } = await supabase
  .from('users')
  .select('*')
  .eq('id', user.id)
  .single()
```

---

## Rules
- **Always use `getUser()` not `getSession()`** — `getSession()` doesn't validate the JWT, `getUser()` does
- **Domain check happens in the callback route** — never rely on the `hd` OAuth hint alone, it's just a UI hint not a security control
- **Always sign out before redirecting on domain mismatch** — otherwise the Supabase session persists
- **Never store the access token in localStorage** — Supabase SSR handles cookies automatically
- **Admin accounts are created manually** — no self-registration path for admin role
