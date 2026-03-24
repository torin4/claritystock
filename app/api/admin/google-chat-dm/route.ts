import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { googleAccessTokenFromRefreshToken } from '@/lib/admin/googleAccessToken'
import {
  chatOpenUrlFromSpace,
  workspaceChatSearchUrl,
} from '@/lib/admin/googleChatDm'
import { isUserAdmin } from '@/lib/auth/admin'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN ?? 'claritynw.com'

const FIND_DM = 'https://chat.googleapis.com/v1/spaces:findDirectMessage'
const SETUP_SPACE = 'https://chat.googleapis.com/v1/spaces:setup'

function normalizeEmail(raw: string | null): string | null {
  if (!raw) return null
  const e = raw.trim().toLowerCase()
  if (!e.includes('@')) return null
  return e
}

async function setupDirectMessage(token: string, peerEmail: string): Promise<Response> {
  return fetch(SETUP_SPACE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      space: {
        spaceType: 'DIRECT_MESSAGE',
        singleUserBotDm: false,
      },
      requestId: crypto.randomUUID(),
      memberships: [
        {
          member: {
            name: `users/${peerEmail}`,
            type: 'HUMAN',
          },
        },
      ],
    }),
    next: { revalidate: 0 },
  })
}

async function findDirectMessage(token: string, peerEmail: string): Promise<Response> {
  const params = new URLSearchParams()
  params.set('name', `users/${peerEmail}`)
  return fetch(`${FIND_DM}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    next: { revalidate: 0 },
  })
}

/**
 * Google Chat user token is often present in the browser session but omitted from
 * server cookie serialization — prefer `Authorization: Bearer` from the client POST.
 */
async function resolveChatUrl(email: string, token: string | undefined): Promise<string> {
  const fallback = workspaceChatSearchUrl(email)
  if (!token) return fallback

  let setupRes: Response
  try {
    setupRes = await setupDirectMessage(token, email)
  } catch {
    return fallback
  }

  if (setupRes.ok) {
    try {
      const space = await setupRes.json()
      const open =
        space && typeof space === 'object'
          ? chatOpenUrlFromSpace(space as Record<string, unknown>)
          : null
      return open ?? fallback
    } catch {
      return fallback
    }
  }

  let findRes: Response
  try {
    findRes = await findDirectMessage(token, email)
  } catch {
    return fallback
  }

  if (findRes.ok) {
    try {
      const space = await findRes.json()
      const open =
        space && typeof space === 'object'
          ? chatOpenUrlFromSpace(space as Record<string, unknown>)
          : null
      return open ?? fallback
    } catch {
      return fallback
    }
  }

  if (process.env.NODE_ENV === 'development') {
    const peek = await findRes.clone().text().catch(() => '')
    console.error('[google-chat-dm] Chat API failed', {
      setupStatus: setupRes.status,
      findStatus: findRes.status,
      findBodyPreview: peek.slice(0, 200),
    })
  }

  return fallback
}

async function resolveGoogleAccessToken(input: {
  bearer?: string
  cookieProviderToken?: string | null
  bodyRefreshToken?: string | null
}): Promise<string | undefined> {
  const b = input.bearer?.trim()
  if (b) return b
  const c = input.cookieProviderToken?.trim()
  if (c) return c
  const rt = input.bodyRefreshToken?.trim()
  if (rt) {
    const at = await googleAccessTokenFromRefreshToken(rt)
    if (at) return at
  }
  return undefined
}

type GateOk = { ok: true; supabase: SupabaseClient; email: string }
type GateErr = { ok: false; response: NextResponse }

async function gateAdminChat(
  email: string | null,
  selfAs: 'redirect' | 'json',
): Promise<GateOk | GateErr> {
  if (!email || !email.endsWith(`@${ALLOWED_DOMAIN}`)) {
    return { ok: false, response: NextResponse.json({ error: 'Invalid email' }, { status: 400 }) }
  }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !(await isUserAdmin(supabase, user.id))) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  const adminEmail = (user.email ?? '').trim().toLowerCase()
  if (adminEmail && adminEmail === email) {
    const u = workspaceChatSearchUrl(email)
    if (selfAs === 'redirect') {
      return { ok: false, response: NextResponse.redirect(u) }
    }
    return { ok: false, response: NextResponse.json({ url: u }) }
  }

  return { ok: true, supabase, email }
}

export async function GET(request: NextRequest) {
  const email = normalizeEmail(request.nextUrl.searchParams.get('email'))
  const gate = await gateAdminChat(email, 'redirect')
  if (!gate.ok) return gate.response

  await gate.supabase.auth.refreshSession().catch(() => {})
  const {
    data: { session },
  } = await gate.supabase.auth.getSession()
  const url = await resolveChatUrl(gate.email, session?.provider_token ?? undefined)
  return NextResponse.redirect(url)
}

export async function POST(request: NextRequest) {
  let body: { email?: string; providerRefreshToken?: string | null }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const email = normalizeEmail(body.email ?? null)
  const gate = await gateAdminChat(email, 'json')
  if (!gate.ok) return gate.response

  const authHeader = request.headers.get('authorization')
  const bearer =
    authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined

  await gate.supabase.auth.refreshSession().catch(() => {})
  const {
    data: { session },
  } = await gate.supabase.auth.getSession()

  const token = await resolveGoogleAccessToken({
    bearer,
    cookieProviderToken: session?.provider_token,
    bodyRefreshToken: body.providerRefreshToken,
  })

  const url = await resolveChatUrl(gate.email, token)
  const searchFallback = workspaceChatSearchUrl(gate.email)

  if (process.env.NODE_ENV === 'development') {
    console.error('[google-chat-dm] POST', {
      hadBearer: Boolean(bearer),
      hadCookieProviderToken: Boolean(session?.provider_token),
      hadBodyRefreshToken: Boolean(body.providerRefreshToken?.trim()),
      hasGoogleClientEnv: Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()),
      resolvedToken: Boolean(token),
      usedSearchUrl: url === searchFallback || url.includes('#search'),
    })
  }

  return NextResponse.json({
    url,
    usedSearchFallback: url === searchFallback || url.includes('#search'),
  })
}
