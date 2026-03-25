'use server'

import { revalidatePath } from 'next/cache'
import { deleteAllMyPhotos } from '@/lib/actions/photos.actions'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Permanently remove the signed-in user: deletes their photos (storage + rows), then auth + public.users (cascade).
 * Requires `SUPABASE_SERVICE_ROLE_KEY` on the server.
 */
export async function deleteMyAccount() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Account deletion is not configured (missing service role key).')
  }

  await deleteAllMyPhotos()

  const admin = createServiceClient()
  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) throw new Error(error.message)

  revalidatePath('/', 'layout')
  return { ok: true as const }
}
