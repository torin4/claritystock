import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { OAUTH_SAVE_GOOGLE_CREDENTIALS_COOKIE } from '@/lib/auth/googleOAuthCookies'
import { saveGoogleCredentialsFromSession } from '@/lib/auth/saveGoogleCredentialsVault'
import { getInitials } from '@/lib/utils/initials'
import { getSupabaseAnonKey, getSupabaseUrl } from '@/lib/supabase/env'

const ALLOWED_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN ?? 'claritynw.com'

function clearOauthIntentCookie(res: NextResponse) {
  res.cookies.set(OAUTH_SAVE_GOOGLE_CREDENTIALS_COOKIE, '', {
    path: '/',
    maxAge: 0,
    sameSite: 'lax',
  })
  return res
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return clearOauthIntentCookie(NextResponse.redirect(`${origin}/error?reason=no_code`))
  }

  /**
   * Session cookies must be written onto the same NextResponse we return.
   * Using `cookies()` from next/headers here often does not attach Set-Cookie to a
   * redirect, which causes an infinite /login loop after OAuth on localhost and prod.
   */
  let response = NextResponse.redirect(`${origin}/`)

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options as never),
        )
      },
    },
  })

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    return clearOauthIntentCookie(NextResponse.redirect(`${origin}/error?reason=auth`))
  }

  const identityEmail = (
    data.user.identities?.find(i => i.provider === 'google')?.identity_data as { email?: string } | undefined
  )?.email
  const email = (data.user.email ?? identityEmail ?? '').trim()
  if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
    const errRes = NextResponse.redirect(`${origin}/error?reason=domain`)
    const supabaseSignOut = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            errRes.cookies.set(name, value, options as never),
          )
        },
      },
    })
    await supabaseSignOut.auth.signOut()
    return clearOauthIntentCookie(errRes)
  }

  const fullName = data.user.user_metadata?.full_name ?? email.split('@')[0]
  const meta = data.user.user_metadata as { avatar_url?: string; picture?: string } | undefined
  const googleIdentity = data.user.identities?.find((i) => i.provider === 'google')?.identity_data as
    | { avatar_url?: string; picture?: string }
    | undefined
  const avatarUrl =
    (typeof meta?.avatar_url === 'string' && meta.avatar_url) ||
    (typeof meta?.picture === 'string' && meta.picture) ||
    (typeof googleIdentity?.picture === 'string' && googleIdentity.picture) ||
    (typeof googleIdentity?.avatar_url === 'string' && googleIdentity.avatar_url) ||
    null

  await supabase.from('users').upsert(
    {
      id: data.user.id,
      name: fullName,
      initials: getInitials(fullName),
      avatar_url: avatarUrl,
      email: email.toLowerCase(),
    },
    { onConflict: 'id', ignoreDuplicates: false },
  )

  const saveGoogleVault =
    request.cookies.get(OAUTH_SAVE_GOOGLE_CREDENTIALS_COOKIE)?.value === '1'
  if (saveGoogleVault) {
    await saveGoogleCredentialsFromSession(data.user.id, data.session)
  }

  clearOauthIntentCookie(response)

  return response
}
