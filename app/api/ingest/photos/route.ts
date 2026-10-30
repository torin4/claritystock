import { createHash, randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { NextResponse, type NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fallbackTagPayload, tagImage, type TagPayload } from '@/lib/ai/tagImage'
import { createServerDerivatives, detectImageMime } from '@/lib/ingest/derivatives'
import { fetchIngestImage } from '@/lib/ingest/fetchImage'
import { isAllowedImageUrl, parseIngestImageHosts } from '@/lib/ingest/imageHosts'
import { ingestSecretFor, verifyIngestSignature } from '@/lib/ingest/signature'
import { validateIngestBody, type IngestPhotoBody } from '@/lib/ingest/validateBody'
import { resolveNeighborhoodToCanonical } from '@/lib/neighborhoods/canonical'
import { createServiceClient } from '@/lib/supabase/service'
import { devError, devWarn } from '@/lib/utils/devLog'

/**
 * Server-to-server photo ingest (contract v1, see README "Ingest API").
 * Not session-guarded: the per-source HMAC is the only auth. One photo per call.
 * Never log the secret, the signature, or `image_url` (a presigned credential).
 */

export const runtime = 'nodejs'
/** Download (up to 50 MB) + three sharp derivatives + Gemini fallback chain. */
export const maxDuration = 300

const MAX_BODY_BYTES = 64 * 1024
const ALLOWED_DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN ?? 'claritynw.com').trim().toLowerCase()

const ORIGINAL_EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/tiff': 'tif',
}

type ExistingPhoto = { id: string }

function photoUrl(request: NextRequest, photoId: string): string {
  return new URL(`/browse?photo=${encodeURIComponent(photoId)}`, request.nextUrl.origin).toString()
}

function exists(request: NextRequest, photoId: string) {
  return NextResponse.json({ status: 'exists', photo_id: photoId, url: photoUrl(request, photoId) })
}

function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1).toLowerCase()
}

/** Escape LIKE wildcards so `ilike` acts as a case-insensitive equality. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`)
}

function storageStem(): string {
  return `${Date.now()}-${randomBytes(6).toString('hex')}`
}

/** Original keeps its filename extension when it is a plain short token, as uploadPhoto does. */
function originalExt(filename: string, mime: string): string {
  const fromName = filename.includes('.') ? filename.split('.').pop()?.toLowerCase() : undefined
  return fromName && /^[a-z0-9]{1,5}$/.test(fromName) ? fromName : ORIGINAL_EXT_BY_MIME[mime]
}

