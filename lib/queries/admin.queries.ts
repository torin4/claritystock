import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AdminTopPhoto,
  AdminUserRow,
  DownloadByUser,
  InsightsStats,
  PhotographerImpact,
  UsageLedgerRow,
} from '@/lib/types/database.types'
import { utcThisMonthStartIso } from '@/lib/utils/utcMonth'

const PAGE = 1000

type DownloaderRow = {
  downloaded_by: string
  downloader: { id: string; name: string | null; initials: string | null } | null
}

async function fetchDownloadRows(supabase: SupabaseClient, sinceIso?: string): Promise<DownloaderRow[]> {
  const out: DownloaderRow[] = []
  let from = 0
  for (;;) {
    let q = supabase
      .from('downloads')
      .select('downloaded_by, downloader:users!downloaded_by(id, name, initials)')
      .range(from, from + PAGE - 1)
    if (sinceIso) q = q.gte('created_at', sinceIso)
    const { data, error } = await q
    if (error) throw error
    const rows = (data ?? []) as unknown as DownloaderRow[]
    out.push(...rows)
    if (rows.length < PAGE) break
    from += PAGE
  }
  return out
}

type DownloadPhotoRow = {
  photo_id: string
  photo: {
    photographer_id: string | null
    photographer: { name: string | null; initials: string | null } | null
  } | null
}

async function fetchDownloadsWithPhotographer(
  supabase: SupabaseClient,
  sinceIso?: string,
): Promise<DownloadPhotoRow[]> {
  const out: DownloadPhotoRow[] = []
  let from = 0
  for (;;) {
    let q = supabase
      .from('downloads')
      .select(
        `photo_id,
        photo:photos!photo_id(photographer_id, photographer:users!photographer_id(name, initials))`,
      )
      .range(from, from + PAGE - 1)
    if (sinceIso) q = q.gte('created_at', sinceIso)
    const { data, error } = await q
    if (error) throw error
    const rows = (data ?? []) as unknown as DownloadPhotoRow[]
    out.push(...rows)
    if (rows.length < PAGE) break
    from += PAGE
  }
  return out
}

function aggregatePhotographerImpactFromDownloadRows(rows: DownloadPhotoRow[]): PhotographerImpact[] {
  type Acc = { impact: PhotographerImpact; distinctPhotos: Set<string> }
  const map = new Map<string, Acc>()
  for (const row of rows) {
    const photo = row.photo
    const uid = photo?.photographer_id
    if (!uid) continue
    const ph = photo.photographer
    let acc = map.get(uid)
    if (!acc) {
      acc = {
        impact: {
          userId: uid,
          userName: ph?.name ?? 'Unknown',
          initials: ph?.initials ?? '?',
          downloadUses: 0,
          photoCount: 0,
        },
        distinctPhotos: new Set(),
      }
      map.set(uid, acc)
    }
    acc.impact.downloadUses += 1
    acc.distinctPhotos.add(row.photo_id)
    if (ph?.name) acc.impact.userName = ph.name
    if (ph?.initials) acc.impact.initials = ph.initials
  }
  return Array.from(map.values())
    .map(({ impact, distinctPhotos }) => ({
      ...impact,
      photoCount: distinctPhotos.size,
    }))
    .sort((a, b) => b.downloadUses - a.downloadUses)
}

/** Team-wide library stats (parallel to personal Insights). */
export async function getAdminLibraryStats(supabase: SupabaseClient): Promise<InsightsStats> {
  const monthStart = utcThisMonthStartIso()
  const [photosRes, downloadsRes, monthDlRes, favsRes] = await Promise.all([
    supabase.from('photos').select('id', { count: 'exact', head: true }),
    supabase.from('downloads').select('id', { count: 'exact', head: true }),
    supabase.from('downloads').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
    supabase.from('favorites').select('id', { count: 'exact', head: true }),
  ])

  /**
   * totalDownloads = COUNT(downloads): one per download event; should match SUM(photos.downloads_count)
   * when counters and rows stay in sync via record_download / remove_my_downloads.
   */
  return {
    totalPhotos: photosRes.count ?? 0,
    totalDownloads: downloadsRes.count ?? 0,
    thisMonthDownloads: monthDlRes.count ?? 0,
    favoritedCount: favsRes.count ?? 0,
  }
}

