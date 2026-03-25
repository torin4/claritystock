import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { googleAccessTokenFromRefreshToken } from '@/lib/admin/googleAccessToken'
import {
  chatOpenUrlFromSpace,
  workspaceChatSearchUrl,
} from '@/lib/admin/googleChatDm'
import { decryptGoogleRefreshTokenFromStorage } from '@/lib/auth/googleRefreshVault'

/** Google access tokens are ~1h; ignore stored copies older than this. */
const STORED_ACCESS_MAX_AGE_MS = 50 * 60 * 1000
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

/**
 * Prefer short-lived cookie token; otherwise load encrypted refresh from DB and exchange
 * with Google (requires GOOGLE_OAUTH_CLIENT_ID / SECRET).
 */
async function googleAccessTokenForAdmin(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | undefined> {
  await supabase.auth.refreshSession().catch(() => {})
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const cookie = session?.provider_token?.trim()
  if (cookie) return cookie

  const { data: row, error } = await supabase
    .from('user_google_credentials')
    .select('refresh_ciphertext, access_ciphertext, access_stored_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[google-chat-dm] credentials select', error.message)
    }
    return undefined
  }

  const ac = row?.access_ciphertext
  const acAt = row?.access_stored_at
  if (typeof ac === 'string' && ac && typeof acAt === 'string' && acAt) {
    const age = Date.now() - new Date(acAt).getTime()
    if (age >= 0 && age < STORED_ACCESS_MAX_AGE_MS) {
      const tok = decryptGoogleRefreshTokenFromStorage(ac)
      if (tok) return tok
    }
  }

  const ct = row?.refresh_ciphertext
  if (typeof ct !== 'string' || !ct) return undefined

  const refresh = decryptGoogleRefreshTokenFromStorage(ct)
  if (!refresh) return undefined

  const access = await googleAccessTokenFromRefreshToken(refresh)
  return access ?? undefined
}

type GateOk = { ok: true; supabase: SupabaseClient; email: string; userId: string }
type GateErr = { ok: false; response: NextResponse }

async function gateAdminChat(email: string | null): Promise<GateOk | GateErr> {
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
    return {
      ok: false,
      response: NextResponse.redirect(workspaceChatSearchUrl(email)),
    }
  }

  return { ok: true, supabase, email, userId: user.id }
}

export async function GET(request: NextRequest) {
  const email = normalizeEmail(request.nextUrl.searchParams.get('email'))
  const gate = await gateAdminChat(email)
  if (!gate.ok) return gate.response

  const token = await googleAccessTokenForAdmin(gate.supabase, gate.userId)
  const url = await resolveChatUrl(gate.email, token)

  if (process.env.NODE_ENV === 'development') {
    const fb = workspaceChatSearchUrl(gate.email)
    console.error('[google-chat-dm] GET', {
      resolvedToken: Boolean(token),
      usedSearchFallback: url === fb || url.includes('#search'),
    })
  }

  return NextResponse.redirect(url)
}
