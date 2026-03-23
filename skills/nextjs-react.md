# React + Next.js 14 Skill — Clarity Stock

## Stack
- Next.js 14 App Router
- React 18
- TypeScript
- Tailwind CSS
- Supabase SSR

---

## Project Structure

```
clarity-stock/
├── app/
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx
│   ├── (app)/
│   │   ├── layout.tsx          # Sidebar + mobile bar wrapper
│   │   ├── page.tsx            # Browse
│   │   ├── my-photos/
│   │   │   └── page.tsx
│   │   └── insights/
│   │       └── page.tsx
│   ├── auth/
│   │   └── callback/
│   │       └── route.ts
│   └── api/
│       ├── upload/
│       │   └── route.ts        # Gemini tagging endpoint
│       └── geocode/
│           └── route.ts        # Reverse geocoding endpoint
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── MobileBar.tsx
│   │   └── SidebarOverlay.tsx
│   ├── browse/
│   │   ├── PhotoGrid.tsx
│   │   ├── PhotoTile.tsx
│   │   ├── Lightbox.tsx
│   │   ├── FilterDrawer.tsx
│   │   └── CollectionsStrip.tsx
│   ├── my-photos/
│   │   ├── CollectionsView.tsx
│   │   ├── PhotosView.tsx
│   │   └── EditModal.tsx
│   ├── insights/
│   │   ├── HeroBanner.tsx
│   │   ├── StatCards.tsx
│   │   └── BarChart.tsx
│   └── upload/
│       ├── UploadModal.tsx
│       └── FilmstripReview.tsx
├── hooks/
│   ├── usePhotos.ts
│   ├── useDownloads.ts
│   ├── useFavorites.ts
│   └── useNotifications.ts
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   ├── server.ts
│   │   └── admin.ts
│   └── gemini.ts
├── types/
│   └── index.ts
└── middleware.ts               # Auth guard
```

---

## Middleware — Auth Guard

```ts
// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) { return request.cookies.get(name)?.value },
        set(name, value, options) { response.cookies.set({ name, value, ...options }) },
        remove(name, options) { response.cookies.set({ name, value: '', ...options }) },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Redirect unauthenticated users to login
  if (!user && !request.nextUrl.pathname.startsWith('/login') && !request.nextUrl.pathname.startsWith('/auth')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Redirect authenticated users away from login
  if (user && request.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
}
```

---

## Types

```ts
// types/index.ts
export type UserRole = 'photographer' | 'admin'

export interface User {
  id: string
  name: string
  initials: string
  role: UserRole
  avatar_url: string | null
  created_at: string
}

export interface Photo {
  id: string
  title: string
  photographer_id: string
  collection_id: string | null
  category: 'neighborhood' | 'community' | 'amenity'
  neighborhood: string
  subarea: string | null
  lat: number | null
  lng: number | null
  captured_date: string | null
  tags: string[]
  notes: string | null
  description: string | null
  storage_path: string
  thumbnail_path: string | null
  downloads_count: number
  created_at: string
  // Joined
  photographer?: User
  collection?: Collection
}

export interface Collection {
  id: string
  name: string
  category: 'neighborhood' | 'community' | 'amenity'
  created_by: string
  created_at: string
}

export interface Download {
  id: string
  photo_id: string
  downloaded_by: string
  job_ref: string | null
  created_at: string
}

export interface GeminiTagResult {
  title: string
  tags: string[]
  category: 'neighborhood' | 'community' | 'amenity'
  description: string
}
```

---

## App Layout — Sidebar + Mobile

```tsx
// app/(app)/layout.tsx
import { Sidebar } from '@/components/layout/Sidebar'
import { MobileBar } from '@/components/layout/MobileBar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#080807]">
      <Sidebar />
      <main className="flex-1 overflow-y-auto h-screen min-w-0 md:block">
        {children}
      </main>
      <MobileBar />
    </div>
  )
}
```

---

## Server vs Client Components — Rules

**Server Components (default)** — use for:
- Initial data fetching
- Pages that don't need interactivity
- Anything that reads from Supabase on first render

```tsx
// app/page.tsx — Server Component
import { createClient } from '@/lib/supabase/server'

export default async function BrowsePage() {
  const supabase = createClient()
  const { data: photos } = await supabase.from('photos').select('*').order('created_at', { ascending: false })

  return <PhotoGrid initialPhotos={photos ?? []} />
}
```

**Client Components** — use for:
- Any component with `useState`, `useEffect`, event handlers
- Lightbox, modals, filter drawer, upload flow
- Realtime subscriptions

```tsx
'use client' // Always at the top of client components

import { useState } from 'react'
```

**Rules:**
- NEVER fetch data in client components on mount if it can be done in a server component
- Pass server-fetched data as props to client components
- Keep client components as leaf nodes — push them as far down the tree as possible

---

## Data Fetching Pattern

```tsx
// Server component fetches, passes to client component
// app/my-photos/page.tsx
import { createClient } from '@/lib/supabase/server'
import { PhotosView } from '@/components/my-photos/PhotosView'

export default async function MyPhotosPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: photos } = await supabase
    .from('photos')
    .select('*, collection:collections(id, name, category)')
    .eq('photographer_id', user!.id)
    .order('created_at', { ascending: false })

  return <PhotosView initialPhotos={photos ?? []} />
}
```

---

## API Routes — Server-side AI calls

```ts
// app/api/upload/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { tagPhotoWithGemini } from '@/lib/gemini'

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const file = formData.get('file') as File

  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')

  const result = await tagPhotoWithGemini(base64, file.type)

  return NextResponse.json(result)
}
```

---

## Common Mistakes to Avoid

- **Never add `'use client'` to a page that only needs to display data** — keep it a server component and pass data down
- **Never import server-only modules in client components** — `cookies()`, `headers()`, server Supabase client
- **Never put sensitive API keys in `NEXT_PUBLIC_` env vars** — those are exposed to the browser. Gemini key, service role key, Google Maps key all go without `NEXT_PUBLIC_`
- **Always use `next/image`** for photos — handles optimization, lazy loading, and responsive sizing
- **Always use `next/link`** for navigation — never `<a>` tags
- **Don't use `useEffect` for data fetching** — use server components or React Query instead
- **Router cache** — after mutations (upload, delete, edit) call `router.refresh()` to revalidate server component data
