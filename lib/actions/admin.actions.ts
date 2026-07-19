'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type ManageableRole = 'admin' | 'photographer'

/**
 * Change another member's role. All authorization and safety checks live in the
 * `admin_set_user_role` SECURITY DEFINER RPC (caller must be admin, valid role,
 * no self-change, never remove the last admin) — this action is a thin wrapper
 * so the guarantees can't be bypassed from the client.
 */
export async function setUserRole(targetUserId: string, newRole: ManageableRole): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { error } = await supabase.rpc('admin_set_user_role', {
    p_target: targetUserId,
    p_new_role: newRole,
  })
  if (error) throw new Error(error.message)

  revalidatePath('/admin')
  revalidatePath('/admin/libraries')
}
