import { afterEach, describe, expect, it } from 'vitest'
import { isAllowedImageUrl, parseIngestImageHosts } from '@/lib/ingest/imageHosts'
import { ingestSecretFor, signIngestBody, verifyIngestSignature } from '@/lib/ingest/signature'
import { validateIngestBody } from '@/lib/ingest/validateBody'

const SECRET = 'test-secret'
const BODY = '{"source_app":"af2"}'
const NOW = 1_800_000_000

function check(overrides: Partial<Parameters<typeof verifyIngestSignature>[0]> = {}) {
  const timestamp = String(NOW)
  return verifyIngestSignature({
    secret: SECRET,
    timestamp,
    signature: signIngestBody(SECRET, timestamp, BODY),
    rawBody: BODY,
    nowSec: NOW,
    ...overrides,
  })
}

describe('verifyIngestSignature', () => {
  it('accepts a good signature', () => {
    expect(check()).toBe('ok')
  })

  it('accepts upper-case hex', () => {
    expect(check({ signature: signIngestBody(SECRET, String(NOW), BODY).toUpperCase() })).toBe('ok')
  })

  it('rejects a tampered body', () => {
    expect(check({ rawBody: '{"source_app":"af3"}' })).toBe('bad_signature')
  })

  it('rejects the wrong secret', () => {
    expect(check({ secret: 'other' })).toBe('bad_signature')
  })

  it('rejects missing secret, timestamp or signature', () => {
    expect(check({ secret: null })).toBe('bad_signature')
    expect(check({ timestamp: null })).toBe('bad_signature')
    expect(check({ signature: null })).toBe('bad_signature')
  })

  it('rejects malformed signature and timestamp', () => {
    expect(check({ signature: 'zz' })).toBe('bad_signature')
    expect(check({ timestamp: '12.5' })).toBe('bad_signature')
  })

  it('rejects a stale timestamp in either direction', () => {
    const old = String(NOW - 301)
    expect(check({ timestamp: old, signature: signIngestBody(SECRET, old, BODY) })).toBe('stale_timestamp')
    const future = String(NOW + 301)
    expect(check({ timestamp: future, signature: signIngestBody(SECRET, future, BODY) })).toBe(
      'stale_timestamp',
    )
  })

  it('accepts the edge of the window', () => {
    const edge = String(NOW - 300)
    expect(check({ timestamp: edge, signature: signIngestBody(SECRET, edge, BODY) })).toBe('ok')
  })

  it('reports a bad signature before a stale timestamp', () => {
    expect(check({ timestamp: String(NOW - 1000) })).toBe('bad_signature')
  })
})

describe('ingestSecretFor', () => {
  const prev = process.env.AF2_INGEST_SECRET
  afterEach(() => {
    process.env.AF2_INGEST_SECRET = prev
  })

  it('returns the af2 secret only when set', () => {
    process.env.AF2_INGEST_SECRET = ' s3cret '
    expect(ingestSecretFor('af2')).toBe('s3cret')
    process.env.AF2_INGEST_SECRET = ''
    expect(ingestSecretFor('af2')).toBeNull()
  })

  it('returns null for unknown sources', () => {
    process.env.AF2_INGEST_SECRET = 's3cret'
    expect(ingestSecretFor('imgdeck')).toBeNull()
    expect(ingestSecretFor('constructor')).toBeNull()
    expect(ingestSecretFor(null)).toBeNull()
  })
})

const VALID = {
  source_app: 'af2',
  source_ref: 'photo:123',
  image_url: 'https://bucket.s3.us-west-2.amazonaws.com/a.jpg?X-Amz-Signature=abc',
  filename: 'web_02.jpg',
  photographer_email: 'jordan@claritynw.com',
  consent_text: 'I agree Clarity photographers can use these photos free of charge.',
  consented_at: '2026-10-30T21:04:00Z',
  captured_date: '2026-10-12',
  neighborhood: 'Queen Anne',
  subarea: 'Seattle',
  lat: 47.63,
  lng: -122.35,
  notes: 'AF2 shoot 9',
}

