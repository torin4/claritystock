import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AdminTopPhoto,
  AdminUserRow,
  DownloadByUser,
  InsightsStats,
  PhotographerImpact,
  UsageLedgerRow,
} from '@/lib/types/database.types'

const PAGE = 1000

async function fetchDownloadRows(
  supabase: SupabaseClient,
): Promise<
  { downloaded_by: string; downloader: { id: string; name: string | null; initials: string | null } | null }[]
> {
  const out: {
    downloaded_by: string
    downloader: { id: string; name: string | null; initials: string | null } | null
  }[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('downloads')
      .select('downloaded_by, downloader:users!downloaded_by(id, name, initials)')
      .range(from, from + PAGE - 1)
    if (error) throw error
    const rows = (data ?? []) as unknown as typeof out
    out.push(...rows)
    if (rows.length < PAGE) break
    from += PAGE
  }
  return out
}

/** Team-wide library stats (parallel to personal Insights). */
export async function getAdminLibraryStats(supabase: SupabaseClient): Promise<InsightsStats> {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const [photosRes, downloadsRes, monthDlRes, favsRes] = await Promise.all([
    supabase.from('photos').select('id', { count: 'exact', head: true }),
    supabase.from('downloads').select('id', { count: 'exact', head: true }),
    supabase.from('downloads').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
    supabase.from('favorites').select('id', { count: 'exact', head: true }),
  ])

  return {
    totalPhotos: photosRes.count ?? 0,
    totalDownloads: downloadsRes.count ?? 0,
    thisMonthDownloads: monthDlRes.count ?? 0,
    favoritedCount: favsRes.count ?? 0,
  }
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

/** All download events grouped by who downloaded (team usage). */
export async function getAdminDownloadsByDownloader(supabase: SupabaseClient): Promise<DownloadByUser[]> {
  const rows = await fetchDownloadRows(supabase)
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