async function findBySourceRef(
  supabase: SupabaseClient,
  sourceApp: string,
  sourceRef: string,
): Promise<ExistingPhoto | null> {
  const { data, error } = await supabase
    .from('photos')
    .select('id')
    .eq('source_app', sourceApp)
    .eq('source_ref', sourceRef)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

async function findByContentHash(supabase: SupabaseClient, hash: string): Promise<ExistingPhoto | null> {
  const { data, error } = await supabase
    .from('photos')
    .select('id')
    .eq('content_hash', hash)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

/** Matches `public.users.email` case-insensitively, restricted to ALLOWED_EMAIL_DOMAIN. */
async function resolvePhotographerId(supabase: SupabaseClient, email: string): Promise<string | null> {
  if (emailDomain(email) !== ALLOWED_DOMAIN) return null
  const { data, error } = await supabase
    .from('users')
    .select('id, email')
    .ilike('email', escapeLike(email))
    .limit(2)
  if (error) throw error
  const rows = (data ?? []).filter(
    (r: { email: string | null }) =>
      r.email?.toLowerCase() === email.toLowerCase() && emailDomain(r.email) === ALLOWED_DOMAIN,
  )
  if (rows.length !== 1) {
    if (rows.length > 1) devWarn('[api/ingest/photos] multiple users share one email; refusing to pick')
    return null
  }
  return rows[0].id as string
}

/** Same canonicalisation publishPhoto applies (lib/actions/photos.actions.ts). */
async function resolveNeighborhood(supabase: SupabaseClient, input: string | null): Promise<string | null> {
  if (!input) return null
  const { data, error } = await supabase.from('neighborhood_canonicals').select('label')
  if (error) {
    devWarn('[api/ingest/photos] neighborhood_canonicals unavailable; using raw neighborhood value', error.message)
    return input
  }
  const labels = (data ?? []).map((r: { label: string }) => r.label)
  return resolveNeighborhoodToCanonical(input, labels) ?? input
}

async function tagForIngest(aiTagJpeg: Buffer): Promise<TagPayload> {
  const key = process.env.GEMINI_API_KEY?.trim()
  if (!key) {
    devWarn('[api/ingest/photos] GEMINI_API_KEY is not set; using fallback tags')
    const { title, tags, category, description } = fallbackTagPayload()
    return { title, tags, category, description }
  }
  const result = await tagImage(key, 'image/jpeg', aiTagJpeg.toString('base64'))
  const { title, tags, category, description } = result.payload
  return { title, tags, category, description }
}

async function removeUploaded(supabase: SupabaseClient, paths: string[]) {
  if (!paths.length) return
  const { error } = await supabase.storage.from('photos').remove(paths)
  if (error) devWarn('[api/ingest/photos] cleanup of uploaded objects failed', error.message)
}

export async function POST(request: NextRequest) {
  // 1. HMAC over the raw body, before any parsing.
  const cl = request.headers.get('content-length')
  if (cl && /^\d+$/.test(cl) && parseInt(cl, 10) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'body_too_large', field: 'body' }, { status: 422 })
  }
  const rawBody = await request.text()
  if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'body_too_large', field: 'body' }, { status: 422 })
  }

  const source = request.headers.get('x-stock-source')?.trim() ?? null
  const check = verifyIngestSignature({
    secret: ingestSecretFor(source),
    timestamp: request.headers.get('x-stock-timestamp')?.trim() ?? null,
    signature: request.headers.get('x-stock-signature')?.trim() ?? null,
    rawBody,
  })
  if (check !== 'ok') return NextResponse.json({ error: check }, { status: 401 })

  let json: unknown
  try {
    json = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'invalid_json', field: 'body' }, { status: 422 })
  }
  const parsed = validateIngestBody(json)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error, field: parsed.field }, { status: 422 })
  }
  const body: IngestPhotoBody = parsed.value
  if (body.source_app !== source) {
    return NextResponse.json({ error: 'source_mismatch', field: 'source_app' }, { status: 422 })
  }
  if (!isAllowedImageUrl(body.image_url, parseIngestImageHosts(process.env.INGEST_IMAGE_HOSTS))) {
    return NextResponse.json({ error: 'image_host_not_allowed', field: 'image_url' }, { status: 422 })
  }

  const supabase = createServiceClient()
  const uploaded: string[] = []
  try {
    // 2. Idempotency on the sender's key: no download on a resend.
    const prior = await findBySourceRef(supabase, body.source_app, body.source_ref)
    if (prior) return exists(request, prior.id)

    // 3. The sender must be a Clarity Stock user on the workspace domain.
    const photographerId = await resolvePhotographerId(supabase, body.photographer_email)
    if (!photographerId) {
      return NextResponse.json({ error: 'photographer_not_found' }, { status: 404 })
    }

    // 4. Download, verify real format, de-duplicate on content hash.
    const fetched = await fetchIngestImage(body.image_url)
    if (!fetched.ok) {
      if (fetched.kind === 'too_large') {
        return NextResponse.json({ error: 'image_too_large', field: 'image_url' }, { status: 422 })
      }
      if (fetched.kind === 'unsupported_type') {
        return NextResponse.json({ error: 'unsupported_image_type', field: 'image_url' }, { status: 422 })
      }
      devWarn('[api/ingest/photos] image download failed', { source_ref: body.source_ref })
      return NextResponse.json({ error: 'image_fetch_failed' }, { status: 502 })
    }
    const original = fetched.bytes
    const mime = await detectImageMime(original)
    if (!mime) {
      return NextResponse.json({ error: 'unsupported_image_type', field: 'image_url' }, { status: 422 })
    }

    const contentHash = createHash('sha256').update(original).digest('hex')
    const sameBytes = await findByContentHash(supabase, contentHash)
    if (sameBytes) return exists(request, sameBytes.id)

    // 5. Derivatives (same presets as the browser upload) under the photographer's prefix.
    let derivatives: Awaited<ReturnType<typeof createServerDerivatives>>
    try {
      derivatives = await createServerDerivatives(original)
    } catch {
      return NextResponse.json({ error: 'unsupported_image_type', field: 'image_url' }, { status: 422 })
    }

    const stem = storageStem()
    const storagePath = `${photographerId}/${stem}.${originalExt(body.filename, mime)}`
    const displayPath = `${photographerId}/display/${stem}.jpg`
    const thumbnailPath = `${photographerId}/thumbs/${stem}.jpg`
    const objects: Array<{ path: string; bytes: Buffer; contentType: string; cacheControl: string }> = [
      { path: storagePath, bytes: original, contentType: mime, cacheControl: '3600' },
      { path: displayPath, bytes: derivatives.display, contentType: 'image/jpeg', cacheControl: '86400' },
      { path: thumbnailPath, bytes: derivatives.thumbnail, contentType: 'image/jpeg', cacheControl: '86400' },
    ]
    for (const o of objects) {
      const { error } = await supabase.storage
        .from('photos')
        .upload(o.path, o.bytes, { contentType: o.contentType, cacheControl: o.cacheControl, upsert: false })
      if (error) throw error
      uploaded.push(o.path)
    }

    // 6. Same tagger as the upload flow; soft fallback on failure.
    const ai = await tagForIngest(derivatives.aiTag)

    // 7. Insert with provenance.
    const row = {
      title: ai.title,
      tags: ai.tags,
      category: ai.category,
      description: ai.description || null,
      photographer_id: photographerId,
      collection_id: null,
      captured_date: body.captured_date,
      neighborhood: await resolveNeighborhood(supabase, body.neighborhood),
      subarea: body.subarea,
      lat: body.lat,
      lng: body.lng,
      notes: body.notes,
      storage_path: storagePath,
      display_path: displayPath,
      thumbnail_path: thumbnailPath,
      content_hash: contentHash,
      downloads_count: 0,
      source_app: body.source_app,
      source_ref: body.source_ref,
      sent_by_email: body.photographer_email,
      consent_text: body.consent_text,
      consented_at: body.consented_at,
    }
    const { data: inserted, error: insertErr } = await supabase.from('photos').insert(row).select('id').single()
    if (insertErr) {
      await removeUploaded(supabase, uploaded)
      uploaded.length = 0
      // Double-send race lost to a concurrent request: return the winner.
      if (insertErr.code === '23505') {
        const winner = await findBySourceRef(supabase, body.source_app, body.source_ref)
        if (winner) return exists(request, winner.id)
      }
      throw insertErr
    }

    // 8. Created. Same cache paths publishPhoto revalidates.
    revalidatePath('/')
    revalidatePath('/my-photos')
    revalidatePath('/admin')
    revalidatePath('/admin/libraries')
    return NextResponse.json(
      { status: 'created', photo_id: inserted.id, url: photoUrl(request, inserted.id) },
      { status: 201 },
    )
  } catch (e) {
    await removeUploaded(supabase, uploaded)
    devError('[api/ingest/photos] ingest failed', { source_ref: body.source_ref }, e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
