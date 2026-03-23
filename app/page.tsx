import { createClient } from '@/lib/supabase/server'
import { getCollections } from '@/lib/queries/collections.queries'
import BrowseClient from '@/components/browse/BrowseClient'

export default async function BrowsePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user?.id

  // One round-trip batch: photos + collections + downloads + favorites (was: photos+collections, then downloads+favorites)
  const [photosRes, collections, downloadsRes, favoritesRes] = await Promise.all([
    supabase
      .from('photos')
      .select('*, photographer:users!photographer_id(id, name, initials), collection:collections!collection_id(id, name, category)')
      .order('created_at', { ascending: false })
      .limit(60),
    getCollections(supabase),
    uid
      ? supabase.from('downloads').select('photo_id').eq('downloaded_by', uid)
      : Promise.resolve({ data: [] as { photo_id: string }[], error: null }),
    uid
      ? supabase.from('favorites').select('photo_id').eq('user_id', uid)
      : Promise.resolve({ data: [] as { photo_id: string }[], error: null }),
  ])

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
