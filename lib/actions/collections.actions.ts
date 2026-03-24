'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { assertAdmin, isUserAdmin } from '@/lib/auth/admin'
import type { Category } from '@/lib/types/database.types'

export async function createCollection(input: {
  name: string
  category?: Category | null
  /** Admin only: create collection owned by this user (proxy onboarding). */
  ownedByUserId?: string
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const name = input.name.trim()
  if (!name) throw new Error('Name is required')

  let createdBy = user.id
  if (input.ownedByUserId) {
    const { supabase: sb } = await assertAdmin()
    const { data: target } = await sb
      .from('users')
      .select('id')
      .eq('id', input.ownedByUserId)
      .maybeSingle()
    if (!target) throw new Error('Target user not found')
    createdBy = input.ownedByUserId
  }

  const { data, error } = await supabase
    .from('collections')
    .insert({
      name,
      category: input.category ?? null,
      created_by: createdBy,
    })
    .select('id')
    .single()

  if (error || !data?.id) throw new Error(error?.message ?? 'Failed to create collection')
  revalidatePath('/')
  revalidatePath('/my-photos')
  if (input.ownedByUserId) revalidatePath('/admin')
  return { id: data.id }
}

/** Deletes the collection row in Supabase. Photos keep their files; `collection_id` is set to null (FK). */
export async function deleteCollection(id: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  let q = supabase.from('collections').delete().eq('id', id)
  if (!(await isUserAdmin(supabase, user.id))) q = q.eq('created_by', user.id)
  const { error } = await q

  if (error) throw error
  revalidatePath('/')
  revalidatePath('/my-photos')
}

export async function renameCollection(id: string, name: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const nextName = name.trim()
  if (!nextName) throw new Error('Name is required')

  let q = supabase.from('collections').update({ name: nextName }).eq('id', id)
  if (!(await isUserAdmin(supabase, user.id))) q = q.eq('created_by', user.id)
  const { error } = await q

  if (error) throw error
  revalidatePath('/')
  revalidatePath('/my-photos')
}