/** UTC calendar month slice (aligned with Insights). */
export async function getAdminLibraryStatsThisMonth(supabase: SupabaseClient): Promise<InsightsStats> {
  const monthStart = utcThisMonthStartIso()
  const [photosRes, downloadsRes, favsRes] = await Promise.all([
    supabase.from('photos').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
    supabase.from('downloads').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
    supabase.from('favorites').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
  ])
  return {
    totalPhotos: photosRes.count ?? 0,
    totalDownloads: downloadsRes.count ?? 0,
    thisMonthDownloads: 0,
    favoritedCount: favsRes.count ?? 0,
  }
}

export interface AdminAnalyticsRangeData {
  stats: InsightsStats
  topPhotos: AdminTopPhoto[]
  downloadsByDownloader: DownloadByUser[]
  photographerImpact: PhotographerImpact[]
}

export async function getAdminAnalyticsAllTime(supabase: SupabaseClient): Promise<AdminAnalyticsRangeData> {
  const [stats, topPhotos, downloadsByDownloader, photographerImpact] = await Promise.all([
    getAdminLibraryStats(supabase),
    getAdminTopPhotos(supabase, 8),
    getAdminDownloadsByDownloader(supabase),
    getAdminPhotographerImpact(supabase),
  ])
  return { stats, topPhotos, downloadsByDownloader, photographerImpact }
}

export async function getAdminAnalyticsThisMonth(supabase: SupabaseClient): Promise<AdminAnalyticsRangeData> {
  const monthStart = utcThisMonthStartIso()
  const [stats, topPhotos, downloadsByDownloader, photographerImpact] = await Promise.all([
    getAdminLibraryStatsThisMonth(supabase),
    getAdminTopPhotosThisMonth(supabase, 8),
    getAdminDownloadsByDownloader(supabase, monthStart),
    getAdminPhotographerImpactSince(supabase, monthStart),
  ])
  return { stats, topPhotos, downloadsByDownloader, photographerImpact }
}

/** Top photos in the whole library by downloads_count. */
export async function getAdminTopPhotos(supabase: SupabaseClient, limit = 8): Promise<AdminTopPhoto[]> {
  const { data, error } = await supabase
    .from('photos')
    .select(
      'id, title, downloads_count, storage_path, thumbnail_path, photographer:users!photographer_id(name, initials), collection:collections!collection_id(name)',
    )
    .order('downloads_count', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []) as unknown as AdminTopPhoto[]
}

export async function getAdminPhotographerImpactSince(
  supabase: SupabaseClient,
  sinceIso: string,
): Promise<PhotographerImpact[]> {
  const rows = await fetchDownloadsWithPhotographer(supabase, sinceIso)
  return aggregatePhotographerImpactFromDownloadRows(rows)
}

/** Top photos by download events in the current UTC month (DB aggregate + photo hydrate). */
export async function getAdminTopPhotosThisMonth(
  supabase: SupabaseClient,
  limit: number,
): Promise<AdminTopPhoto[]> {
  const monthStart = utcThisMonthStartIso()
  const { data: aggRows, error } = await supabase.rpc('get_top_photo_download_counts_since', {
    p_since: monthStart,
    p_limit: limit,
  })
  if (error) throw error

  type AggRow = { photo_id: string; download_events: number }
  const rows = (aggRows ?? []) as AggRow[]
  const tally = new Map(rows.map((r) => [r.photo_id, Number(r.download_events)]))
  const topIds = rows.map((r) => r.photo_id)
  if (!topIds.length) return []

  const { data: photos, error: pErr } = await supabase
    .from('photos')
    .select(
      'id, title, storage_path, thumbnail_path, photographer:users!photographer_id(name, initials), collection:collections!collection_id(name)',
    )
    .in('id', topIds)
  if (pErr) throw pErr

  const byId = new Map((photos ?? []).map((p) => [p.id as string, p]))
  return topIds.flatMap((id) => {
    const p = byId.get(id)
    if (!p) return []
    const collectionRaw = p.collection as { name: string } | { name: string }[] | null | undefined
    const collection = Array.isArray(collectionRaw) ? (collectionRaw[0] ?? null) : (collectionRaw ?? null)
    const row: AdminTopPhoto = {
      id: p.id as string,
      title: (p.title as string) ?? 'Untitled',
      downloads_count: tally.get(id) ?? 0,
      storage_path: (p.storage_path as string | null) ?? null,
      thumbnail_path: (p.thumbnail_path as string | null) ?? undefined,
      photographer: p.photographer as unknown as AdminTopPhoto['photographer'],
      collection: collection ?? undefined,
    }
    return [row]
  })
}

