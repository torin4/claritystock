import sharp from 'sharp'
import { NextRequest } from 'next/server'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { signIngestBody } from '@/lib/ingest/signature'

/**
 * Route-level behaviour of POST /api/ingest/photos against a scripted Supabase
 * double: idempotency, photographer resolution, the double-send race and
 * cleanup of uploaded objects. Real HMAC, validation and sharp derivatives.
 */

type Query = {
  table: string
  op: 'select' | 'insert'
  filters: Record<string, unknown>
  row?: Record<string, unknown>
}

const db = vi.hoisted(() => ({
  respond: (_q: Query): { data: unknown; error: unknown } => ({ data: null, error: null }),
  queries: [] as Query[],
  uploads: [] as string[],
  removed: [] as string[][],
  uploadError: null as unknown,
}))

const fetchIngestImage = vi.hoisted(() => vi.fn())
const tagImage = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/ingest/fetchImage', () => ({ fetchIngestImage }))
vi.mock('@/lib/ai/tagImage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/tagImage')>()),
  tagImage,
}))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => {
    function builder(table: string) {
      const q: Query = { table, op: 'select', filters: {} }
      const settle = () => {
        db.queries.push(q)
        return Promise.resolve(db.respond(q))
      }
      const b = {
        select: () => b,
        insert: (row: Record<string, unknown>) => {
          q.op = 'insert'
          q.row = row
          return b
        },
        eq: (col: string, v: unknown) => {
          q.filters[col] = v
          return b
        },
        ilike: (col: string, v: unknown) => {
          q.filters[`${col}~`] = v
          return b
        },
        order: () => b,
        limit: () => b,
        maybeSingle: settle,
        single: settle,
        then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => settle().then(ok, bad),
      }
      return b
    }
    return {
      from: builder,
      storage: {
        from: () => ({
          upload: async (path: string) => {
            if (db.uploadError && db.uploads.length === 1) return { error: db.uploadError }
            db.uploads.push(path)
            return { error: null }
          },
          remove: async (paths: string[]) => {
            db.removed.push([...paths])
            return { error: null }
          },
        }),
      },
    }
  },
}))

const SECRET = 'route-test-secret'
const PHOTOGRAPHER = '11111111-1111-1111-1111-111111111111'
const BODY = {
  source_app: 'af2',
  source_ref: 'photo:42',
  image_url: 'https://bucket.s3.us-west-2.amazonaws.com/a.jpg?X-Amz-Signature=abc',
  filename: 'web_02.jpg',
  photographer_email: 'Jordan@ClarityNW.com',
  consent_text: 'I agree Clarity photographers can use these photos free of charge.',
  consented_at: '2026-10-30T21:04:00Z',
  captured_date: '2026-10-12',
  neighborhood: null,
  subarea: 'Seattle',
  lat: 47.63,
  lng: -122.35,
  notes: 'AF2 shoot 9',
}

let JPEG: Buffer
let POST: typeof import('@/app/api/ingest/photos/route').POST

function signedRequest(body: unknown = BODY) {
  const raw = JSON.stringify(body)
  const ts = String(Math.floor(Date.now() / 1000))
  return new NextRequest('https://stock.test/api/ingest/photos', {
    method: 'POST',
    body: raw,
    headers: {
      'content-type': 'application/json',
      'x-stock-source': 'af2',
      'x-stock-timestamp': ts,
      'x-stock-signature': signIngestBody(SECRET, ts, raw),
    },
  })
}

/** Default library: no prior send, one matching user, no same-bytes photo, insert succeeds. */
function library(overrides: Partial<Record<string, (q: Query) => { data: unknown; error: unknown }>> = {}) {
  db.respond = (q) => {
    const key =
      q.op === 'insert'
        ? 'insert'
        : q.table === 'photos' && 'source_ref' in q.filters
          ? 'bySourceRef'
          : q.table === 'photos'
            ? 'byHash'
            : q.table
    const custom = overrides[key]
    if (custom) return custom(q)
    if (key === 'users') return { data: [{ id: PHOTOGRAPHER, email: 'jordan@claritynw.com' }], error: null }
    if (key === 'neighborhood_canonicals') return { data: [], error: null }
    if (key === 'insert') return { data: { id: 'new-photo' }, error: null }
    return { data: null, error: null }
  }
}

beforeAll(async () => {
  process.env.AF2_INGEST_SECRET = SECRET
  process.env.INGEST_IMAGE_HOSTS = 'bucket.s3.us-west-2.amazonaws.com'
  process.env.GEMINI_API_KEY = 'test-key'
  JPEG = await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 1, g: 2, b: 3 } } })
    .jpeg()
    .toBuffer()
  ;({ POST } = await import('@/app/api/ingest/photos/route'))
})

