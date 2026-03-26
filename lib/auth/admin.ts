import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { isAdminRole } from '@/lib/auth/roles'

export { isAdminRole } from '@/lib/auth/roles'

export async function isUserAdmin(client: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await client.from('users').select('role').eq('id', userId).maybeSingle()
  return isAdminRole(data?.role ?? null)
}

/** Throws if not signed in or not admin. Use in server actions that require admin. */
export async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  if (!(await isUserAdmin(supabase, user.id))) throw new Error('Forbidden')
  return { user, supabase }
}

/**
 * Publish flow: session user must be the photographer, or an admin publishing on their behalf.
 * When admin, verifies `photographerId` exists in `public.users`.
 */
export async function assertOwnerOrAdmin(photographerId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  if (user.id === photographerId) {
    return { user, supabase, actingAsAdmin: false as const }
  }
  if (!(await isUserAdmin(supabase, user.id))) {
    throw new Error('Unauthorized')
  }
  const { data: target } = await supabase
    .from('users')
    .select('id')
    .eq('id', photographerId)
    .maybeSingle()
  if (!target) throw new Error('Photographer not found')
  return { user, supabase, actingAsAdmin: true as const }
}
