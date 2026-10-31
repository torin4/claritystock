/** Same cap as the private `photos` bucket. */
export const INGEST_MAX_IMAGE_BYTES = 50 * 1024 * 1024

/**
 * Response types worth downloading. The real format is sniffed from the bytes
 * afterwards; octet-stream (or no type) is let through because AF1-imported S3
 * objects were stored as `application/octet-stream`.
 */
const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/tiff',
  'application/octet-stream',
  'binary/octet-stream',
  '',
])

export type FetchImageResult =
  | { ok: true; bytes: Buffer }
  | { ok: false; kind: 'fetch_failed' }
  | { ok: false; kind: 'too_large' }
  | { ok: false; kind: 'unsupported_type' }

/**
 * Download the (already allow-listed) image URL. Redirects are refused so the
 * host allow-list cannot be bypassed; the body is streamed and cut off at the cap.
 * Never log `url`: it is a presigned credential.
 */
export async function fetchIngestImage(url: string, timeoutMs = 60_000): Promise<FetchImageResult> {
  let res: Response
  try {
    res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' })
  } catch {
    return { ok: false, kind: 'fetch_failed' }
  }
  if (!res.ok || !res.body) return { ok: false, kind: 'fetch_failed' }

  const type = res.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? ''
  if (!ALLOWED_CONTENT_TYPES.has(type)) {
    await res.body.cancel().catch(() => {})
    return { ok: false, kind: 'unsupported_type' }
  }

  const declared = res.headers.get('content-length')
  if (declared && /^\d+$/.test(declared) && Number(declared) > INGEST_MAX_IMAGE_BYTES) {
    await res.body.cancel().catch(() => {})
    return { ok: false, kind: 'too_large' }
  }

  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > INGEST_MAX_IMAGE_BYTES) {
        await reader.cancel().catch(() => {})
        return { ok: false, kind: 'too_large' }
      }
      chunks.push(value)
    }
  } catch {
    return { ok: false, kind: 'fetch_failed' }
  }
  if (total === 0) return { ok: false, kind: 'fetch_failed' }
  return { ok: true, bytes: Buffer.concat(chunks) }
}
