import type { SupabaseClient } from '@supabase/supabase-js'
import type { AdminUserRow } from '@/lib/types/database.types'

/**
 * "Needs attention" detectors for Home. Each is a cheap count; the UI only shows
 * a row when the count is > 0 and hides the card entirely when everything's clean.
 * "Missing location" = `neighborhood` is null (the agreed predicate).
 */

export interface PhotographerAttention {
  missingLocation: number
  uncollected: number
}

export async function getPhotographerAttention(
  supabase: SupabaseClient,
  userId: string,
): Promise<PhotographerAttention> {
  const [loc, uncoll] = await Promise.all([
    supabase.from('photos').select('id', { count: 'exact', head: true }).eq('photographer_id', userId).is('neighborhood', null),
    supabase.from('photos').select('id', { count: 'exact', head: true }).eq('photographer_id', userId).is('collection_id', null),
  ])
  return { missingLocation: loc.count ?? 0, uncollected: uncoll.count ?? 0 }
}

export interface AdminAttention {
  idleMembers: number
  libraryMissingLocation: number
  failedBulkJobs: number
}

/** Library-wide stewardship signals. `userRows` comes from getAdminUsersWithPhotoCounts. */
export async function getAdminAttention(
  supabase: SupabaseClient,
  userRows: AdminUserRow[],
): Promise<AdminAttention> {
  const [loc, failed] = await Promise.all([
    supabase.from('photos').select('id', { count: 'exact', head: true }).is('neighborhood', null),
    // If the admin can't read the jobs table under RLS, count comes back 0 — no error.
    supabase.from('bulk_upload_jobs').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
  ])
  return {
    idleMembers: userRows.filter((u) => u.libraryPhotos === 0).length,
    libraryMissingLocation: loc.count ?? 0,
    failedBulkJobs: failed.count ?? 0,
  }
}
