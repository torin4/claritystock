import { createHmac, timingSafeEqual } from 'node:crypto'

/** Max clock skew between sender and this server, either direction. */
export const INGEST_MAX_SKEW_SEC = 300

/** Per-source shared secret env var. Only af2 is wired; IMGDeck can add a row later. */
const INGEST_SECRET_ENV: Record<string, string> = {
  af2: 'AF2_INGEST_SECRET',
}

export function isKnownIngestSource(source: string): boolean {
  return Object.prototype.hasOwnProperty.call(INGEST_SECRET_ENV, source)
}

/** Secret for `source`, or null when the source is unknown or its secret is unset. */
export function ingestSecretFor(source: string | null | undefined): string | null {
  if (!source || !isKnownIngestSource(source)) return null
  const v = process.env[INGEST_SECRET_ENV[source]]?.trim()
  return v ? v : null
}

export function signIngestBody(secret: string, timestamp: string, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
}

export type SignatureCheck = 'ok' | 'bad_signature' | 'stale_timestamp'

/**
 * Verify `hex(hmac_sha256(secret, timestamp + "." + rawBody))` in constant time,
 * then the timestamp window. A wrong signature is reported before a stale one so
 * an unauthenticated caller learns nothing about the clock check.
 */
export function verifyIngestSignature(input: {
  secret: string | null
  timestamp: string | null
  signature: string | null
  rawBody: string
  nowSec?: number
}): SignatureCheck {
  const { secret, timestamp, signature, rawBody } = input
  if (!secret || !timestamp || !signature) return 'bad_signature'
  if (!/^\d{1,12}$/.test(timestamp)) return 'bad_signature'
  if (!/^[0-9a-f]{64}$/i.test(signature)) return 'bad_signature'

  const expected = Buffer.from(signIngestBody(secret, timestamp, rawBody), 'hex')
  const given = Buffer.from(signature, 'hex')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return 'bad_signature'
  }

  const now = input.nowSec ?? Math.floor(Date.now() / 1000)
  if (Math.abs(now - Number(timestamp)) > INGEST_MAX_SKEW_SEC) return 'stale_timestamp'
  return 'ok'
}
