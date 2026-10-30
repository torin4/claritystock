import { isKnownIngestSource } from '@/lib/ingest/signature'

export type IngestPhotoBody = {
  source_app: string
  source_ref: string
  image_url: string
  filename: string
  photographer_email: string
  consent_text: string
  consented_at: string
  captured_date: string | null
  neighborhood: string | null
  subarea: string | null
  lat: number | null
  lng: number | null
  notes: string | null
}

export type ValidationResult =
  | { ok: true; value: IngestPhotoBody }
  | { ok: false; error: string; field: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function fail(field: string, error = 'invalid_field'): ValidationResult {
  return { ok: false, error, field }
}

function requiredString(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t && t.length <= max ? t : null
}

/** undefined/null/blank -> null; non-string or too long -> undefined (invalid). */
function optionalString(v: unknown, max: number): string | null | undefined {
  if (v === undefined || v === null) return null
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  if (!t) return null
  return t.length <= max ? t : undefined
}

function optionalNumberInRange(v: unknown, min: number, max: number): number | null | undefined {
  if (v === undefined || v === null) return null
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) return undefined
  return v
}

function isRealDate(s: string): boolean {
  const m = DATE_RE.exec(s)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const dt = new Date(Date.UTC(y, mo - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
}

/** Validate the ingest request body (contract v1). Returns the first failing field. */
export function validateIngestBody(input: unknown): ValidationResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('body', 'invalid_body')
  const b = input as Record<string, unknown>

  const source_app = requiredString(b.source_app, 32)
  if (!source_app || !isKnownIngestSource(source_app)) return fail('source_app')

  const source_ref = requiredString(b.source_ref, 200)
  if (!source_ref) return fail('source_ref')

  const image_url = requiredString(b.image_url, 4096)
  if (!image_url) return fail('image_url')

  const filename = requiredString(b.filename, 255)
  if (!filename) return fail('filename')

  const photographer_email = requiredString(b.photographer_email, 320)
  if (!photographer_email || !EMAIL_RE.test(photographer_email)) return fail('photographer_email')

  const consent_text = requiredString(b.consent_text, 2000)
  if (!consent_text) return fail('consent_text')

  const consented_at = requiredString(b.consented_at, 40)
  if (!consented_at || !ISO_DATETIME_RE.test(consented_at) || Number.isNaN(Date.parse(consented_at))) {
    return fail('consented_at')
  }

  const captured_date = optionalString(b.captured_date, 10)
  if (captured_date === undefined || (captured_date !== null && !isRealDate(captured_date))) {
    return fail('captured_date')
  }

  const neighborhood = optionalString(b.neighborhood, 200)
  if (neighborhood === undefined) return fail('neighborhood')

  const subarea = optionalString(b.subarea, 200)
  if (subarea === undefined) return fail('subarea')

  const lat = optionalNumberInRange(b.lat, -90, 90)
  if (lat === undefined) return fail('lat')

  const lng = optionalNumberInRange(b.lng, -180, 180)
  if (lng === undefined) return fail('lng')

  const notes = optionalString(b.notes, 2000)
  if (notes === undefined) return fail('notes')

  return {
    ok: true,
    value: {
      source_app,
      source_ref,
      image_url,
      filename,
      photographer_email,
      consent_text,
      consented_at,
      captured_date,
      neighborhood,
      subarea,
      lat,
      lng,
      notes,
    },
  }
}
