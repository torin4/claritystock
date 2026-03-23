# Clarity Stock — Claude Code Handoff Document

## Overview

Clarity Stock is an internal photo sharing and management platform for the Clarity Northwest Photography team. Photographers upload neighborhood, community, and amenity photos that the whole team can browse, download, and use in real estate packages for clients like Toll Brothers.

The wireframe HTML file (`clarity-v2-full.html`) is the complete UI reference. **Do not change any UI, styling, interactions, or mobile behavior.** Replace all mock data arrays with real Supabase queries.

---

## Account Types

There are two account types: **Photographer** and **Admin**. The admin panel will be built as a separate application later — for now, focus only on the Photographer-facing app.

### Photographer
- Can browse, search, filter, and download all photos in the library
- Can upload their own photos
- Can edit and delete only their own photos
- Can view their own Insights dashboard
- Can manage their own favorites
- Cannot access admin functions

### Admin
- Has all Photographer permissions
- Will additionally manage users, moderate content, and view team-wide analytics (future build)
- For now: store the role in the database and gate admin routes, but do not build the admin UI yet
- Admin accounts are created manually via Supabase dashboard — no self-registration for admins

### Auth Flow
- **Google OAuth only** via Supabase Auth — no email/password login
- Restrict sign-in to `@claritynw.com` Google Workspace accounts only
- Enforce domain restriction server-side in the auth callback — if `email` does not end in `@claritynw.com`, reject the session and redirect to an error page ("Access restricted to Clarity Northwest team members")
- On first successful login, auto-create user profile in `users` table using name and email from Google OAuth payload
- Role is set by an admin in the Supabase dashboard (`role` field on `users` table)
- Default role for new signups: `photographer`
- Redirect after login: Browse page (`/`)
- Unauthenticated users: redirect to login page with Google sign-in button only

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Next.js 14 (App Router) |
| Backend | Next.js API Routes + Server Actions |
| Database | Supabase (Postgres) |
| Auth | Supabase Auth |
| File Storage | Supabase Storage |
| AI Tagging | Gemini Vision (`gemini-2.0-flash`) |
| GPS Extraction | `exifr` (client-side) |
| Reverse Geocoding | Google Maps Geocoding API |
| Styling | Tailwind CSS + shadcn/ui (match existing design system exactly) |

---

## Mobile Requirements

The app must be **fully responsive and production-quality on mobile**. The wireframe already implements mobile layout — replicate it exactly.

### Breakpoints
- Desktop: > 768px — sidebar always visible, full layout
- Mobile: ≤ 768px — sidebar hidden, hamburger menu in fixed top bar

### Mobile-specific behavior
- **Top bar**: Fixed 52px header with Clarity Stock logo centered and hamburger button on the right
- **Sidebar**: Hidden off-screen left by default. Slides in on hamburger tap. Dark overlay (rgba(0,0,0,0.5)) behind it dims the content. Tapping overlay closes the sidebar.
- **Photo grid**: 2 columns on mobile (3 on desktop)
- **Lightbox**: Stacks vertically — image fills top 56vw, scrollable panel below with sticky close header
- **Upload modal**: Full screen starting at 52px from top (below mobile bar), no border radius
- **Edit modal**: Full screen starting at 52px from top, no border radius, fields stack to single column
- **Filter drawer**: 85% width from right, leaving 15% tap-to-close zone on left
- **Settings panel**: Full width slide-in from right
- **All close buttons**: Minimum 40×40px tap target
- **All modal headers**: Sticky so close button is always visible while scrolling
- **Insights hero**: 160px height on mobile
- **Stat cards**: 2 columns on mobile (4 on desktop)
- **Collections grid**: 2 columns on mobile (3 on desktop)

### Touch considerations
- All interactive elements minimum 44px tap target
- No hover-only interactions — ensure touch equivalents exist

---

## Supabase Database Schema

### `users`
```sql
id uuid references auth.users primary key
name text
initials text
role text default 'photographer' -- 'photographer' | 'admin'
avatar_url text
created_at timestamptz default now()
```

### `photos`
```sql
id uuid primary key default gen_random_uuid()
title text not null
photographer_id uuid references users(id)
collection_id uuid references collections(id)
category text -- 'neighborhood' | 'community' | 'amenity'
neighborhood text
subarea text
lat float
lng float
captured_date date
tags text[]
notes text
description text -- AI generated
storage_path text
thumbnail_path text
downloads_count int default 0
created_at timestamptz default now()
```

### `collections`
```sql
id uuid primary key default gen_random_uuid()
name text not null
category text -- 'neighborhood' | 'community' | 'amenity'
created_by uuid references users(id)
created_at timestamptz default now()
```

### `downloads`
```sql
id uuid primary key default gen_random_uuid()
photo_id uuid references photos(id)
downloaded_by uuid references users(id)
job_ref text
created_at timestamptz default now()
```

