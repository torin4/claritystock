import { createClient } from '@/lib/supabase/server'
import { getInsightsStats, getTopPhotos, getDownloadsByUser } from '@/lib/queries/insights.queries'
import { getServerUser } from '@/lib/supabase/request-context'
import InsightsClient from '@/components/insights/InsightsClient'
import { redirect } from 'next/navigation'

export default async function InsightsPage() {
  const supabase = createClient()
  const user = await getServerUser()
  if (!user) redirect('/login')

  const [stats, topPhotos, downloadsByUser] = await Promise.all([
    getInsightsStats(supabase, user.id),
    getTopPhotos(supabase, user.id),
    getDownloadsByUser(supabase, user.id),
  ])

  return (
    <InsightsClient
      stats={stats}
      topPhotos={topPhotos as never}
      downloadsByUser={downloadsByUser}
      userId={user.id}
    />
  )
}
