import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { attachSignedCollectionPreviewUrls, attachSignedThumbnailUrls } from '@/lib/photos/serverSignedUrls'
import { getMyPhotosPage } from '@/lib/queries/photos.queries'
import { getMyCollections } from '@/lib/queries/collections.queries'
import { MY_LIBRARY_PAGE_SIZE } from '@/lib/queries/photoSelects'
import { getAdminUsersWithPhotoCounts } from '@/lib/queries/admin.queries'
import MyPhotosClient from '@/components/my-photos/MyPhotosClient'
import AdminPhotographerLibraryPicker from '@/components/admin/AdminPhotographerLibraryPicker'

const INITIAL_GRID_THUMBNAILS = 18
const INITIAL_COLLECTION_PREVIEWS = 12

export default async function AdminLibrariesPage({
  searchParams,
}: {
  searchParams: { photographer?: string }
}) {
  const supabase = createClient()
  const userRows = await getAdminUsersWithPhotoCounts(supabase)
  const photographers = userRows.map(u => ({
    id: u.id,
    name: u.name,
    initials: u.initials,
    libraryPhotos: u.libraryPhotos,
  }))

  const requested = searchParams.photographer
  const validIds = new Set(photographers.map(p => p.id))

  if (photographers.length) {
    if (!requested || !validIds.has(requested)) {
      redirect(`/admin/libraries?photographer=${encodeURIComponent(photographers[0].id)}`)
    }
  }

  const photographerId =
    photographers.length && requested && validIds.has(requested) ? requested : ''

  if (!photographerId) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
        No team members yet. After someone signs in, they’ll appear here.
      </div>
    )
  }

  const { data: prof } = await supabase
    .from('users')
    .select('id, name, initials, avatar_url')
    .eq('id', photographerId)
    .maybeSingle()

  const libraryPhotographer = prof
    ? {
        id: prof.id,
        name: prof.name,
        initials: prof.initials,
        avatar_url: prof.avatar_url,
      }
    : null

  const [{ photos, total }, collections] = await Promise.all([
    getMyPhotosPage(supabase, photographerId, {
      photographer: libraryPhotographer,
      limit: MY_LIBRARY_PAGE_SIZE,
    }),
    getMyCollections(supabase, photographerId),
  ])
  const [initialPhotos, initialCollections] = await Promise.all([
    attachSignedThumbnailUrls(photos, { limit: INITIAL_GRID_THUMBNAILS }),
    attachSignedCollectionPreviewUrls(collections, {
      limitCollections: INITIAL_COLLECTION_PREVIEWS,
      photosPerCollection: 3,
    }),
  ])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AdminPhotographerLibraryPicker photographers={photographers} selectedId={photographerId} />
      <MyPhotosClient
        initialPhotos={initialPhotos as never}
        initialTotalPhotos={total}
        collections={initialCollections as never}
        pageSize={MY_LIBRARY_PAGE_SIZE}
        userId={photographerId}
        libraryPhotographer={libraryPhotographer}
        adminMode
      />
    </div>
  )
}
