import { cache } from 'react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { User } from '@/lib/types/database.types'

export const getServerUser = cache(async (): Promise<SupabaseUser | null> => {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user ?? null
})

export const getServerProfile = cache(async (): Promise<Pick<User, 'name' | 'initials' | 'role' | 'avatar_url'> | null> => {
  const user = await getServerUser()
  if (!user) return null

  const supabase = createClient()
  const { data } = await supabase
    .from('users')
    .select('name, initials, role, avatar_url')
    .eq('id', user.id)
    .single()

  return data ?? null
})