beforeEach(() => {
  db.queries = []
  db.uploads = []
  db.removed = []
  db.uploadError = null
  fetchIngestImage.mockReset().mockResolvedValue({ ok: true, bytes: JPEG })
  tagImage.mockReset().mockResolvedValue({
    ok: true,
    payload: { title: 'Queen Anne view', tags: ['skyline'], category: 'city', description: 'A view.' },
    model: 'm',
    mode: 'plain',
    attempts: [],
  })
  library()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/ingest/photos', () => {
  it('rejects an unsigned request before touching the database', async () => {
    const req = signedRequest()
    req.headers.set('x-stock-signature', '0'.repeat(64))
    const res = await POST(req)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'bad_signature' })
    expect(db.queries).toHaveLength(0)
  })

  it('returns the existing row for a resent source_ref without downloading', async () => {
    library({ bySourceRef: () => ({ data: { id: 'prior' }, error: null }) })
    const res = await POST(signedRequest())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      status: 'exists',
      photo_id: 'prior',
      url: 'https://stock.test/browse?photo=prior',
    })
    expect(fetchIngestImage).not.toHaveBeenCalled()
  })

  it('404s when no user on the workspace domain has the email', async () => {
    library({ users: () => ({ data: [], error: null }) })
    const res = await POST(signedRequest())
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'photographer_not_found' })
    expect(fetchIngestImage).not.toHaveBeenCalled()
  })

  it('404s for an off-domain email without querying users', async () => {
    const res = await POST(signedRequest({ ...BODY, photographer_email: 'jordan@gmail.com' }))
    expect(res.status).toBe(404)
    expect(db.queries.some((q) => q.table === 'users')).toBe(false)
  })

  it('returns the same-bytes photo instead of storing a copy', async () => {
    library({ byHash: () => ({ data: { id: 'same-bytes' }, error: null }) })
    const res = await POST(signedRequest())
    expect(await res.json()).toMatchObject({ status: 'exists', photo_id: 'same-bytes' })
    expect(db.uploads).toHaveLength(0)
  })

  it('creates the photo with provenance under the photographer prefix', async () => {
    const res = await POST(signedRequest())
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({
      status: 'created',
      photo_id: 'new-photo',
      url: 'https://stock.test/browse?photo=new-photo',
    })
    expect(db.uploads).toHaveLength(3)
    expect(db.uploads.every((p) => p.startsWith(`${PHOTOGRAPHER}/`))).toBe(true)
    expect(db.uploads[0]).toMatch(/\.jpg$/)
    const insert = db.queries.find((q) => q.op === 'insert')!
    expect(insert.row).toMatchObject({
      photographer_id: PHOTOGRAPHER,
      title: 'Queen Anne view',
      tags: ['skyline', 'needs-location'],
      source_app: 'af2',
      source_ref: 'photo:42',
      consent_text: BODY.consent_text,
      consented_at: BODY.consented_at,
      storage_path: db.uploads[0],
      display_path: db.uploads[1],
      thumbnail_path: db.uploads[2],
    })
    expect(insert.row).not.toHaveProperty('sent_by_email')
    expect(db.removed).toHaveLength(0)
  })

  it('stores the original under the sniffed format, not a mismatched filename extension', async () => {
    await POST(signedRequest({ ...BODY, filename: 'web_02.png' }))
    expect(db.uploads[0]).toMatch(/\.jpg$/)
  })

  it('loses the double-send race gracefully: deletes its uploads and returns the winner', async () => {
    let lookups = 0
    library({
      bySourceRef: () => ({ data: lookups++ === 0 ? null : { id: 'winner' }, error: null }),
      insert: () => ({ data: null, error: { code: '23505', message: 'duplicate key' } }),
    })
    const res = await POST(signedRequest())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'exists', photo_id: 'winner' })
    expect(db.removed).toEqual([db.uploads])
  })

  it('removes uploaded objects when the insert fails', async () => {
    library({ insert: () => ({ data: null, error: { code: '23514', message: 'check violation' } }) })
    const res = await POST(signedRequest())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'internal_error' })
    expect(db.removed).toEqual([db.uploads])
  })

  it('removes the objects already stored when a later upload fails', async () => {
    db.uploadError = { message: 'storage down' }
    const res = await POST(signedRequest())
    expect(res.status).toBe(500)
    expect(db.uploads).toHaveLength(1)
    expect(db.removed).toEqual([db.uploads])
  })

  it('tags before uploading, so nothing is stored while the tagger runs', async () => {
    tagImage.mockImplementation(async () => {
      expect(db.uploads).toHaveLength(0)
      return { ok: false, payload: { title: 'Untitled photo', tags: [], category: 'neighborhood', description: '' } }
    })
    const res = await POST(signedRequest())
    expect(res.status).toBe(201)
    expect(db.queries.find((q) => q.op === 'insert')!.row).toMatchObject({ title: 'Untitled photo' })
  })

  it('maps download failures to the contract errors', async () => {
    fetchIngestImage.mockResolvedValueOnce({ ok: false, kind: 'fetch_failed' })
    expect((await POST(signedRequest())).status).toBe(502)
    fetchIngestImage.mockResolvedValueOnce({ ok: false, kind: 'too_large' })
    expect(await (await POST(signedRequest())).json()).toEqual({ error: 'image_too_large', field: 'image_url' })
    fetchIngestImage.mockResolvedValueOnce({ ok: true, bytes: Buffer.from('<svg/>') })
    expect(await (await POST(signedRequest())).json()).toEqual({
      error: 'unsupported_image_type',
      field: 'image_url',
    })
  })
})
