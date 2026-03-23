import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { getInitials } from '@/lib/utils/initials'

const ALLOWED_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN ?? 'claritynw.com'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(`${origin}/error?reason=no_code`)
  }

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/error?reason=auth`)
  }

  const email = data.user.email ?? ''
  if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/error?reason=domain`)
  }

  // Upsert user profile on first login
  const fullName = data.user.user_metadata?.full_name ?? email.split('@')[0]
  const avatarUrl = data.user.user_metadata?.avatar_url ?? null

  await supabase.from('users').upsert(
    {
      id: data.user.id,
      name: fullName,
      initials: getInitials(fullName),
      avatar_url: avatarUrl,
      // role defaults to 'photographer' via DB default — don't override on upsert
    },
    { onConflict: 'id', ignoreDuplicates: false }
  )

  return NextResponse.redirect(`${origin}/`)
}
