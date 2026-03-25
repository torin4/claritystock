import { createClient } from '@/lib/supabase/server'
import { getSignedPhotoUrl, getSignedPhotoUrls } from '@/lib/photos/serverSignedUrls'
import { getInsightsPageData } from '@/lib/queries/insights.queries'
import { getServerUser } from '@/lib/supabase/request-context'
import InsightsClient from '@/components/insights/InsightsClient'
import { redirect } from 'next/navigation'

export default async function InsightsPage() {
  const supabase = createClient()
  const user = await getServerUser()
  if (!user) redirect('/login')

  const { stats, topPhotos, downloadsByUser, topContributors } = await getInsightsPageData(supabase, user.id)
  const [thumbnailUrls, heroUrl] = await Promise.all([
    getSignedPhotoUrls(topPhotos.map((photo) => photo.thumbnail_path ?? photo.storage_path)),
    getSignedPhotoUrl(topPhotos[0]?.storage_path),
  ])
  const initialTopPhotos = topPhotos.map((photo, index) => {
    const path = photo.thumbnail_path ?? photo.storage_path
    return {
      ...photo,
      thumbnail_url: path ? thumbnailUrls[path] : undefined,
      public_url: index === 0 ? heroUrl ?? undefined : undefined,
    }
  })

  return (
    <InsightsClient
      stats={stats}
      topPhotos={initialTopPhotos as never}
      downloadsByUser={downloadsByUser}
      topContributors={topContributors}
      userId={user.id}
    />
  )
}
