import { createClient } from '@/lib/supabase/server'
import { getMyPhotos } from '@/lib/queries/photos.queries'
import { getMyCollections } from '@/lib/queries/collections.queries'
import { getServerProfile, getServerUser } from '@/lib/supabase/request-context'
import MyPhotosClient from '@/components/my-photos/MyPhotosClient'
import { redirect } from 'next/navigation'

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

  const [photos, collections] = await Promise.all([
    getMyPhotos(supabase, user.id, libraryPhotographer),
    getMyCollections(supabase, user.id),
  ])

  return (
    <MyPhotosClient
      initialPhotos={photos as never}
      collections={collections as never}
      userId={user.id}
      libraryPhotographer={libraryPhotographer}
    />
  )
}