/** All download events grouped by who downloaded (team usage). */
export async function getAdminDownloadsByDownloader(
  supabase: SupabaseClient,
  sinceIso?: string,
): Promise<DownloadByUser[]> {
  const rows = await fetchDownloadRows(supabase, sinceIso)
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

/** Per-photographer: how many library photos and total reported uses (sum of downloads_count). */
export async function getAdminPhotographerImpact(supabase: SupabaseClient): Promise<PhotographerImpact[]> {
  const map = new Map<string, PhotographerImpact>()
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('photos')
      .select('photographer_id, downloads_count, photographer:users!photographer_id(name, initials)')
      .not('photographer_id', 'is', null)
      .range(from, from + PAGE - 1)
    if (error) throw error
    const rows = data ?? []
    for (const row of rows) {
      const pid = row.photographer_id as string
      const ph = row.photographer as unknown as { name: string | null; initials: string | null } | null
      const existing = map.get(pid) ?? {
        userId: pid,
        userName: ph?.name ?? 'Unknown',
        initials: ph?.initials ?? '?',
        downloadUses: 0,
        photoCount: 0,
      }
      existing.downloadUses += Number(row.downloads_count) || 0
      existing.photoCount += 1
      if (ph?.name) existing.userName = ph.name
      if (ph?.initials) existing.initials = ph.initials
      map.set(pid, existing)
    }
    if (rows.length < PAGE) break
    from += PAGE
  }
  return Array.from(map.values()).sort((a, b) => b.downloadUses - a.downloadUses)
}

/** Roster + library photo counts per user (for admin table). */
export async function getAdminUsersWithPhotoCounts(supabase: SupabaseClient): Promise<AdminUserRow[]> {
  const { data: users, error: uErr } = await supabase
    .from('users')
    .select('id, name, initials, role, created_at, email')
    .order('name', { ascending: true, nullsFirst: false })
  if (uErr) throw uErr

  const photos: { photographer_id: string | null }[] = []
  let from = 0
  for (;;) {
    const { data, error: pErr } = await supabase
      .from('photos')
      .select('photographer_id')
      .range(from, from + PAGE - 1)
    if (pErr) throw pErr
    const rows = data ?? []
    photos.push(...rows)
    if (rows.length < PAGE) break
    from += PAGE
  }

  const byPhotographer = new Map<string, number>()
  for (const row of photos) {
    const pid = row.photographer_id as string | null
    if (!pid) continue
    byPhotographer.set(pid, (byPhotographer.get(pid) ?? 0) + 1)
  }

  return (users ?? []).map(u => ({
    id: u.id,
    name: u.name,
    initials: u.initials,
    role: u.role,
    created_at: u.created_at,
    email: (u as { email?: string | null }).email ?? null,
    libraryPhotos: byPhotographer.get(u.id) ?? 0,
  }))
}

/**
 * Merge roster + download tallies. Sort: highest take ratio first (heavy downloaders vs little contribution).
 */
export function buildUsageLedger(
  userRows: AdminUserRow[],
  downloadsByDownloader: DownloadByUser[],
): UsageLedgerRow[] {
  const dm = new Map(downloadsByDownloader.map(d => [d.userId, d.count]))
  return userRows
    .map(u => {
      const uploads = u.libraryPhotos
      const downloads = dm.get(u.id) ?? 0
      const ratio = downloads / Math.max(uploads, 1)
      return {
        userId: u.id,
        name: u.name,
        initials: u.initials,
        role: u.role,
        email: u.email,
        uploads,
        downloads,
        ratio,
      }
    })
    .sort((a, b) => {
      if (b.ratio !== a.ratio) return b.ratio - a.ratio
      return b.downloads - a.downloads
    })
}
