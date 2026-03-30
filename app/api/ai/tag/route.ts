import {
  GoogleGenerativeAI,
  SchemaType,
  type GenerateContentResult,
  type ResponseSchema,
} from '@google/generative-ai'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'
import type { Category } from '@/lib/types/database.types'
import { devError } from '@/lib/utils/devLog'

type InlinePart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }

const CATEGORY_REF_DIR = join(process.cwd(), 'lib', 'ai', 'category-refs')
const CATEGORY_REF_MIME = 'image/png' as const

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

const PROMPT = `You are a real estate photography assistant for a luxury Pacific Northwest property library.
Study the **final** image in this message (the photographer's upload), then assign exactly ONE category as a lowercase string: neighborhood, city, or condo.

## Category rules (apply in this order)

1) **condo** — **Shared building amenities and common areas** in a condominium or townhome **development**: lobby, mail/package room, resident lounge/clubroom, **building** gym or pool, spa, shared roof deck or courtyard **for residents**, interior corridors as common space. Also the **exterior of the condo/townhome building** as the hero subject (architectural shot of the tower or townhome façade—residential high-rise with balconies/unit rhythm, not a whole-city vista). **Do not** use condo for **private unit interiors** (someone’s kitchen, living room, bedroom, bath, or a staged unit) — those are **neighborhood**. When reference images are provided, **match this category to the reference labeled condo** when the upload is that kind of residential-building-as-hero (or shared amenity space), not the wide **city** benchmark or the **neighborhood** benchmark.

2) **city** — The image is **clearly showing the city itself** at a **broad, unmistakably metropolitan** scale: recognizable **skyline**, downtown **massing** of towers, major **civic** landmarks (courthouse, stadium, central library), wide commercial arterials dominated by high-rises, iconic **waterfront city** views where the point is “this is Seattle / Bellevue / Kirkland **downtown**,” not a quiet side street. If a viewer would say “that’s **the city**” rather than “that’s **a neighborhood**,” pick city. When reference images are provided, **match this category to the reference labeled city** when the upload resembles that benchmark more than the neighborhood reference.

3) **neighborhood** — **Closer-in, human scale**: streets and blocks that feel **local** — front yards, porches, single-family and small multi-family, tree-lined residential blocks, pocket parks, schools, suburban subdivisions, quiet retail on a residential corner. Same metro area can be neighborhood if the frame is **tight and intimate** (one block, one row of homes) rather than selling the **whole city**. Also all **private residence interiors** (including condo/townhome **units**: kitchen, living, bedroom, bath, staged models). When reference images are provided, **match this category to the reference labeled neighborhood** when the upload resembles that benchmark more than the city reference.

## Tie-breakers

- Rooftop or terrace → **condo** if clearly a **shared** amenity deck; **neighborhood** if a **private** balcony/terrace; **city** if the shot is mostly **skyline / downtown** beyond the railing.
- Park with towers behind → **city** if skyline/civic drama dominates; **neighborhood** if it reads as a **local** park on an ordinary block.
- **City vs neighborhood:** if the subject is **block-scale or interior** → neighborhood; if the subject is **the recognizable city / downtown as a whole** → city. When in doubt at **street level** (could be downtown side street) → **neighborhood** unless towers/skyline/civic landmark clearly dominate the frame.

## Output JSON only (no markdown, no code fences)

- "title": short descriptive title, 5–8 words (e.g. "Kirkland Marina at golden hour")
- "tags": array of 5–8 specific lowercase tags for search (e.g. "waterfront", "marina", "golden hour", "Lake Washington", "boat dock")
- "category": exactly one of: neighborhood, city, condo
- "description": one sentence describing the photo for search`

let categoryRefCache: { neighborhood: string; city: string; condo: string } | null | undefined

/** Calibrated examples: neighborhood.png, city.png, condo.png (see lib/ai/category-refs/). */
function loadCategoryRefBase64(): { neighborhood: string; city: string; condo: string } | null {
  if (categoryRefCache !== undefined) return categoryRefCache
  try {
    categoryRefCache = {
      neighborhood: readFileSync(join(CATEGORY_REF_DIR, 'neighborhood.png')).toString('base64'),
      city: readFileSync(join(CATEGORY_REF_DIR, 'city.png')).toString('base64'),
      condo: readFileSync(join(CATEGORY_REF_DIR, 'condo.png')).toString('base64'),
    }
    return categoryRefCache
  } catch {
    categoryRefCache = null
    return null
  }
}

function buildVisionParts(uploadMimeType: string, uploadBase64: string): InlinePart[] {
  const refs = loadCategoryRefBase64()
  if (!refs) {
    return [{ text: PROMPT }, { inlineData: { mimeType: uploadMimeType, data: uploadBase64 } }]
  }

  return [
    {
      text: `Three reference images calibrate **neighborhood**, **city**, and **condo** for this library. Use them only as visual benchmarks; your JSON output must describe the **last** image (the photographer's upload), not the references.

REFERENCE — **neighborhood** (example the team labeled neighborhood):`,
    },
    { inlineData: { mimeType: CATEGORY_REF_MIME, data: refs.neighborhood } },
    {
      text: `REFERENCE — **city** (example the team labeled city):`,
    },
    { inlineData: { mimeType: CATEGORY_REF_MIME, data: refs.city } },
    {
      text: `REFERENCE — **condo** (example the team labeled condo — e.g. residential tower/façade as hero, not a whole-city vista):`,
    },
    { inlineData: { mimeType: CATEGORY_REF_MIME, data: refs.condo } },
    {
      text: `${PROMPT}

The image immediately after this text is the **only** photo to title, tag, and categorize. Do not copy titles or tags from the reference images.`,
    },
    { inlineData: { mimeType: uploadMimeType, data: uploadBase64 } },
  ]
}

