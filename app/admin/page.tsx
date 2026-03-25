import { createClient } from '@/lib/supabase/server'
import AdminTeamAnalytics from '@/components/admin/AdminTeamAnalytics'
import { getUsageAlertConfig } from '@/lib/admin/usageAlert'
import {
  buildUsageLedger,
  getAdminAnalyticsAllTime,
  getAdminAnalyticsThisMonth,
  getAdminUsersWithPhotoCounts,
} from '@/lib/queries/admin.queries'

export default async function AdminPage() {
  const supabase = createClient()
  const [allTime, thisMonth, userRows] = await Promise.all([
    getAdminAnalyticsAllTime(supabase),
    getAdminAnalyticsThisMonth(supabase),
    getAdminUsersWithPhotoCounts(supabase),
  ])

  const adminCount = userRows.filter(u => u.role === 'admin').length
  const teamSummary = { memberCount: userRows.length, adminCount }
  const usageLedger = buildUsageLedger(userRows, allTime.downloadsByDownloader)
  const usageAlert = getUsageAlertConfig()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AdminTeamAnalytics
        allTime={allTime}
        thisMonth={thisMonth}
        userRows={userRows}
        teamSummary={teamSummary}
        usageLedger={usageLedger}
        usageAlert={usageAlert}
      />
    </div>
  )
}
