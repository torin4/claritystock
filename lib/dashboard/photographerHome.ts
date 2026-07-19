import type { SupabaseClient } from '@supabase/supabase-js'
import { getInsightsPageData, type InsightsRangeData } from '@/lib/queries/insights.queries'
import { getSignedPhotoUrl, getSignedPhotoUrls } from '@/lib/photos/serverSignedUrls'
import { utcThisMonthStartIso } from '@/lib/utils/utcMonth'

export type PhotographerHomeState =
  | { kind: 'empty' }
  | { kind: 'seeded'; myPhotos: number; missingLocation: number }
  | { kind: 'thriving' }

/**
 * Decide which photographer Home to render from cheap counts (no heavy bundle):
 *   0 photos            → empty   (onboarding)
 *   photos, 0 uses      → seeded  (get-discovered coaching)
 *   photos with uses    → thriving (full analytics)
 * "Missing location" uses the agreed predicate: `neighborhood` is null.
 */
export async function getPhotographerHomeState(
  supabase: SupabaseClient,
  userId: string,
): Promise<PhotographerHomeState> {
  const [photosRes, usedRes, missingLocRes] = await Promise.all([
    supabase.from('photos').select('id', { count: 'exact', head: true }).eq('photographer_id', userId),
    supabase.from('photos').select('id', { count: 'exact', head: true }).eq('photographer_id', userId).gt('downloads_count', 0),
    supabase.from('photos').select('id', { count: 'exact', head: true }).eq('photographer_id', userId).is('neighborhood', null),
  ])
  const myPhotos = photosRes.count ?? 0
  if (myPhotos === 0) return { kind: 'empty' }
  if ((usedRes.count ?? 0) === 0) return { kind: 'seeded', myPhotos, missingLocation: missingLocRes.count ?? 0 }
  return { kind: 'thriving' }
}

/** Library-wide totals for the onboarding social-proof line. */
export async function getLibraryTotals(supabase: SupabaseClient) {
  const monthStart = utcThisMonthStartIso()
  const [photos, members, uses] = await Promise.all([
    supabase.from('photos').select('id', { count: 'exact', head: true }),
    supabase.from('users').select('id', { count: 'exact', head: true }),
    supabase.from('downloads').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
  ])
  return { photos: photos.count ?? 0, members: members.count ?? 0, usesThisMonth: uses.count ?? 0 }
}

/**
 * Data for the photographer Home (Thriving state). This is the exact bundle the
 * retired Insights page produced — Home absorbs Insights, so the loader lives
 * here and the analytics blocks (InsightsClient) are re-mounted inside Home.
 */
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

export async function getPhotographerHomeData(supabase: SupabaseClient, userId: string) {
  const { allTime, thisMonth, topContributors } = await getInsightsPageData(supabase, userId)

  const paths = [
    ...allTime.topPhotos.map((p) => p.thumbnail_path ?? p.storage_path),
    ...thisMonth.topPhotos.map((p) => p.thumbnail_path ?? p.storage_path),
  ].filter((p): p is string => Boolean(p))

  const [thumbnailUrls, heroAllUrl, heroMonthUrl] = await Promise.all([
    getSignedPhotoUrls(paths),
    getSignedPhotoUrl(allTime.topPhotos[0]?.storage_path ?? null),
    getSignedPhotoUrl(thisMonth.topPhotos[0]?.storage_path ?? null),
  ])

  return {
    allTime: enrichRange(allTime, thumbnailUrls, heroAllUrl),
    thisMonth: enrichRange(thisMonth, thumbnailUrls, heroMonthUrl),
    topContributors,
  }
}
