import { createClient } from '@/lib/supabase/server'
import { attachSignedCollectionPreviewUrls, attachSignedThumbnailUrls } from '@/lib/photos/serverSignedUrls'
import { getMyPhotosPage } from '@/lib/queries/photos.queries'
import { getMyCollections } from '@/lib/queries/collections.queries'
import { MY_LIBRARY_PAGE_SIZE } from '@/lib/queries/photoSelects'
import { getServerProfile, getServerUser } from '@/lib/supabase/request-context'
import MyPhotosClient from '@/components/my-photos/MyPhotosClient'
import { redirect } from 'next/navigation'

const INITIAL_GRID_THUMBNAILS = 18
const INITIAL_COLLECTION_PREVIEWS = 12

export default async function MyPhotosPage() {
  const supabase = createClient()
  const user = await getServerUser()
  if (!user) redirect('/login')

  const profile = await getServerProfile()
  const libraryPhotographer = profile
    ? {
        id: user.id,
        name: profile.name,
        initials: profile.initials,
        avatar_url: profile.avatar_url,
      }
    : null

  const [{ photos, total }, collections] = await Promise.all([
    getMyPhotosPage(supabase, user.id, {
      photographer: libraryPhotographer,
      limit: MY_LIBRARY_PAGE_SIZE,
    }),
    getMyCollections(supabase, user.id),
  ])
  const [initialPhotos, initialCollections] = await Promise.all([
    attachSignedThumbnailUrls(photos, { limit: INITIAL_GRID_THUMBNAILS }),
    attachSignedCollectionPreviewUrls(collections, {
      limitCollections: INITIAL_COLLECTION_PREVIEWS,
      photosPerCollection: 3,
    }),
  ])

  return (
    <MyPhotosClient
      initialPhotos={initialPhotos as never}
      initialTotalPhotos={total}
      collections={initialCollections as never}
      pageSize={MY_LIBRARY_PAGE_SIZE}
      userId={user.id}
      libraryPhotographer={libraryPhotographer}
    />
  )
}
