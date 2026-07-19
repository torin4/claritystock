import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getServerUser, getServerProfile } from '@/lib/supabase/request-context'
import { isAdminRole } from '@/lib/auth/roles'
import { getAdminAnalyticsAllTime, getAdminAnalyticsThisMonth } from '@/lib/queries/admin.queries'
import {
  getPhotographerHomeData,
  getPhotographerHomeState,
  getLibraryTotals,
} from '@/lib/dashboard/photographerHome'
import InsightsClient from '@/components/insights/InsightsClient'
import AdminHome from '@/components/dashboard/AdminHome'
import EmptyHome from '@/components/dashboard/EmptyHome'
import SeededHome from '@/components/dashboard/SeededHome'
import DashboardViewToggle from '@/components/dashboard/DashboardViewToggle'

/** Auth + role gate every request; Home is user-specific, never cache it. */
export const dynamic = 'force-dynamic'

type SearchParams = { view?: string }

/**
 * The photographer Home, rendered from the user's state (empty → seeded →
 * thriving). Shared by real photographers and by admins in the "My work" view.
 */
async function renderPhotographerHome(supabase: SupabaseClient, userId: string, name: string) {
  const state = await getPhotographerHomeState(supabase, userId)

  if (state.kind === 'empty') {
    const totals = await getLibraryTotals(supabase)
    return <EmptyHome userId={userId} totals={totals} greetingName={name} />
  }
  if (state.kind === 'seeded') {
    return <SeededHome userId={userId} myPhotos={state.myPhotos} missingLocation={state.missingLocation} greetingName={name} />
  }

  const data = await getPhotographerHomeData(supabase, userId)
  return (
    <InsightsClient
      allTime={data.allTime}
      thisMonth={data.thisMonth}
      topContributors={data.topContributors}
      userId={userId}
      greetingName={name}
    />
  )
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: SearchParams | Promise<SearchParams>
}) {
  const sp = await Promise.resolve(searchParams)
  const user = await getServerUser()
  if (!user) redirect('/login')
  const profile = await getServerProfile()
  const supabase = await createClient()
  const name = profile?.name ?? ''
  const isAdmin = isAdminRole(profile?.role)

  // Admin, "My work" view — the admin's own photographer Home, with the toggle.
  if (isAdmin && sp?.view === 'mine') {
    return (
      <>
        <DashboardViewToggle active="mine" />
        {await renderPhotographerHome(supabase, user.id, name)}
      </>
    )
  }

  // Admin, default "Team" view — pulse + stewardship launchpad, with the toggle.
  if (isAdmin) {
    const [allTime, thisMonth, membersRes, myPhotosRes] = await Promise.all([
      getAdminAnalyticsAllTime(supabase),
      getAdminAnalyticsThisMonth(supabase),
      supabase.from('users').select('id', { count: 'exact', head: true }),
      supabase.from('photos').select('id', { count: 'exact', head: true }).eq('photographer_id', user.id),
    ])
    return (
      <>
        <DashboardViewToggle active="team" />
        <AdminHome
          greetingName={name}
          teamStats={{
            libraryPhotos: allTime.stats.totalPhotos,
            usesThisMonth: thisMonth.stats.totalDownloads,
            members: membersRes.count ?? 0,
            newThisMonth: thisMonth.stats.totalPhotos,
          }}
          contributors={thisMonth.photographerImpact}
          myPhotos={myPhotosRes.count ?? 0}
        />
      </>
    )
  }

  // Photographer — no toggle.
  return renderPhotographerHome(supabase, user.id, name)
}