describe('validateIngestBody', () => {
  it('accepts the contract example', () => {
    const r = validateIngestBody(VALID)
    expect(r.ok).toBe(true)
  })

  it('defaults optional fields to null', () => {
    const required = {
      source_app: VALID.source_app,
      source_ref: VALID.source_ref,
      image_url: VALID.image_url,
      filename: VALID.filename,
      photographer_email: VALID.photographer_email,
      consent_text: VALID.consent_text,
      consented_at: VALID.consented_at,
    }
    const r = validateIngestBody(required)
    expect(r).toEqual({
      ok: true,
      value: {
        ...required,
        captured_date: null,
        neighborhood: null,
        subarea: null,
        lat: null,
        lng: null,
        notes: null,
      },
    })
  })

  it('rejects non-object bodies', () => {
    expect(validateIngestBody(null)).toEqual({ ok: false, error: 'invalid_body', field: 'body' })
    expect(validateIngestBody([])).toEqual({ ok: false, error: 'invalid_body', field: 'body' })
  })

  it.each([
    ['source_app', 'imgdeck'],
    ['source_ref', ''],
    ['image_url', 42],
    ['filename', '   '],
    ['photographer_email', 'not-an-email'],
    ['consent_text', ''],
    ['consented_at', '2026-10-30'],
    ['captured_date', '2026-02-30'],
    ['neighborhood', 7],
    ['lat', 91],
    ['lng', '-122.35'],
    ['notes', 'x'.repeat(2001)],
  ])('reports %s when invalid', (field, value) => {
    expect(validateIngestBody({ ...VALID, [field]: value })).toEqual({
      ok: false,
      error: 'invalid_field',
      field,
    })
  })

  it('trims strings and blanks optional strings to null', () => {
    const r = validateIngestBody({ ...VALID, source_ref: '  photo:1 ', neighborhood: '  ' })
    expect(r.ok && r.value.source_ref).toBe('photo:1')
    expect(r.ok && r.value.neighborhood).toBeNull()
  })
})

describe('image host allow-list', () => {
  const hosts = parseIngestImageHosts(' Bucket.s3.us-west-2.amazonaws.com , ,cdn.example.com')

  it('parses and lower-cases the env list', () => {
    expect(hosts).toEqual(['bucket.s3.us-west-2.amazonaws.com', 'cdn.example.com'])
    expect(parseIngestImageHosts(undefined)).toEqual([])
    expect(parseIngestImageHosts('')).toEqual([])
  })

  it('allows https on a listed host', () => {
    expect(isAllowedImageUrl('https://bucket.s3.us-west-2.amazonaws.com/a.jpg?sig=1', hosts)).toBe(true)
    expect(isAllowedImageUrl('https://CDN.example.com:443/a.jpg', hosts)).toBe(true)
  })

  it('rejects http, other hosts, lookalikes, credentials, ports and junk', () => {
    expect(isAllowedImageUrl('http://cdn.example.com/a.jpg', hosts)).toBe(false)
    expect(isAllowedImageUrl('https://evil.com/a.jpg', hosts)).toBe(false)
    expect(isAllowedImageUrl('https://cdn.example.com.evil.com/a.jpg', hosts)).toBe(false)
    expect(isAllowedImageUrl('https://sub.cdn.example.com/a.jpg', hosts)).toBe(false)
    expect(isAllowedImageUrl('https://user:pw@cdn.example.com/a.jpg', hosts)).toBe(false)
    expect(isAllowedImageUrl('https://cdn.example.com:8443/a.jpg', hosts)).toBe(false)
    expect(isAllowedImageUrl('file:///etc/passwd', hosts)).toBe(false)
    expect(isAllowedImageUrl('not a url', hosts)).toBe(false)
  })

  it('allows nothing when the list is empty', () => {
    expect(isAllowedImageUrl('https://cdn.example.com/a.jpg', [])).toBe(false)
  })
})
