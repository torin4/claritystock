import { createClient } from '@/lib/supabase/server'
import { getMyPhotos, getMyDownloadedPhotos } from '@/lib/queries/photos.queries'
import { getMyCollections } from '@/lib/queries/collections.queries'
import { getServerUser } from '@/lib/supabase/request-context'
import MyPhotosClient from '@/components/my-photos/MyPhotosClient'
import { redirect } from 'next/navigation'

export default async function MyPhotosPage() {
  const supabase = createClient()
  const user = await getServerUser()
  if (!user) redirect('/login')

  const [photos, downloadedPhotos, collections] = await Promise.all([
    getMyPhotos(supabase, user.id),
    getMyDownloadedPhotos(supabase, user.id),
    getMyCollections(supabase, user.id),
  ])

  return (
    <MyPhotosClient
      initialPhotos={photos as never}
      initialDownloadedPhotos={downloadedPhotos as never}
      collections={collections as never}
      userId={user.id}
    />
  )
}
