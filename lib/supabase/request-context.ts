import { cache } from 'react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { resolveHideOwnPhotosInBrowse } from '@/lib/preferences/hideOwnPhotosInBrowse'
import { createClient } from '@/lib/supabase/server'
import type { User } from '@/lib/types/database.types'
import { devError } from '@/lib/utils/devLog'

export const getServerUser = cache(async (): Promise<SupabaseUser | null> => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user ?? null
})

export const getServerProfile = cache(async (): Promise<Pick<User, 'name' | 'initials' | 'role' | 'avatar_url' | 'hide_own_photos_in_browse'> | null> => {
  const user = await getServerUser()
  if (!user) return null

  const supabase = await createClient()
  /** Core columns only — if `hide_own_photos_in_browse` is missing in DB, mixing it here makes the whole row fail (PGRST204) and wipes name/role/admin everywhere. Run both in parallel. */
  const [{ data, error }, hideRes] = await Promise.all([
    supabase
      .from('users')
      .select('name, initials, role, avatar_url')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('users')
      .select('hide_own_photos_in_browse')
      .eq('id', user.id)
      .maybeSingle(),
  ])

  if (error) {
    devError('[getServerProfile]', user.id, error.message)
    return null
  }
  if (!data) return null
  const hide_own_photos_in_browse = resolveHideOwnPhotosInBrowse({
    authUser: user,
    dbError: hideRes.error,
    dbData: hideRes.data,
  })

  return { ...data, hide_own_photos_in_browse }
})
