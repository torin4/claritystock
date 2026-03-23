'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { PhotoFormValues } from '@/lib/types/database.types'

export async function updatePhoto(id: string, values: Partial<PhotoFormValues>) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { error } = await supabase
    .from('photos')
    .update({
      title: values.title,
      category: values.category,
      collection_id: values.collection_id,
      neighborhood: values.neighborhood,
      subarea: values.subarea,
      captured_date: values.captured_date,
      tags: values.tags,
      notes: values.notes,
    })
    .eq('id', id)
    .eq('photographer_id', user.id)

  if (error) throw error
  revalidatePath('/')
  revalidatePath('/my-photos')
}

export async function deletePhoto(
  id: string,
  storagePath: string | null,
  thumbnailPath?: string | null,
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const toRemove = [storagePath, thumbnailPath].filter(Boolean) as string[]
  if (toRemove.length) {
    await supabase.storage.from('photos').remove(toRemove)
  }

  const { error } = await supabase
    .from('photos')
    .delete()
    .eq('id', id)
    .eq('photographer_id', user.id)

  if (error) throw error
  revalidatePath('/')
  revalidatePath('/my-photos')
}

/** Remove every photo you uploaded (storage files + DB). Favorites/downloads rows cascade. Collections are not deleted. */
export async function deleteAllMyPhotos() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: photos, error: fetchErr } = await supabase
    .from('photos')
    .select('id, storage_path, thumbnail_path')
    .eq('photographer_id', user.id)

  if (fetchErr) throw fetchErr
  if (!photos?.length) return { deleted: 0 }

  const paths = new Set<string>()
  for (const p of photos) {
    if (p.storage_path) paths.add(p.storage_path)
    if (p.thumbnail_path) paths.add(p.thumbnail_path)
  }
  if (paths.size > 0) {
    const arr = Array.from(paths)
    const chunk = 80
    for (let i = 0; i < arr.length; i += chunk) {
      await supabase.storage.from('photos').remove(arr.slice(i, i + chunk))
    }
  }

  const { error: delErr } = await supabase
    .from('photos')
    .delete()
    .eq('photographer_id', user.id)

  if (delErr) throw delErr

  revalidatePath('/')
  revalidatePath('/my-photos')
  revalidatePath('/insights')
  return { deleted: photos.length }
}

/** Delete specific photos you own (storage + rows). */
export async function deletePhotos(ids: string[]) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const unique = Array.from(new Set(ids)).filter(Boolean)
  if (!unique.length) return { deleted: 0 }

  const { data: photos, error: fetchErr } = await supabase
    .from('photos')
    .select('id, storage_path, thumbnail_path')
    .in('id', unique)
    .eq('photographer_id', user.id)

  if (fetchErr) throw fetchErr
  if (!photos?.length) return { deleted: 0 }

  const paths = new Set<string>()
  for (const p of photos) {
    if (p.storage_path) paths.add(p.storage_path)
    if (p.thumbnail_path) paths.add(p.thumbnail_path)
  }
  if (paths.size > 0) {
    const arr = Array.from(paths)
    const chunk = 80
    for (let i = 0; i < arr.length; i += chunk) {
      await supabase.storage.from('photos').remove(arr.slice(i, i + chunk))
    }
  }

  const { error: delErr } = await supabase
    .from('photos')
    .delete()
    .in('id', photos.map((p) => p.id))

  if (delErr) throw delErr

  revalidatePath('/')
  revalidatePath('/my-photos')
  revalidatePath('/insights')
  return { deleted: photos.length }
}

export async function publishPhoto(
  formValues: PhotoFormValues & { description?: string },
  storagePath: string,
  photographerId: string,
  thumbnailPath?: string | null,
) {
  const supabase = createClient()

  // If creating a new collection
  let collectionId = formValues.collection_id
  if (formValues.new_collection_name) {
    const { data: newColl, error: collErr } = await supabase
      .from('collections')
      .insert({ name: formValues.new_collection_name, category: formValues.category, created_by: photographerId })
      .select('id')
      .single()
    if (collErr) throw collErr
    collectionId = newColl.id
  }

  const { error } = await supabase.from('photos').insert({
    title: formValues.title,
    photographer_id: photographerId,
    collection_id: collectionId,
    category: formValues.category,
    neighborhood: formValues.neighborhood,
    subarea: formValues.subarea,
    captured_date: formValues.captured_date,
    tags: formValues.tags,
    notes: formValues.notes,
    description: formValues.description ?? null,
    storage_path: storagePath,
    thumbnail_path: thumbnailPath ?? null,
    downloads_count: 0,
  })

  if (error) throw error
  revalidatePath('/')
  revalidatePath('/my-photos')
}
