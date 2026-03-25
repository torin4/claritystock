import type { SupabaseClient } from '@supabase/supabase-js'
import type { InsightsStats, DownloadByUser, TopContributor } from '@/lib/types/database.types'
import { utcThisMonthStartIso } from '@/lib/utils/utcMonth'

interface InsightPhotoMetricRow {
  id: string
  downloads_count: number | null
}

export interface TopPhotoRow {
  id: string
  title: string
  downloads_count: number
  storage_path: string | null
  thumbnail_path?: string | null
  collection?: { name: string } | null
}

type TopPhotoQueryRow = Omit<TopPhotoRow, 'collection'> & {
  collection?: { name: string } | { name: string }[] | null
}

/**
 * Count download rows per downloader. Always keys by `downloaded_by` so rows still count if the
 * `users` join is null (matches admin analytics and keeps bar totals aligned with `downloads_count`).
 */
function groupDownloadsByUser(
  rows: Array<{ downloaded_by: string; downloader: { id: string; name: string; initials: string } | null }>,
): DownloadByUser[] {
  const counts: Record<string, { userName: string; initials: string; count: number }> = {}
  for (const row of rows) {
    const uid = row.downloaded_by
    if (!uid) continue
    const u = row.downloader
    if (!counts[uid]) {
      counts[uid] = {
        userName: u?.name ?? 'Unknown',
        initials: u?.initials ?? '?',
        count: 0,
      }
    }
    counts[uid].count++
  }

  return Object.entries(counts)
    .map(([userId, v]) => ({ userId, userName: v.userName, initials: v.initials, count: v.count }))
    .sort((a, b) => b.count - a.count)
}

type RpcContributorRow = {
  user_id: string
  user_name: string | null
  user_initials: string | null
  photo_count: number | string
  download_uses: number | string
}

function mapTopPhotoRows(rows: TopPhotoQueryRow[]): TopPhotoRow[] {
  return rows.map((photo) => ({
    ...photo,
    collection: Array.isArray(photo.collection) ? (photo.collection[0] ?? null) : (photo.collection ?? null),
  }))
}

export interface InsightsRangeData {
  stats: InsightsStats
  downloadsByUser: DownloadByUser[]
  topPhotos: TopPhotoRow[]
}

