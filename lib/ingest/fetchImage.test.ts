import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchIngestImage, INGEST_MAX_IMAGE_BYTES } from '@/lib/ingest/fetchImage'

function respondWith(body: BodyInit | null, headers: Record<string, string>, status = 200) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status, headers })))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchIngestImage', () => {
  it('downloads an image response', async () => {
    respondWith(new Uint8Array([1, 2, 3]), { 'content-type': 'image/jpeg' })
    expect(await fetchIngestImage('https://h/a.jpg')).toEqual({ ok: true, bytes: Buffer.from([1, 2, 3]) })
  })

  it('accepts octet-stream objects (AF1-imported S3 photos) and leaves the format to the byte sniff', async () => {
    respondWith(new Uint8Array([1]), { 'content-type': 'application/octet-stream' })
    expect((await fetchIngestImage('https://h/a.jpg')).ok).toBe(true)
    respondWith(new Uint8Array([1]), { 'content-type': 'binary/octet-stream' })
    expect((await fetchIngestImage('https://h/a.jpg')).ok).toBe(true)
  })

  it('refuses a non-image response such as an error page', async () => {
    respondWith('<html/>', { 'content-type': 'text/html; charset=utf-8' })
    expect(await fetchIngestImage('https://h/a.jpg')).toEqual({ ok: false, kind: 'unsupported_type' })
  })

  it('refuses a declared or streamed body over the cap', async () => {
    respondWith(new Uint8Array([1]), {
      'content-type': 'image/jpeg',
      'content-length': String(INGEST_MAX_IMAGE_BYTES + 1),
    })
    expect(await fetchIngestImage('https://h/a.jpg')).toEqual({ ok: false, kind: 'too_large' })
    respondWith(new Uint8Array(INGEST_MAX_IMAGE_BYTES + 1), { 'content-type': 'image/jpeg' })
    expect(await fetchIngestImage('https://h/a.jpg')).toEqual({ ok: false, kind: 'too_large' })
  })

  it('reports a non-2xx, an empty body or a network error as fetch_failed', async () => {
    respondWith('denied', { 'content-type': 'image/jpeg' }, 403)
    expect(await fetchIngestImage('https://h/a.jpg')).toEqual({ ok: false, kind: 'fetch_failed' })
    respondWith(new Uint8Array(0), { 'content-type': 'image/jpeg' })
    expect(await fetchIngestImage('https://h/a.jpg')).toEqual({ ok: false, kind: 'fetch_failed' })
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('redirect'))))
    expect(await fetchIngestImage('https://h/a.jpg')).toEqual({ ok: false, kind: 'fetch_failed' })
  })
})
