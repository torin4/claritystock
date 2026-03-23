import type { SupabaseClient } from '@supabase/supabase-js'
import type { InsightsStats, DownloadByUser } from '@/lib/types/database.types'

export async function getInsightsStats(
  supabase: SupabaseClient,
  userId: string
): Promise<InsightsStats> {
  const [photosRes, downloadsRes, monthRes, favsRes] = await Promise.all([
    supabase.from('photos').select('id', { count: 'exact', head: true }).eq('photographer_id', userId),
    supabase.from('downloads').select('id', { count: 'exact', head: true })
      .in('photo_id', (await supabase.from('photos').select('id').eq('photographer_id', userId)).data?.map((p: {id: string}) => p.id) ?? []),
    supabase.from('downloads').select('id', { count: 'exact', head: true })
      .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    supabase.from('favorites').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ])

  return {
    totalPhotos: photosRes.count ?? 0,
    totalDownloads: downloadsRes.count ?? 0,
    thisMonthDownloads: monthRes.count ?? 0,
    favoritedCount: favsRes.count ?? 0,
  }
}

export async function getTopPhotos(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('photos')
    .select('id, title, downloads_count, collection:collections!collection_id(name), storage_path, thumbnail_path')
    .eq('photographer_id', userId)
    .order('downloads_count', { ascending: false })
    .limit(5)

  if (error) throw error
  return data ?? []
}

export async function getDownloadsByUser(
  supabase: SupabaseClient,
  userId: string
): Promise<DownloadByUser[]> {
  // Get all photo IDs for this photographer
  const { data: photoIds } = await supabase
    .from('photos')
    .select('id')
    .eq('photographer_id', userId)

  if (!photoIds?.length) return []

  const ids = photoIds.map((p: { id: string }) => p.id)

  const { data, error } = await supabase
    .from('downloads')
    .select('downloaded_by, downloader:users!downloaded_by(id, name, initials)')
    .in('photo_id', ids)

  if (error) throw error

  // Group by downloader
  const counts: Record<string, { userName: string; initials: string; count: number }> = {}
  for (const d of data ?? []) {
    const row = d as unknown as { downloaded_by: string; downloader: { id: string; name: string; initials: string } | null }
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
