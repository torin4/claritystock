import { NextRequest, NextResponse } from 'next/server'
import {
  chatWebDmUrlFromSpaceName,
  workspaceChatSearchUrl,
} from '@/lib/admin/googleChatDm'
import { isUserAdmin } from '@/lib/auth/admin'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN ?? 'claritynw.com'

function normalizeEmail(raw: string | null): string | null {
  if (!raw) return null
  const e = raw.trim().toLowerCase()
  if (!e.includes('@')) return null
  return e
}

export async function GET(request: NextRequest) {
  const email = normalizeEmail(request.nextUrl.searchParams.get('email'))
  if (!email || !email.endsWith(`@${ALLOWED_DOMAIN}`)) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
  }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !(await isUserAdmin(supabase, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const fallback = workspaceChatSearchUrl(email)

  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.provider_token
  if (!token) {
    return NextResponse.redirect(fallback)
  }

  const params = new URLSearchParams()
  params.set('name', `users/${email}`)
  const url = `https://chat.googleapis.com/v1/spaces:findDirectMessage?${params.toString()}`

  let res: Response
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 0 },
    })
  } catch {
    return NextResponse.redirect(fallback)
  }

  if (!res.ok) {
    return NextResponse.redirect(fallback)
  }

  const body = (await res.json()) as { name?: string }
  const dmUrl = body.name ? chatWebDmUrlFromSpaceName(body.name) : null
  return NextResponse.redirect(dmUrl ?? fallback)
}
