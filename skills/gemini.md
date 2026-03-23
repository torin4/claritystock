# Gemini Integration Skill — Clarity Stock

## Model
Always use `gemini-2.0-flash` for photo tagging. Do not use Gemini 1.5, Gemini Pro, or any other variant unless explicitly specified.

## Package
```bash
npm install @google/generative-ai
```

---

## Client Setup

```ts
// lib/gemini.ts
import { GoogleGenerativeAI } from '@google/generative-ai'

if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required')

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

export const geminiFlash = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
```

**Rules:**
- NEVER expose `GEMINI_API_KEY` to the browser — always call Gemini from API routes or server actions
- NEVER use `NEXT_PUBLIC_GEMINI_API_KEY`
- Always call from `app/api/` routes

---

## Photo Tagging

### Prompt
```ts
export const PHOTO_TAGGING_PROMPT = `You are a real estate photography assistant for Clarity Northwest, a luxury real estate photography company serving the Pacific Northwest and Puget Sound region.

Analyze this real estate photo and return a JSON object with exactly these fields:
- "title": descriptive title 5-8 words (e.g. "Kirkland Marina at golden hour", "Bellevue Downtown aerial skyline view")
- "tags": array of 5-8 specific tags useful for real estate search. Focus on: location landmarks, architectural features, lighting conditions, amenities visible, PNW-specific context. Examples: ["waterfront", "marina", "golden hour", "Lake Washington", "boat dock", "aerial", "downtown", "skyline"]
- "category": exactly one of "neighborhood", "community", or "amenity"
  - neighborhood: outdoor scenes, streets, parks, waterfronts, aerial views
  - community: clubhouses, common areas, shared spaces, dog parks, courtyards
  - amenity: pools, gyms, rooftop decks, lobbies, fitness centers
- "description": one sentence describing the photo for search indexing

Return ONLY valid JSON. No markdown, no backticks, no explanation.`
```

### Tag function
```ts
export interface GeminiTagResult {
  title: string
  tags: string[]
  category: 'neighborhood' | 'community' | 'amenity'
  description: string
}

export async function tagPhotoWithGemini(
  imageBase64: string,
  mimeType: string = 'image/jpeg'
): Promise<GeminiTagResult> {
  const imagePart = {
    inlineData: {
      data: imageBase64,
      mimeType,
    },
  }

  const result = await geminiFlash.generateContent([PHOTO_TAGGING_PROMPT, imagePart])
  const text = result.response.text().trim()

  // Strip markdown code fences if model adds them despite instructions
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()

  const parsed = JSON.parse(cleaned) as GeminiTagResult

  // Validate response shape
  if (!parsed.title || !parsed.tags || !parsed.category || !parsed.description) {
    throw new Error('Gemini returned incomplete tag data')
  }

  if (!['neighborhood', 'community', 'amenity'].includes(parsed.category)) {
    parsed.category = 'neighborhood' // safe fallback
  }

  return parsed
}
```

### API Route
```ts
// app/api/tag-photo/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { tagPhotoWithGemini } from '@/lib/gemini'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  // Auth check
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  // Convert to base64
  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')

  const tags = await tagPhotoWithGemini(base64, file.type)
  return NextResponse.json(tags)
}
```

---

## Error Handling

```ts
// Always wrap Gemini calls — network failures and JSON parse errors are common
async function safeTagPhoto(base64: string, mimeType: string): Promise<GeminiTagResult | null> {
  try {
    return await tagPhotoWithGemini(base64, mimeType)
  } catch (error) {
    console.error('Gemini tagging failed:', error)
    return null // Let the upload continue with empty tags — user fills manually
  }
}
```

---

## Cost Management

- `gemini-2.0-flash` is cheap but not free — don't call it more than once per photo
- Cache results: store the Gemini output in the `photos` table immediately, never re-tag
- Don't call Gemini for thumbnail previews or re-uploads of the same photo
- Batch: process photos sequentially not in parallel to avoid rate limits

---

## Common Mistakes
- **Never parse JSON without stripping markdown fences first** — Gemini adds backticks despite being told not to
- **Never trust the category value blindly** — always validate it's one of the three allowed values
- **Never call from client components** — API key exposure
- **Never await multiple Gemini calls in parallel for the same user** — rate limits will bite you