export async function getInsightsPageData(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  allTime: InsightsRangeData
  thisMonth: InsightsRangeData
  topContributors: TopContributor[]
}> {
  const monthStart = utcThisMonthStartIso()

  const [
    photoMetricsRes,
    topPhotosAllRes,
    favsAllRes,
    favsMonthRes,
    photosUploadedMonthRes,
    contributorsRes,
  ] = await Promise.all([
    supabase.from('photos').select('id, downloads_count').eq('photographer_id', userId),
    supabase
      .from('photos')
      .select('id, title, downloads_count, collection:collections!collection_id(name), storage_path, thumbnail_path')
      .eq('photographer_id', userId)
      .order('downloads_count', { ascending: false })
      .limit(5),
    supabase.from('favorites').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase
      .from('favorites')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', monthStart),
    supabase
      .from('photos')
      .select('id', { count: 'exact', head: true })
      .eq('photographer_id', userId)
      .gte('created_at', monthStart),
    supabase.rpc('get_top_contributors', { p_limit: 10 }),
  ])

  if (photoMetricsRes.error) throw photoMetricsRes.error
  if (topPhotosAllRes.error) throw topPhotosAllRes.error
  if (favsAllRes.error) throw favsAllRes.error
  if (favsMonthRes.error) throw favsMonthRes.error
  if (photosUploadedMonthRes.error) throw photosUploadedMonthRes.error
  if (contributorsRes.error) throw contributorsRes.error

  const photoMetrics = (photoMetricsRes.data ?? []) as InsightPhotoMetricRow[]
  const ids = photoMetrics.map((photo) => photo.id)

  const emptyDownloads: Array<{
    downloaded_by: string
    downloader: { id: string; name: string; initials: string } | null
  }> = []

  const [monthEventsCountRes, downloadsAllRes, downloadsMonthRes, monthPhotoIdRows] = ids.length
    ? await Promise.all([
        supabase
          .from('downloads')
          .select('id', { count: 'exact', head: true })
          .in('photo_id', ids)
          .gte('created_at', monthStart),
        supabase
          .from('downloads')
          .select('downloaded_by, downloader:users!downloaded_by(id, name, initials)')
          .in('photo_id', ids),
        supabase
          .from('downloads')
          .select('downloaded_by, downloader:users!downloaded_by(id, name, initials)')
          .in('photo_id', ids)
          .gte('created_at', monthStart),
        supabase.from('downloads').select('photo_id').in('photo_id', ids).gte('created_at', monthStart),
      ])
    : [
        { count: 0 },
        { data: emptyDownloads },
        { data: emptyDownloads },
        { data: [] as { photo_id: string }[] },
      ]

  if ('error' in monthEventsCountRes && monthEventsCountRes.error) throw monthEventsCountRes.error
  if (downloadsAllRes.error) throw downloadsAllRes.error
  if (downloadsMonthRes.error) throw downloadsMonthRes.error
  if (ids.length && monthPhotoIdRows.error) throw monthPhotoIdRows.error

  const topPhotosAll = mapTopPhotoRows((topPhotosAllRes.data ?? []) as TopPhotoQueryRow[])

  const tallyMonth = new Map<string, number>()
  for (const row of (monthPhotoIdRows.data ?? []) as { photo_id: string }[]) {
    const pid = row.photo_id
    if (!pid) continue
    tallyMonth.set(pid, (tallyMonth.get(pid) ?? 0) + 1)
  }
  const topMonthIds = Array.from(tallyMonth.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id)

  let topPhotosMonth: TopPhotoRow[] = []
  if (topMonthIds.length) {
    const { data: monthPhotoRows, error: mpErr } = await supabase
      .from('photos')
      .select('id, title, collection:collections!collection_id(name), storage_path, thumbnail_path')
      .in('id', topMonthIds)
    if (mpErr) throw mpErr
    const byId = new Map((monthPhotoRows ?? []).map((r) => [r.id as string, r]))
    topPhotosMonth = topMonthIds.flatMap((id) => {
      const r = byId.get(id)
      if (!r) return []
      const collectionRaw = r.collection as { name: string } | { name: string }[] | null | undefined
      const collection = Array.isArray(collectionRaw)
        ? (collectionRaw[0] ?? null)
        : (collectionRaw ?? null)
      const row: TopPhotoRow = {
        id: r.id as string,
        title: (r.title as string) ?? 'Untitled',
        downloads_count: tallyMonth.get(id) ?? 0,
        storage_path: (r.storage_path as string | null) ?? null,
        thumbnail_path: (r.thumbnail_path as string | null) ?? undefined,
        collection,
      }
      return [row]
    })
  }

  const downloadsAllTyped = (downloadsAllRes.data ?? []) as Array<{
    downloaded_by: string
    downloader: { id: string; name: string; initials: string } | null
  }>
  const downloadsMonthTyped = (downloadsMonthRes.data ?? []) as typeof downloadsAllTyped

  const topContributors: TopContributor[] = ((contributorsRes.data ?? []) as RpcContributorRow[]).map((row) => ({
    userId: row.user_id,
    userName: row.user_name ?? 'Unknown',
    initials: row.user_initials ?? '?',
    photoCount: Number(row.photo_count) || 0,
    downloadUses: Number(row.download_uses) || 0,
  }))

  const monthDownloadEvents = monthEventsCountRes.count ?? 0

  const allTime: InsightsRangeData = {
    stats: {
      totalPhotos: photoMetrics.length,
      totalDownloads: photoMetrics.reduce((sum, photo) => sum + (Number(photo.downloads_count) || 0), 0),
      thisMonthDownloads: monthDownloadEvents,
      favoritedCount: favsAllRes.count ?? 0,
    },
    downloadsByUser: groupDownloadsByUser(downloadsAllTyped),
    topPhotos: topPhotosAll,
  }

  /**
   * This-month slice: stats.thisMonthDownloads is unused (UI uses downloadsByUser.length for “Downloaders”).
   */
  const thisMonth: InsightsRangeData = {
    stats: {
      totalPhotos: photosUploadedMonthRes.count ?? 0,
      totalDownloads: monthDownloadEvents,
      thisMonthDownloads: 0,
      favoritedCount: favsMonthRes.count ?? 0,
    },
    downloadsByUser: groupDownloadsByUser(downloadsMonthTyped),
    topPhotos: topPhotosMonth,
  }

  return { allTime, thisMonth, topContributors }
}
