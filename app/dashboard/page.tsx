import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getServerUser, getServerProfile } from '@/lib/supabase/request-context'
import { isAdminRole } from '@/lib/auth/roles'
import { getAdminAnalyticsAllTime, getAdminAnalyticsThisMonth } from '@/lib/queries/admin.queries'
import { getPhotographerHomeData, getPhotographerHomeState, getLibraryTotals } from '@/lib/dashboard/photographerHome'
import InsightsClient from '@/components/insights/InsightsClient'
import AdminHome from '@/components/dashboard/AdminHome'
import EmptyHome from '@/components/dashboard/EmptyHome'
import SeededHome from '@/components/dashboard/SeededHome'

/** Auth + role gate every request; Home is user-specific, never cache it. */
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')
  const profile = await getServerProfile()
  const supabase = await createClient()

  // ---- Admin Home: team pulse + stewardship launchpad ----
  if (isAdminRole(profile?.role)) {
    const [allTime, thisMonth, membersRes, myPhotosRes] = await Promise.all([
      getAdminAnalyticsAllTime(supabase),
      getAdminAnalyticsThisMonth(supabase),
      supabase.from('users').select('id', { count: 'exact', head: true }),
      supabase.from('photos').select('id', { count: 'exact', head: true }).eq('photographer_id', user.id),
    ])
    return (
      <AdminHome
        greetingName={profile?.name ?? ''}
        teamStats={{
          libraryPhotos: allTime.stats.totalPhotos,
          usesThisMonth: thisMonth.stats.totalDownloads,
          members: membersRes.count ?? 0,
          newThisMonth: thisMonth.stats.totalPhotos,
        }}
        contributors={thisMonth.photographerImpact}
        myPhotos={myPhotosRes.count ?? 0}
      />
    )
  }

  // ---- Photographer Home — empty → seeded → thriving ----
  const state = await getPhotographerHomeState(supabase, user.id)

  if (state.kind === 'empty') {
    const totals = await getLibraryTotals(supabase)
    return <EmptyHome userId={user.id} totals={totals} greetingName={profile?.name ?? ''} />
  }

  if (state.kind === 'seeded') {
    return (
      <SeededHome
        userId={user.id}
        myPhotos={state.myPhotos}
        missingLocation={state.missingLocation}
        greetingName={profile?.name ?? ''}
      />
    )
  }

  // Thriving — absorbs Insights.
  const data = await getPhotographerHomeData(supabase, user.id)
  return (
    <InsightsClient
      allTime={data.allTime}
      thisMonth={data.thisMonth}
      topContributors={data.topContributors}
      userId={user.id}
      greetingName={profile?.name ?? ''}
    />
  )
}
