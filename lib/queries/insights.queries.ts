import type { SupabaseClient } from '@supabase/supabase-js'
import type { InsightsStats, DownloadByUser } from '@/lib/types/database.types'

interface InsightPhotoMetricRow {
  id: string
  downloads_count: number | null
}

interface TopPhotoRow {
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

function groupDownloadsByUser(
  rows: Array<{ downloaded_by: string; downloader: { id: string; name: string; initials: string } | null }>,
): DownloadByUser[] {
  const counts: Record<string, { userName: string; initials: string; count: number }> = {}
  for (const row of rows) {
    const u = row.downloader
    if (!u) continue
    const uid = u.id ?? row.downloaded_by
    if (!counts[uid]) counts[uid] = { userName: u.name ?? 'Unknown', initials: u.initials ?? '?', count: 0 }
    counts[uid].count++
  }

  return Object.entries(counts)
    .map(([userId, v]) => ({ userId, userName: v.userName, initials: v.initials, count: v.count }))
    .sort((a, b) => b.count - a.count)
}

export async function getInsightsPageData(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ stats: InsightsStats; topPhotos: TopPhotoRow[]; downloadsByUser: DownloadByUser[] }> {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const [photoMetricsRes, topPhotosRes, favsRes] = await Promise.all([
    supabase.from('photos').select('id, downloads_count').eq('photographer_id', userId),
    supabase
      .from('photos')
      .select('id, title, downloads_count, collection:collections!collection_id(name), storage_path, thumbnail_path')
      .eq('photographer_id', userId)
      .order('downloads_count', { ascending: false })
      .limit(5),
    supabase.from('favorites').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ])
  if (photoMetricsRes.error) throw photoMetricsRes.error
  if (topPhotosRes.error) throw topPhotosRes.error
  if (favsRes.error) throw favsRes.error

  const photoMetrics = (photoMetricsRes.data ?? []) as InsightPhotoMetricRow[]
  const ids = photoMetrics.map((photo) => photo.id)

  const [monthRes, downloadsRes] = ids.length
    ? await Promise.all([
        supabase.from('downloads').select('id', { count: 'exact', head: true }).in('photo_id', ids).gte('created_at', monthStart),
        supabase
          .from('downloads')
          .select('downloaded_by, downloader:users!downloaded_by(id, name, initials)')
          .in('photo_id', ids),
      ])
    : [{ count: 0 }, { data: [] as Array<{ downloaded_by: string; downloader: { id: string; name: string; initials: string } | null }> }]

  if ('error' in monthRes && monthRes.error) throw monthRes.error
  if ('error' in downloadsRes && downloadsRes.error) throw downloadsRes.error

  const topPhotos = ((topPhotosRes.data ?? []) as TopPhotoQueryRow[]).map((photo) => ({
    ...photo,
    collection: Array.isArray(photo.collection) ? (photo.collection[0] ?? null) : (photo.collection ?? null),
  }))

  return {
    stats: {
      totalPhotos: photoMetrics.length,
      totalDownloads: photoMetrics.reduce((sum, photo) => sum + (Number(photo.downloads_count) || 0), 0),
      thisMonthDownloads: monthRes.count ?? 0,
      favoritedCount: favsRes.count ?? 0,
    },
    topPhotos,
    downloadsByUser: groupDownloadsByUser(
      (downloadsRes.data ?? []) as Array<{ downloaded_by: string; downloader: { id: string; name: string; initials: string } | null }>,
    ),
  }
}
