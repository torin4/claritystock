# Upload Pipeline Skill — Clarity Stock

## Overview
The upload flow is the most complex feature in Clarity Stock. It runs a sequential pipeline per photo: EXIF extraction → reverse geocoding → Gemini tagging → user review → Supabase Storage upload → database insert.

---

## Full Pipeline Sequence

```
User selects files
       ↓
Client: extract EXIF GPS with exifr
       ↓
Client → API: POST /api/geocode (if GPS found)
       ↓
Client → API: POST /api/tag-photo (Gemini Vision)
       ↓
UI: show filmstrip with pre-filled form per photo
User reviews and edits title, tags, category, collection, neighborhood
       ↓
Client → API: POST /api/upload-photo
  - Upload file to Supabase Storage
  - INSERT into photos table
       ↓
Success: show confirmation, update library
```

---

## Step 1 — EXIF Extraction (client-side)

```ts
// Install: npm install exifr
import exifr from 'exifr'

export interface ExifData {
  lat: number | null
  lng: number | null
  capturedDate: string | null
}

export async function extractExif(file: File): Promise<ExifData> {
  try {
    const exif = await exifr.parse(file, {
      gps: true,
      pick: ['GPSLatitude', 'GPSLongitude', 'DateTimeOriginal'],
    })

    return {
      lat: exif?.latitude ?? null,
      lng: exif?.longitude ?? null,
      capturedDate: exif?.DateTimeOriginal
        ? new Date(exif.DateTimeOriginal).toISOString().split('T')[0]
        : null,
    }
  } catch {
    return { lat: null, lng: null, capturedDate: null }
  }
}
```

---

## Step 2 — Reverse Geocoding (API route)

```ts
// app/api/geocode/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const { lat, lng } = await request.json()

  if (!lat || !lng) return NextResponse.json({ neighborhood: null, subarea: null })

  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${process.env.GOOGLE_MAPS_API_KEY}`
  const res = await fetch(url)
  const data = await res.json()

  if (data.status !== 'OK') return NextResponse.json({ neighborhood: null, subarea: null })

  const components = data.results[0]?.address_components ?? []

  // Extract neighborhood and city
  const neighborhood = components.find((c: any) =>
    c.types.includes('neighborhood') || c.types.includes('sublocality_level_1')
  )?.long_name ?? null

  const city = components.find((c: any) =>
    c.types.includes('locality')
  )?.long_name ?? null

  return NextResponse.json({
    neighborhood: city ?? neighborhood,   // Use city as primary (Kirkland, Bellevue, Seattle)
    subarea: neighborhood !== city ? neighborhood : null,
  })
}
```

---

## Step 3 — Gemini Tagging
See `gemini.md` skill. Call `/api/tag-photo` with the file.

---

## Step 4 — Client Upload State

```ts
// hooks/useUploadPipeline.ts
'use client'

import { useState } from 'react'
import { extractExif } from '@/lib/exif'
import type { GeminiTagResult } from '@/lib/gemini'

export interface UploadPhoto {
  file: File
  preview: string            // Object URL for filmstrip preview
  name: string               // AI suggested title (editable)
  tags: string[]             // AI generated (editable)
  category: 'neighborhood' | 'community' | 'amenity'
  collection: string         // collection id or empty
  neighborhood: string
  subarea: string
  lat: number | null
  lng: number | null
  capturedDate: string | null
  reviewed: boolean
  processing: boolean
  error: string | null
}

export function useUploadPipeline() {
  const [photos, setPhotos] = useState<UploadPhoto[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [step, setStep] = useState<1 | 2 | 3>(1)

  async function processFiles(files: FileList) {
    const initial: UploadPhoto[] = Array.from(files).map(file => ({
      file,
      preview: URL.createObjectURL(file),
      name: file.name.replace(/\.[^/.]+$/, ''),
      tags: [],
      category: 'neighborhood',
      collection: '',
      neighborhood: '',
      subarea: '',
      lat: null,
      lng: null,
      capturedDate: null,
      reviewed: false,
      processing: true,
      error: null,
    }))

    setPhotos(initial)
    setStep(2)

    // Process each file sequentially
    for (let i = 0; i < initial.length; i++) {
      const file = initial[i].file

      // EXIF
      const exif = await extractExif(file)

      // Geocode
      let neighborhood = ''
      let subarea = ''
      if (exif.lat && exif.lng) {
        const geoRes = await fetch('/api/geocode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: exif.lat, lng: exif.lng }),
        })
        const geo = await geoRes.json()
        neighborhood = geo.neighborhood ?? ''
        subarea = geo.subarea ?? ''
      }

      // Gemini tagging
      let aiResult: GeminiTagResult | null = null
      try {
        const form = new FormData()
        form.append('file', file)
        const tagRes = await fetch('/api/tag-photo', { method: 'POST', body: form })
        aiResult = await tagRes.json()
      } catch {
        // Continue without AI tags — user fills manually
      }

      setPhotos(prev => prev.map((p, idx) =>
        idx === i ? {
          ...p,
          name: aiResult?.title ?? p.name,
          tags: aiResult?.tags ?? [],
          category: aiResult?.category ?? 'neighborhood',
          neighborhood,
          subarea,
          lat: exif.lat,
          lng: exif.lng,
          capturedDate: exif.capturedDate,
          processing: false,
        } : p
      ))
    }
  }

  return { photos, setPhotos, currentIndex, setCurrentIndex, step, setStep, processFiles }
}
```

---

## Step 5 — Supabase Storage Upload + DB Insert

```ts
// app/api/upload-photo/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File
  const metadata = JSON.parse(formData.get('metadata') as string)

  // Upload to Supabase Storage
  const ext = file.name.split('.').pop()
  const path = `${user.id}/${Date.now()}.${ext}`

  const { error: storageError } = await supabase.storage
    .from('photos')
    .upload(path, file, { contentType: file.type, cacheControl: '3600' })

  if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 })

  const { data: { publicUrl } } = supabase.storage.from('photos').getPublicUrl(path)

  // Insert into database
  const { data, error: dbError } = await supabase.from('photos').insert({
    title: metadata.title,
    photographer_id: user.id,
    collection_id: metadata.collectionId || null,
    category: metadata.category,
    neighborhood: metadata.neighborhood,
    subarea: metadata.subarea || null,
    lat: metadata.lat || null,
    lng: metadata.lng || null,
    captured_date: metadata.capturedDate || null,
    tags: metadata.tags,
    notes: metadata.notes || null,
    description: metadata.description || null,
    storage_path: path,
  }).select().single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  return NextResponse.json({ photo: data, publicUrl })
}
```

---

## Rules
- **Always process files sequentially** — parallel Gemini calls hit rate limits
- **Never block the UI** — show processing state per photo in the filmstrip, let the user see progress
- **Always allow manual override** — AI suggestions are pre-fills, never locked
- **Always handle Gemini failure gracefully** — upload must still work even if AI tagging fails
- **Clean up object URLs** — call `URL.revokeObjectURL()` after upload completes
- **Validate file types client-side** — accept only `image/jpeg` and `image/png`
- **Max file size**: 50MB per file — validate before processing
