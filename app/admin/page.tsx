import { createClient } from '@/lib/supabase/server'
import AdminTeamAnalytics from '@/components/admin/AdminTeamAnalytics'
import { getUsageAlertConfig } from '@/lib/admin/usageAlert'
import {
  buildUsageLedger,
  getAdminDownloadsByDownloader,
  getAdminLibraryStats,
  getAdminPhotographerImpact,
  getAdminTopPhotos,
  getAdminUsersWithPhotoCounts,
} from '@/lib/queries/admin.queries'

export default async function AdminPage() {
  const supabase = createClient()
  const [stats, topPhotos, downloadsByDownloader, photographerImpact, userRows] = await Promise.all([
    getAdminLibraryStats(supabase),
    getAdminTopPhotos(supabase, 8),
    getAdminDownloadsByDownloader(supabase),
    getAdminPhotographerImpact(supabase),
    getAdminUsersWithPhotoCounts(supabase),
  ])

  const adminCount = userRows.filter(u => u.role === 'admin').length
  const teamSummary = { memberCount: userRows.length, adminCount }
  const usageLedger = buildUsageLedger(userRows, downloadsByDownloader)
  const usageAlert = getUsageAlertConfig()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AdminTeamAnalytics
        stats={stats}
        topPhotos={topPhotos}
        downloadsByDownloader={downloadsByDownloader}
        photographerImpact={photographerImpact}
        userRows={userRows}
        teamSummary={teamSummary}
        usageLedger={usageLedger}
        usageAlert={usageAlert}
      />
    </div>
  )
}
