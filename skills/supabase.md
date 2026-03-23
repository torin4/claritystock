# Supabase Skill — Clarity Stock

## Stack
- Supabase (Postgres + Auth + Storage + Realtime)
- Next.js 14 App Router
- TypeScript

---

## Client Setup

### Two clients — always use the right one

```ts
// lib/supabase/client.ts — browser client (use in client components)
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// lib/supabase/server.ts — server client (use in server components, API routes, server actions)
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) { return cookieStore.get(name)?.value },
        set(name, value, options) { cookieStore.set({ name, value, ...options }) },
        remove(name, options) { cookieStore.set({ name, value: '', ...options }) },
      },
    }
  )
}

// lib/supabase/admin.ts — service role client (server-side only, never expose to browser)
import { createClient } from '@supabase/supabase-js'

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
```

**Rules:**
- NEVER use the service role key in client components
- NEVER use the browser client in server components
- Always use the server client in Server Actions

---

## Auth — Google OAuth + Domain Restriction

```ts
// app/auth/callback/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      const email = data.user.email ?? ''

      // Domain restriction — only @claritynw.com allowed
      if (!email.endsWith('@claritynw.com')) {
        await supabase.auth.signOut()
        return NextResponse.redirect(`${origin}/login?error=unauthorized_domain`)
      }

      // Auto-create user profile on first login
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('id', data.user.id)
        .single()

      if (!existingUser) {
        const name = data.user.user_metadata?.full_name ?? email.split('@')[0]
        const initials = name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)

        await supabase.from('users').insert({
          id: data.user.id,
          name,
          initials,
          role: 'photographer',
          avatar_url: data.user.user_metadata?.avatar_url,
        })
      }

      return NextResponse.redirect(`${origin}/`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
```

```ts
// Trigger Google OAuth login
const supabase = createClient()
await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: `${window.location.origin}/auth/callback`,
    hd: 'claritynw.com', // hint to Google to show workspace accounts
  },
})
```

---

## Database Queries

### Photos — Browse with filters
```ts
let query = supabase
  .from('photos')
  .select(`
    *,
    photographer:users(id, name, initials, avatar_url),
    collection:collections(id, name, category)
  `)

if (category && category !== 'all') query = query.eq('category', category)
if (neighborhood) query = query.eq('neighborhood', neighborhood)
if (collectionId) query = query.eq('collection_id', collectionId)
if (search) query = query.textSearch('search_vector', search) // requires search vector column
if (sort === 'most_used') query = query.order('downloads_count', { ascending: false })
else query = query.order('created_at', { ascending: false })

const { data, error } = await query
```

### Photos — Full text search setup
```sql
-- Run in Supabase SQL editor
alter table photos add column search_vector tsvector
  generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(neighborhood, '') || ' ' || coalesce(array_to_string(tags, ' '), ''))
  ) stored;

create index photos_search_idx on photos using gin(search_vector);
```

### Downloads — log a download
```ts
const supabase = createClient()

// Insert download record
const { error } = await supabase.from('downloads').insert({
  photo_id: photoId,
  downloaded_by: user.id,
})

// Increment count (use RPC to avoid race conditions)
await supabase.rpc('increment_downloads', { photo_id: photoId })
```

```sql
-- Create the RPC function in Supabase
create or replace function increment_downloads(photo_id uuid)
returns void as $$
  update photos set downloads_count = downloads_count + 1 where id = photo_id;
$$ language sql security definer;
```

### Favorites — toggle
```ts
const supabase = createClient()

const { data: existing } = await supabase
  .from('favorites')
  .select('id')
  .eq('photo_id', photoId)
  .eq('user_id', userId)
  .single()

if (existing) {
  await supabase.from('favorites').delete().eq('id', existing.id)
} else {
  await supabase.from('favorites').insert({ photo_id: photoId, user_id: userId })
}
```

---

## Storage

### Upload photo
```ts
const supabase = createClient()

const fileExt = file.name.split('.').pop()
const fileName = `${userId}/${Date.now()}.${fileExt}`

const { data, error } = await supabase.storage
  .from('photos')
  .upload(fileName, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  })

if (error) throw error

// Get public URL
const { data: { publicUrl } } = supabase.storage
  .from('photos')
  .getPublicUrl(fileName)
```

### Storage bucket setup (run once in Supabase dashboard)
```sql
-- Public read, authenticated write
insert into storage.buckets (id, name, public) values ('photos', 'photos', true);

create policy "photos_read" on storage.objects for select using (bucket_id = 'photos');
create policy "photos_upload" on storage.objects for insert
  with check (bucket_id = 'photos' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "photos_delete" on storage.objects for delete
  using (bucket_id = 'photos' and auth.uid()::text = (storage.foldername(name))[1]);
```

---

## Realtime — Notifications

```ts
// Subscribe to downloads of current user's photos
const supabase = createClient()

const channel = supabase
  .channel('my-photo-downloads')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'downloads',
    },
    async (payload) => {
      // Check if the downloaded photo belongs to current user
      const { data: photo } = await supabase
        .from('photos')
        .select('photographer_id, title')
        .eq('id', payload.new.photo_id)
        .single()

      if (photo?.photographer_id === currentUserId) {
        // Show notification
        addNotification(photo.title, payload.new.downloaded_by)
      }
    }
  )
  .subscribe()

// Cleanup
return () => supabase.removeChannel(channel)
```

---

## Common Mistakes to Avoid

- **Never call `cookies()` in a client component** — it's server-only
- **Never use the admin client in client components** — service role key will be exposed
- **Always handle `error` from every Supabase call** — never assume success
- **RLS must be enabled on every table** — unenforced tables are a security hole
- **Use `single()` only when you're sure one row exists** — it throws if 0 or 2+ rows returned, use `maybeSingle()` when unsure
- **Supabase Storage paths are case-sensitive** — be consistent with folder naming
- **Don't use `select('*')` on photos** — always specify columns or join relations to avoid over-fetching
