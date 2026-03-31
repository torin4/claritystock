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

/**
 * Move all photos from several collections into one surviving row, rename it, and rely on DB cleanup
 * (empty collections removed after `collection_id` updates) for the others.
 */
export async function mergeCollections(input: {
  collectionIds: string[]
  mergedName: string
  /** Admin library: these collections belong to this photographer. */
  photographerId?: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const admin = await isUserAdmin(supabase, user.id)
  const ownerId = admin && input.photographerId ? input.photographerId : user.id
  if (!admin && input.photographerId && input.photographerId !== user.id) {
    throw new Error('Unauthorized')
  }

  const ids = Array.from(new Set(input.collectionIds.filter(Boolean)))
  if (ids.length < 2) throw new Error('Select at least two collections to merge')

  const mergedName = input.mergedName.trim()
  if (!mergedName) throw new Error('Name is required')

  const { data: rows, error: fetchErr } = await supabase
    .from('collections')
    .select('id, created_at, created_by')
    .in('id', ids)

  if (fetchErr) throw fetchErr
  if (!rows || rows.length !== ids.length) throw new Error('One or more collections were not found')

  for (const r of rows) {
    if (r.created_by !== ownerId) throw new Error('Invalid collection')
  }

  const sorted = [...rows].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )
  const primaryId = sorted[0]!.id

  const { error: moveErr } = await supabase
    .from('photos')
    .update({ collection_id: primaryId })
    .in('collection_id', ids)
    .eq('photographer_id', ownerId)

  if (moveErr) throw moveErr

  let renameQ = supabase.from('collections').update({ name: mergedName }).eq('id', primaryId)
  if (!admin) renameQ = renameQ.eq('created_by', user.id)
  const { error: renameErr } = await renameQ
  if (renameErr) throw renameErr

  revalidatePath('/')
  revalidatePath('/my-photos')
  revalidatePath('/admin/libraries')
  return { mergedCollectionId: primaryId }
}
