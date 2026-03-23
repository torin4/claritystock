import { createClient } from '@/lib/supabase/server'
import { getInsightsStats, getTopPhotos, getDownloadsByUser } from '@/lib/queries/insights.queries'
import InsightsClient from '@/components/insights/InsightsClient'
import { redirect } from 'next/navigation'

export default async function InsightsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
