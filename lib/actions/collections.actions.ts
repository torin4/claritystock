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
  const supabase = await createClient()
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
  if (input.ownedByUserId) {
    revalidatePath('/admin')
    revalidatePath('/admin/libraries')
  }
  return { id: data.id }
}

/** Reuse an existing collection (case-insensitive name match) or create for bulk ZIP imports.
 *  Pass `ownerId` when an admin is importing on behalf of another photographer so collections
 *  are created under the target photographer rather than the admin's account. */
export async function getOrCreateCollectionByName(input: {
  name: string
  category?: Category | null
  /** The photographer who should own the collection. Defaults to the authenticated user. */
  ownerId?: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const ownerId = input.ownerId ?? user.id

  const name = input.name.trim()
  if (!name) throw new Error('Name is required')

  const { data: rows } = await supabase
    .from('collections')
    .select('id, name')
    .eq('created_by', ownerId)

  const lower = name.toLowerCase()
  const existing = (rows ?? []).find((r) => r.name.trim().toLowerCase() === lower)
  if (existing) return { id: existing.id }

  const { data, error } = await supabase
    .from('collections')
    .insert({
      name,
      category: input.category ?? 'neighborhood',
      created_by: ownerId,
    })
    .select('id')
    .single()

  if (error || !data?.id) throw new Error(error?.message ?? 'Failed to create collection')
  revalidatePath('/')
  revalidatePath('/my-photos')
  return { id: data.id }
}

/** Deletes the collection row in Supabase. Photos keep their files; `collection_id` is set to null (FK). */
export async function deleteCollection(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  let q = supabase.from('collections').delete().eq('id', id)
  if (!(await isUserAdmin(supabase, user.id))) q = q.eq('created_by', user.id)
  const { error } = await q

  if (error) throw error
  revalidatePath('/')
  revalidatePath('/my-photos')
  revalidatePath('/admin/libraries')
}

export async function renameCollection(id: string, name: string) {
  const supabase = await createClient()
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
  revalidatePath('/admin/libraries')
}
