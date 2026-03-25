import { createClient } from '@/lib/supabase/server'
import { getSignedPhotoUrl, getSignedPhotoUrls } from '@/lib/photos/serverSignedUrls'
import { getInsightsPageData, type InsightsRangeData } from '@/lib/queries/insights.queries'
import { getServerUser } from '@/lib/supabase/request-context'
import InsightsClient from '@/components/insights/InsightsClient'
import { redirect } from 'next/navigation'

function enrichRange(
  bundle: InsightsRangeData,
  thumbnailUrls: Record<string, string>,
  heroUrl: string | null,
) {
  return {
    stats: bundle.stats,
    downloadsByUser: bundle.downloadsByUser,
    topPhotos: bundle.topPhotos.map((photo, index) => {
      const path = photo.thumbnail_path ?? photo.storage_path
      return {
        ...photo,
        thumbnail_url: path ? thumbnailUrls[path] : undefined,
        public_url: index === 0 ? heroUrl ?? undefined : undefined,
      }
    }),
  }
}

export default async function InsightsPage() {
  const supabase = createClient()
  const user = await getServerUser()
  if (!user) redirect('/login')

  const { allTime, thisMonth, topContributors } = await getInsightsPageData(supabase, user.id)

  const paths = [
    ...allTime.topPhotos.map((p) => p.thumbnail_path ?? p.storage_path),
    ...thisMonth.topPhotos.map((p) => p.thumbnail_path ?? p.storage_path),
  ].filter((p): p is string => Boolean(p))

  const [thumbnailUrls, heroAllUrl, heroMonthUrl] = await Promise.all([
    getSignedPhotoUrls(paths),
    getSignedPhotoUrl(allTime.topPhotos[0]?.storage_path ?? null),
    getSignedPhotoUrl(thisMonth.topPhotos[0]?.storage_path ?? null),
  ])

  const allTimeEnriched = enrichRange(allTime, thumbnailUrls, heroAllUrl)
  const thisMonthEnriched = enrichRange(thisMonth, thumbnailUrls, heroMonthUrl)

  return (
    <InsightsClient
      allTime={allTimeEnriched}
      thisMonth={thisMonthEnriched}
      topContributors={topContributors}
      userId={user.id}
    />
  )
}
