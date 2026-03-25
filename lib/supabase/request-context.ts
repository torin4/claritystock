import { cache } from 'react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { User } from '@/lib/types/database.types'

export const getServerUser = cache(async (): Promise<SupabaseUser | null> => {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user ?? null
})

export const getServerProfile = cache(async (): Promise<Pick<User, 'name' | 'initials' | 'role' | 'avatar_url' | 'hide_own_photos_in_browse'> | null> => {
  const user = await getServerUser()
  if (!user) return null

  const supabase = createClient()
  /** Core columns only — if `hide_own_photos_in_browse` is missing in DB, mixing it here makes the whole row fail (PGRST204) and wipes name/role/admin everywhere. */
  const { data, error } = await supabase
    .from('users')
    .select('name, initials, role, avatar_url')
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    console.error('[getServerProfile]', user.id, error.message)
    return null
  }
  if (!data) return null

  let hide_own_photos_in_browse = false
  const hideRes = await supabase
    .from('users')
    .select('hide_own_photos_in_browse')
    .eq('id', user.id)
    .maybeSingle()
  if (!hideRes.error && hideRes.data?.hide_own_photos_in_browse === true) {
    hide_own_photos_in_browse = true
  }

  return { ...data, hide_own_photos_in_browse }
})
