import { createClient } from '@/lib/supabase/server'
import { attachSignedCollectionPreviewUrls, attachSignedThumbnailUrls } from '@/lib/photos/serverSignedUrls'
import { getCollections } from '@/lib/queries/collections.queries'
import { BROWSE_PAGE_SIZE, PHOTO_CARD_SELECT } from '@/lib/queries/photoSelects'
import { getServerUser } from '@/lib/supabase/request-context'
import type { Photo } from '@/lib/types/database.types'
import BrowseClient from '@/components/browse/BrowseClient'

const INITIAL_GRID_THUMBNAILS = 18
const INITIAL_COLLECTION_PREVIEWS = 12

export default async function BrowsePage() {
  const supabase = createClient()
  const user = await getServerUser()
  const uid = user?.id

  const [photosRes, collections] = await Promise.all([
    supabase
      .from('photos')
      .select(PHOTO_CARD_SELECT)
      .order('created_at', { ascending: false })
      .limit(BROWSE_PAGE_SIZE),
    getCollections(supabase, { excludeCreatedBy: uid ?? null }),
  ])

  const initialIds = (photosRes.data ?? []).map((p: { id: string }) => p.id)
  const [downloadsRes, favoritesRes] = uid && initialIds.length
    ? await Promise.all([
        supabase.from('downloads').select('photo_id').eq('downloaded_by', uid).in('photo_id', initialIds),
        supabase.from('favorites').select('photo_id').eq('user_id', uid).in('photo_id', initialIds),
      ])
    : [{ data: [] as { photo_id: string }[] }, { data: [] as { photo_id: string }[] }]

  const myDownloadIds = new Set((downloadsRes.data ?? []).map((d: { photo_id: string }) => d.photo_id))
  const myFavIds = new Set((favoritesRes.data ?? []).map((f: { photo_id: string }) => f.photo_id))

  const photos = (photosRes.data ?? []).map((p: Record<string, unknown>) => ({
    ...p,
    is_downloaded_by_me: myDownloadIds.has(p.id as string),
    is_favorited: myFavIds.has(p.id as string),
  })) as Photo[]
  const [initialPhotos, initialCollections] = await Promise.all([
    attachSignedThumbnailUrls(photos, { limit: INITIAL_GRID_THUMBNAILS }),
    attachSignedCollectionPreviewUrls(collections, {
      limitCollections: INITIAL_COLLECTION_PREVIEWS,
      photosPerCollection: 3,
    }),
  ])

  return (
    <BrowseClient
      initialPhotos={initialPhotos as never}
      collections={initialCollections as never}
      userId={user?.id ?? ''}
    />
  )
}