### `favorites`
```sql
id uuid primary key default gen_random_uuid()
photo_id uuid references photos(id)
user_id uuid references users(id)
created_at timestamptz default now()
unique(photo_id, user_id)
```

### Row Level Security (RLS)

```sql
-- Photos: anyone authenticated can read, only owner can edit/delete
alter table photos enable row level security;
create policy "photos_read" on photos for select using (auth.uid() is not null);
create policy "photos_insert" on photos for insert with check (auth.uid() = photographer_id);
create policy "photos_update" on photos for update using (auth.uid() = photographer_id);
create policy "photos_delete" on photos for delete using (auth.uid() = photographer_id);

-- Downloads: anyone authenticated can insert and read
alter table downloads enable row level security;
create policy "downloads_insert" on downloads for insert with check (auth.uid() = downloaded_by);
create policy "downloads_read" on downloads for select using (auth.uid() is not null);

-- Favorites: own records only
alter table favorites enable row level security;
create policy "favorites_all" on favorites using (auth.uid() = user_id);
```

---

## AI Integration — Upload Flow

### Step 1 — EXIF GPS Extraction (client-side)
```js
import exifr from 'exifr'

const exif = await exifr.parse(file, { gps: true })
const lat = exif?.latitude
const lng = exif?.longitude
```

### Step 2 — Reverse Geocoding (if GPS found)
```js
const res = await fetch(
  `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_KEY}`
)
const data = await res.json()
// Extract neighborhood/city from address_components
// Look for 'neighborhood', 'sublocality', or 'locality' types
```

### Step 3 — Gemini Vision Tagging (server-side)
```js
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

const prompt = `You are a real estate photography assistant for a luxury Pacific Northwest property library.

Analyze this photo and return a JSON object with:
- "title": a short descriptive title (5-8 words, e.g. "Kirkland Marina at golden hour")
- "tags": an array of 5-8 specific, useful tags for real estate use (e.g. ["waterfront", "marina", "golden hour", "Lake Washington", "boat dock"])
- "category": one of "neighborhood", "community", or "amenity"
- "description": one sentence describing the photo for search purposes

Focus on: architectural features, location landmarks, lighting conditions, amenities visible, Pacific Northwest context.
Return only valid JSON, no markdown.`

const result = await model.generateContent([prompt, { inlineData: { data: imageBase64, mimeType: 'image/jpeg' } }])
const json = JSON.parse(result.response.text())
// { title, tags, category, description }
```

### Step 4 — Pre-fill Upload Form
Return AI results to the client to pre-populate title, tags, category, and neighborhood. User reviews and edits before confirming publish.

---

## Pages & Data Mapping

### Browse (`/`)
- Query: `photos` table with filters (category, neighborhood, collection, search, sort)
- Search: Postgres full-text search on `title`, `tags`, `neighborhood`, `collection.name`
- Quick filters: All / Downloaded by me / Not downloaded / Favorites
- Collections strip: `collections` table with photo count

### My Photos (`/my-photos`)
- Query: `photos` where `photographer_id = current_user.id`
- Collections view: group by `collection_id`
- Edit modal: UPDATE `photos` record
- Delete: remove file from Supabase Storage + DELETE from `photos`

### Insights (`/insights`)
- Hero: top photo by `downloads_count` for current user
- Stat cards: COUNT queries on `photos` and `downloads`
- Bar chart: downloads of current user's photos grouped by `downloaded_by`
- Top photos: ORDER BY `downloads_count` DESC

### Upload (modal)
- File input → client-side EXIF extraction → server-side Gemini tagging → pre-filled form
- On confirm: upload file to Supabase Storage, INSERT into `photos`
- Batch upload: process files in sequence, filmstrip UI to review each

### Lightbox (modal)
- Download button: INSERT into `downloads`, increment `photos.downloads_count`
- Job ref log: UPDATE `downloads.job_ref`
- Usage history: SELECT from `downloads` JOIN `users` for this `photo_id`

---

## Notifications
Real-time via Supabase Realtime — subscribe to `downloads` table inserts where the photo's `photographer_id = current_user.id`. Show count badge and list in the notification bell popover in the sidebar.

---

## Environment Variables
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
GOOGLE_MAPS_API_KEY=
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
ALLOWED_EMAIL_DOMAIN=claritynw.com
```

---

## UI Reference
The complete wireframe is in `clarity-v2-full.html`. This is a single self-contained HTML file with all pages, interactions, and mobile behavior implemented with mock data.

**Match every UI decision exactly** — colors, typography (Syne + DM Sans + JetBrains Mono), spacing, animations, and all mobile breakpoints. Do not redesign or simplify anything. The wireframe is the source of truth.
