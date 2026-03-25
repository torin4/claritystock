import {
  GoogleGenerativeAI,
  SchemaType,
  type GenerateContentResult,
  type ResponseSchema,
} from '@google/generative-ai'
import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'
import type { Category } from '@/lib/types/database.types'

const PROMPT = `You are a real estate photography assistant for a luxury Pacific Northwest property library.

Look at the image carefully (Gemini Vision). Then return JSON with:
- "title": short descriptive title, 5–8 words (e.g. "Kirkland Marina at golden hour")
- "tags": array of 5–8 specific lowercase tags for search (e.g. "waterfront", "marina", "golden hour", "Lake Washington", "boat dock")
- "category": exactly one of: neighborhood, city, condo
- "description": one sentence describing the photo for search

Use "neighborhood" for residential areas and local character; "city" for downtown, skyline, urban streets, civic spaces; "condo" for condo buildings, lobbies, units, and building interiors. Pacific Northwest context.

Return only a single JSON object (no markdown, no code fences).`

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
      description: 'neighborhood | city | condo',
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

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
  const mimeType = body.mimeType?.trim()
  if (!rawB64 || !mimeType) {
    return NextResponse.json({ error: 'Missing imageBase64 or mimeType' }, { status: 400 })
  }

  const imageBase64 = rawB64.replace(/\s/g, '')

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
              parts: [
                { text: PROMPT },
                { inlineData: { mimeType, data: imageBase64 } },
              ],
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
  console.error('[api/ai/tag]', message, lastErr)
  return NextResponse.json(
    {
      error: 'AI tagging failed',
      detail: message,
      hint:
        'Set GEMINI_VISION_MODEL in .env to a model your key supports (list: https://ai.google.dev/gemini-api/docs/models ). Use a Google AI Studio API key, not Vertex.',
    },
    { status: 500 },
  )
}
