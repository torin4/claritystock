import type { User as AuthUser } from '@supabase/supabase-js'

const META_KEY = 'hide_own_photos_in_browse'

/** Read preference from JWT `user_metadata` (used when `public.users.hide_own_photos_in_browse` is not migrated). */
export function hideOwnPhotosInBrowseFromMetadata(user: AuthUser | null | undefined): boolean {
  const raw = user?.user_metadata?.[META_KEY as keyof NonNullable<AuthUser['user_metadata']>]
  return raw === true
}

/** PostgREST: column absent from schema cache. */
export function isMissingHideOwnPhotosColumnError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  if (error.code === 'PGRST204') {
    const m = (error.message ?? '').toLowerCase()
    return m.includes('hide_own_photos_in_browse')
  }
  const m = (error.message ?? '').toLowerCase()
  return (
    m.includes('hide_own_photos_in_browse') &&
    (m.includes('schema cache') || m.includes('could not find') || m.includes('does not exist'))
  )
}

/**
 * Prefer `public.users` when the column read succeeds; otherwise JWT metadata.
 */
export function resolveHideOwnPhotosInBrowse(opts: {
  authUser: AuthUser | null
  dbError: { code?: string; message?: string } | null | undefined
  dbData: { hide_own_photos_in_browse?: boolean | null } | null | undefined
}): boolean {
  if (!opts.dbError && opts.dbData != null) {
    return opts.dbData.hide_own_photos_in_browse === true
  }
  return hideOwnPhotosInBrowseFromMetadata(opts.authUser)
}
