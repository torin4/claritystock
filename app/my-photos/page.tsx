import { createClient } from '@/lib/supabase/server'
import { getMyPhotos } from '@/lib/queries/photos.queries'
import { getMyCollections } from '@/lib/queries/collections.queries'
import MyPhotosClient from '@/components/my-photos/MyPhotosClient'
import { redirect } from 'next/navigation'

export default async function MyPhotosPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [photos, collections] = await Promise.all([
    getMyPhotos(supabase, user.id),
    getMyCollections(supabase, user.id),
  ])

  return (
    <MyPhotosClient
      initialPhotos={photos as never}
      collections={collections as never}
      userId={user.id}
    />
  )
}
