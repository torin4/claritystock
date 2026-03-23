import { createClient } from '@/lib/supabase/server'
import { getCollections } from '@/lib/queries/collections.queries'
import BrowseClient from '@/components/browse/BrowseClient'

export default async function BrowsePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch initial data (no filters — client handles filtering)
  const [photosRes, collections] = await Promise.all([
    supabase
      .from('photos')
      .select('*, photographer:users!photographer_id(id, name, initials), collection:collections!collection_id(id, name, category)')
      .order('created_at', { ascending: false })
      .limit(60),
    getCollections(supabase),
  ])

  // Fetch user's downloads and favorites for initial state
  const [downloadsRes, favoritesRes] = user ? await Promise.all([
    supabase.from('downloads').select('photo_id').eq('downloaded_by', user.id),
    supabase.from('favorites').select('photo_id').eq('user_id', user.id),
  ]) : [{ data: [] }, { data: [] }]

  const myDownloadIds = new Set((downloadsRes.data ?? []).map((d: { photo_id: string }) => d.photo_id))
  const myFavIds = new Set((favoritesRes.data ?? []).map((f: { photo_id: string }) => f.photo_id))

  const photos = (photosRes.data ?? []).map((p: Record<string, unknown>) => ({
    ...p,
    is_downloaded_by_me: myDownloadIds.has(p.id as string),
    is_favorited: myFavIds.has(p.id as string),
  }))

  return (
    <BrowseClient
      initialPhotos={photos as never}
      collections={collections as never}
      userId={user?.id ?? ''}
    />
  )
}