type GenMode = 'plain' | 'json' | 'json_schema'

/** Vision-capable models for Google AI Studio; IDs change — set GEMINI_VISION_MODEL to one that works for your key. */
const DEFAULT_VISION_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-002',
  'gemini-1.5-flash-8b',
] as const

function visionModelCandidates(): string[] {
  const override = process.env.GEMINI_VISION_MODEL?.trim()
  if (override) {
    const rest = DEFAULT_VISION_MODELS.filter((m) => m !== override)
    return [override, ...rest]
  }
  return [...DEFAULT_VISION_MODELS]
}

const TAG_RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    title: { type: SchemaType.STRING, description: 'Short photo title' },
    tags: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: '5-8 lowercase search tags',
    },
    category: {
      type: SchemaType.STRING,
      description:
        'Exactly one: neighborhood, city, or condo — align with the three reference images when present (condo = residential building-as-hero or shared amenities, not private unit interiors)',
    },
    description: { type: SchemaType.STRING, description: 'One sentence' },
  },
  required: ['title', 'tags', 'category', 'description'],
}

function parseModelJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '')
  try {
    return JSON.parse(trimmed)
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1))
    }
    throw new Error('Model did not return valid JSON')
  }
}

function responseText(result: GenerateContentResult): string {
  try {
    const t = result.response.text()
    if (t?.trim()) return t.trim()
  } catch {
    /* fall through */
  }
  const parts = result.response.candidates?.[0]?.content?.parts
  if (!parts?.length) return ''
  return parts
    .map((p) => ('text' in p && typeof p.text === 'string' ? p.text : ''))
    .join('')
    .trim()
}

function normalizeTags(input: unknown): string[] {
  if (Array.isArray(input)) {
    return Array.from(
      new Set(
        input
          .map((t) => String(t).trim().toLowerCase())
          .filter(Boolean),
      ),
    ).slice(0, 12)
  }
  if (typeof input === 'string') {
    return Array.from(
      new Set(
        input
          .split(/[,;|]/)
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean),
      ),
    ).slice(0, 12)
  }
  return []
}

function normalizeCategory(raw: unknown): Category {
  const s = typeof raw === 'string' ? raw.toLowerCase().trim() : ''
  if (s === 'neighborhood' || s === 'city' || s === 'condo') return s
  if (s === 'community') return 'city'
  if (s === 'amenity') return 'condo'
  if (s.includes('commun')) return 'city'
  if (s.includes('condo') || s.includes('amenit')) return 'condo'
  if (s.includes('neighbor')) return 'neighborhood'
  return 'neighborhood'
}

function fallbackTagPayload() {
  return {
    title: 'Untitled photo',
    tags: [],
    category: 'neighborhood' as Category,
    description: '',
    fallback: true,
  }
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

  const genAI = new GoogleGenerativeAI(key)
  let lastErr: unknown

  const modes: GenMode[] = ['plain', 'json', 'json_schema']

  for (const modelName of visionModelCandidates()) {
    for (const mode of modes) {
      try {
        const generationConfig =
          mode === 'plain'
            ? undefined
            : mode === 'json'
              ? { responseMimeType: 'application/json' as const }
              : {
                  responseMimeType: 'application/json' as const,
                  responseSchema: TAG_RESPONSE_SCHEMA,
                }

        const model = genAI.getGenerativeModel(
          generationConfig
            ? { model: modelName, generationConfig }
            : { model: modelName },
        )

        const result = await model.generateContent({
          contents: [
            {
              role: 'user',
              parts: buildVisionParts(mimeType, imageBase64),
            },
          ],
        })

        const text = responseText(result)
        if (!text) {
          lastErr = new Error('Empty model response')
          continue
        }

        const parsed = parseModelJson(text) as Record<string, unknown>
        const title =
          typeof parsed.title === 'string' && parsed.title.trim()
            ? parsed.title.trim()
            : 'Untitled photo'

        const tags = normalizeTags(parsed.tags)
        const category = normalizeCategory(parsed.category)
        const description =
          typeof parsed.description === 'string' ? parsed.description.trim() : ''

        return NextResponse.json({
          title,
          tags,
          category,
          description,
        })
      } catch (e) {
        lastErr = e
      }
    }
  }

  const message = lastErr instanceof Error ? lastErr.message : String(lastErr)
  devError('[api/ai/tag]', message, lastErr)
  // Fail-soft in production: uploads should continue even if AI provider/model is unavailable.
  return NextResponse.json(fallbackTagPayload())
}
