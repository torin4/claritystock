import { NextResponse, type NextRequest } from 'next/server'
import { AI_TAG_DEBUG, INCLUDE_CATEGORY_REFS, tagImage } from '@/lib/ai/tagImage'
import { createClient } from '@/lib/supabase/server'

/** Reject huge JSON before parsing (Content-Length is advisory; we also check decoded size). */
const MAX_CONTENT_LENGTH = Math.ceil(6.5 * 1024 * 1024)
const MAX_IMAGE_DECODED_BYTES = 5 * 1024 * 1024
const ALLOWED_UPLOAD_MIME = new Map<string, string>([
  ['image/jpeg', 'image/jpeg'],
  ['image/jpg', 'image/jpeg'],
  ['image/pjpeg', 'image/jpeg'],
  ['image/png', 'image/png'],
  ['image/x-png', 'image/png'],
  ['image/webp', 'image/webp'],
])

const TAG_RATE_WINDOW_MS = 60_000
const TAG_RATE_MAX_PER_WINDOW = 24
const tagRateByUser = new Map<string, { count: number; windowStart: number }>()

function tagRateAllow(userId: string): boolean {
  const now = Date.now()
  const row = tagRateByUser.get(userId)
  if (!row || now - row.windowStart >= TAG_RATE_WINDOW_MS) {
    tagRateByUser.set(userId, { count: 1, windowStart: now })
    return true
  }
  if (row.count >= TAG_RATE_MAX_PER_WINDOW) return false
  row.count += 1
  return true
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!tagRateAllow(user.id)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const cl = request.headers.get('content-length')
  if (cl && /^\d+$/.test(cl) && parseInt(cl, 10) > MAX_CONTENT_LENGTH) {
    return NextResponse.json({ error: 'Request body too large' }, { status: 413 })
  }

  const key = process.env.GEMINI_API_KEY?.trim()
  if (!key) {
    return NextResponse.json({ error: 'GEMINI_API_KEY is not set' }, { status: 503 })
  }

  let body: { imageBase64?: string; mimeType?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const rawB64 = body.imageBase64
  const mimeNorm = body.mimeType?.trim().toLowerCase() ?? ''
  const mimeType = ALLOWED_UPLOAD_MIME.get(mimeNorm)
  if (!rawB64 || !mimeType) {
    return NextResponse.json(
      { error: 'Missing imageBase64 or mimeType, or mimeType is not allowed (jpeg, png, webp)' },
      { status: 400 },
    )
  }

  const imageBase64 = rawB64.replace(/\s/g, '')
  const decoded = Buffer.from(imageBase64, 'base64')
  if (!decoded.length || decoded.length > MAX_IMAGE_DECODED_BYTES) {
    return NextResponse.json({ error: 'Image too large or invalid base64' }, { status: 413 })
  }

  const result = await tagImage(key, mimeType, imageBase64)

  if (result.ok) {
    if (!AI_TAG_DEBUG) return NextResponse.json(result.payload)
    return NextResponse.json({
      ...result.payload,
      debug: {
        usedFallback: false,
        includeCategoryRefs: INCLUDE_CATEGORY_REFS,
        model: result.model,
        mode: result.mode,
        attempts: result.attempts,
      },
    })
  }

  const fallback = result.payload
  if (!AI_TAG_DEBUG) return NextResponse.json(fallback)
  return NextResponse.json({
    ...fallback,
    debug: {
      usedFallback: true,
      includeCategoryRefs: INCLUDE_CATEGORY_REFS,
      lastError: result.lastError,
      attempts: result.attempts,
      hint:
        'Check GEMINI_API_KEY and GEMINI_VISION_MODEL compatibility; review Vercel function logs for full error. Enable/disable AI_TAG_INCLUDE_CATEGORY_REFS as needed.',
    },
  })
}
