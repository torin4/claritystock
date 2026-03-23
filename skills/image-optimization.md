# Image Optimization Skill — Clarity Stock

## Context
Clarity Northwest photographers shoot on professional cameras — files are large, high-quality JPEGs, typically 10-40MB. The app needs to handle these gracefully without killing performance.

---

## Client-side Compression Before Upload

Always compress before sending to the server. Target: under 5MB for display, full quality for download.

```ts
// lib/compress-image.ts
export async function compressImage(
  file: File,
  options: { maxWidth?: number; quality?: number } = {}
): Promise<File> {
  const { maxWidth = 2400, quality = 0.82 } = options

  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)

      const canvas = document.createElement('canvas')
      let { width, height } = img

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width)
        width = maxWidth
      }

      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (!blob) return resolve(file) // fallback to original
          resolve(new File([blob], file.name, { type: 'image/jpeg' }))
        },
        'image/jpeg',
        quality
      )
    }

    img.src = url
  })
}
```

### Thumbnail generation
```ts
export async function generateThumbnail(file: File): Promise<File> {
  return compressImage(file, { maxWidth: 400, quality: 0.75 })
}
```

### Usage in upload pipeline
```ts
// Compress before sending to API
const compressed = await compressImage(file, { maxWidth: 2400, quality: 0.82 })
const thumbnail = await generateThumbnail(file)

// Upload both to Supabase Storage
// Store thumbnail_path alongside storage_path in photos table
```

---

## Storage Strategy

```
Supabase Storage bucket: photos
├── {userId}/
│   ├── {timestamp}.jpg          ← full size (compressed to max 2400px)
│   └── {timestamp}_thumb.jpg    ← thumbnail (400px)
```

Always store both paths in the `photos` table:
- `storage_path` — full size, used for download
- `thumbnail_path` — thumbnail, used in grid tiles and filmstrip

---

## Displaying Images with next/image

```tsx
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

function PhotoTile({ photo }: { photo: Photo }) {
  const supabase = createClient()

  const { data: { publicUrl } } = supabase.storage
    .from('photos')
    .getPublicUrl(photo.thumbnail_path ?? photo.storage_path)

  return (
    <div className="relative aspect-square overflow-hidden bg-surface-2">
      <Image
        src={publicUrl}
        alt={photo.title}
        fill
        sizes="(max-width: 768px) 50vw, 33vw"
        className="object-cover"
        loading="lazy"
      />
    </div>
  )
}
```

### Lightbox (full size)
```tsx
<Image
  src={fullSizeUrl}
  alt={photo.title}
  fill
  sizes="(max-width: 768px) 100vw, calc(100vw - 310px)"
  className="object-contain"
  priority // Load immediately in lightbox
/>
```

---

## next/image Config

```ts
// next.config.ts
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

export default nextConfig
```

---

## Download — Full Quality

When a user downloads a photo, serve the original full-size file from Supabase Storage, not the compressed version. Generate a signed URL for download:

```ts
// app/api/download/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { photoId } = await request.json()

  const { data: photo } = await supabase
    .from('photos')
    .select('storage_path, title')
    .eq('id', photoId)
    .single()

  if (!photo) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Signed URL expires in 60 seconds — enough time to trigger download
  const { data } = await supabase.storage
    .from('photos')
    .createSignedUrl(photo.storage_path, 60, {
      download: `${photo.title}.jpg`,
    })

  if (!data) return NextResponse.json({ error: 'Could not generate download URL' }, { status: 500 })

  return NextResponse.json({ url: data.signedUrl })
}
```

Client-side trigger:
```ts
const res = await fetch('/api/download', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ photoId }),
})
const { url } = await res.json()

// Trigger browser download
const a = document.createElement('a')
a.href = url
a.download = photo.title
a.click()
```

---

## File Validation (client-side, before processing)

```ts
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png']
const MAX_SIZE_MB = 50

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return `${file.name}: Only JPEG and PNG files are accepted`
  }
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    return `${file.name}: File must be under ${MAX_SIZE_MB}MB`
  }
  return null
}
```

---

## Rules
- **Always use thumbnails in the grid** — never load full-size photos in the browse view
- **Always use `next/image`** — never raw `<img>` tags for photos
- **Always set `sizes` prop on `next/image`** — required for proper responsive optimization
- **Always compress before upload** — never send raw camera files to the server
- **Always store thumbnail separately** — do not derive thumbnails at request time
- **Use `priority` only on the lightbox image** — not on grid tiles
- **Download uses signed URLs** — never expose raw storage paths for download
