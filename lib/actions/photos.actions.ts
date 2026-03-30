'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { assertOwnerOrAdmin, isUserAdmin } from '@/lib/auth/admin'
import { PHOTO_TAG_NEEDS_LOCATION } from '@/lib/constants/photoTags'
import type { Category, PhotoFormValues } from '@/lib/types/database.types'
import type { PostgrestError } from '@supabase/supabase-js'
import { devWarn } from '@/lib/utils/devLog'
import { resolveNeighborhoodToCanonical } from '@/lib/neighborhoods/canonical'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getOrCreateCollectionByName } from '@/lib/actions/collections.actions'

/** PostgREST when a column is not in the live schema (migration not applied yet). */
function isMissingColumnError(error: PostgrestError | null, column: string): boolean {
  if (!error?.message) return false
  const m = error.message
  return (
    m.includes(column) &&
    (m.includes('schema cache') || m.includes('does not exist') || m.includes('Could not find'))
  )
}

async function assertOwnedCollectionId(
  collectionId: string | null | undefined,
  userId: string,
) {
  if (!collectionId) return
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('collections')
    .select('id')
    .eq('id', collectionId)
    .eq('created_by', userId)
    .single()
  if (error || !data) throw new Error('Invalid collection')
}

/** Collection must belong to this photographer (for admin acting on behalf / edits). */
async function resolveNeighborhoodForDb(
  supabase: SupabaseClient,
  input: string | null | undefined,
): Promise<string | null> {
  const t = input?.trim()
  if (!t) return null
  const { data, error } = await supabase.from('neighborhood_canonicals').select('label')
  if (error) {
    devWarn('[photos] neighborhood_canonicals unavailable; using raw neighborhood value', error.message)
    return t
  }
  const labels = (data ?? []).map((r: { label: string }) => r.label)
  return resolveNeighborhoodToCanonical(t, labels) ?? t
}

async function assertCollectionOwnedByPhotographer(
  collectionId: string | null | undefined,
  photographerId: string,
) {
  if (!collectionId) return
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('collections')
    .select('id')
    .eq('id', collectionId)
    .eq('created_by', photographerId)
    .single()
  if (error || !data) throw new Error('Invalid collection for this photographer')
}

export async function updatePhoto(id: string, values: Partial<PhotoFormValues>) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const admin = await isUserAdmin(supabase, user.id)

  if (admin) {
    const { data: row } = await supabase.from('photos').select('photographer_id').eq('id', id).single()
    const ownerId = row?.photographer_id
    if (!ownerId) throw new Error('Photo not found')
    await assertCollectionOwnedByPhotographer(values.collection_id, ownerId)
  } else {
    await assertOwnedCollectionId(values.collection_id, user.id)
  }

  const neighborhoodResolved =
    values.neighborhood !== undefined
      ? await resolveNeighborhoodForDb(supabase, values.neighborhood)
      : undefined

  const hasUsableLocation =
    values.neighborhood !== undefined &&
    neighborhoodResolved != null &&
    String(neighborhoodResolved).trim() !== ''

  let tagsPayload: string[] | undefined = values.tags
  if (hasUsableLocation) {
    if (values.tags !== undefined) {
      tagsPayload = values.tags.filter((t) => t !== PHOTO_TAG_NEEDS_LOCATION)
    } else {
      const { data: row } = await supabase.from('photos').select('tags').eq('id', id).single()
      const cur = (row?.tags as string[] | null) ?? []
      if (cur.includes(PHOTO_TAG_NEEDS_LOCATION)) {
        tagsPayload = cur.filter((t) => t !== PHOTO_TAG_NEEDS_LOCATION)
      }
    }
  }

  let q = supabase
    .from('photos')
    .update({
      title: values.title,
      category: values.category,
      collection_id: values.collection_id,
      ...(values.neighborhood !== undefined ? { neighborhood: neighborhoodResolved } : {}),
      subarea: values.subarea,
      captured_date: values.captured_date,
      ...(tagsPayload !== undefined ? { tags: tagsPayload } : {}),
      notes: values.notes,
    })
    .eq('id', id)
  if (!admin) q = q.eq('photographer_id', user.id)

  const { error } = await q
  if (error) throw error
  revalidatePath('/')
  revalidatePath('/my-photos')
  revalidatePath('/admin/libraries')
}

/**
 * Set the same collection (or null) for many photos.
 * Admins may pass `photographerId` to update another user’s photos (admin library UI).
 */
export async function updatePhotosCollectionIds(
  photoIds: string[],
  collectionId: string | null,
  opts?: { photographerId?: string },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const admin = await isUserAdmin(supabase, user.id)
  const photographerScope =
    admin && opts?.photographerId ? opts.photographerId : user.id

  if (admin && opts?.photographerId) {
    await assertCollectionOwnedByPhotographer(collectionId, opts.photographerId)
  } else {
    await assertOwnedCollectionId(collectionId, photographerScope)
  }

  const unique = Array.from(new Set(photoIds)).filter(Boolean)
  if (!unique.length) return { updated: 0 }

  const { data, error } = await supabase
    .from('photos')
    .update({ collection_id: collectionId })
    .in('id', unique)
    .eq('photographer_id', photographerScope)
    .select('id')

  if (error) throw error
  revalidatePath('/')
  revalidatePath('/my-photos')
  revalidatePath('/admin/libraries')
  return { updated: data?.length ?? 0 }
}

/**
 * Apply the same category and/or neighborhood to many photos you own (bulk import follow-up).
 * Setting neighborhood clears the internal `needs-location` tag when a canonical neighborhood is saved.
 * Admins may pass `photographerId` to update another user’s photos (admin bulk import follow-up).
 */
export async function updatePhotosCategoryNeighborhood(
  photoIds: string[],
  opts: {
    category?: Category | null
    neighborhood?: string | null
    subarea?: string | null
    photographerId?: string
  },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const admin = await isUserAdmin(supabase, user.id)
  const photographerScope =
    admin && opts.photographerId ? opts.photographerId : user.id
  if (opts.photographerId && opts.photographerId !== user.id && !admin) {
    throw new Error('Forbidden')
  }

  const unique = Array.from(new Set(photoIds)).filter(Boolean)
  if (!unique.length) return { updated: 0 }

  const willCategory = opts.category !== undefined
  const willNeighborhood = opts.neighborhood !== undefined
  const willSubarea = opts.subarea !== undefined
  if (!willCategory && !willNeighborhood && !willSubarea) throw new Error('Nothing to update')

  const neighborhoodResolved = willNeighborhood
    ? await resolveNeighborhoodForDb(supabase, opts.neighborhood)
    : undefined
  const subareaResolved = willSubarea
    ? (opts.subarea?.trim() ? opts.subarea.trim() : null)
    : undefined

  const { data: rows, error: fetchErr } = await supabase
    .from('photos')
    .select('id, tags')
    .in('id', unique)
    .eq('photographer_id', photographerScope)

  if (fetchErr) throw fetchErr
  if (!rows?.length) throw new Error('No matching photos')

  for (const row of rows) {
    const patch: {
      category?: Category | null
      neighborhood?: string | null
      subarea?: string | null
      tags?: string[]
    } = {}
    if (willCategory) patch.category = opts.category ?? null
    if (willNeighborhood) {
      patch.neighborhood = neighborhoodResolved
      const cur = (row.tags as string[] | null) ?? []
      patch.tags = cur.filter((t) => t !== PHOTO_TAG_NEEDS_LOCATION)
    }
    if (willSubarea) patch.subarea = subareaResolved ?? null

    const { error } = await supabase
      .from('photos')
      .update(patch)
      .eq('id', row.id)
      .eq('photographer_id', photographerScope)
    if (error) throw error
  }

  revalidatePath('/')
  revalidatePath('/my-photos')
  revalidatePath('/admin/libraries')
  return { updated: rows.length }
}

export async function deletePhoto(
  id: string,
  storagePath: string | null,
  thumbnailPath?: string | null,
  displayPath?: string | null,
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const toRemove = [storagePath, thumbnailPath, displayPath].filter(Boolean) as string[]
  if (toRemove.length) {
    await supabase.storage.from('photos').remove(toRemove)
  }

  let del = supabase.from('photos').delete().eq('id', id)
  if (!(await isUserAdmin(supabase, user.id))) del = del.eq('photographer_id', user.id)
  const { error } = await del

  if (error) throw error
  revalidatePath('/')
  revalidatePath('/my-photos')
  revalidatePath('/admin/libraries')
}

/** Remove every photo you uploaded (storage files + DB). Favorites/downloads rows cascade. Collections are not deleted. */
export async function deleteAllMyPhotos() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: photos, error: fetchErr } = await supabase
    .from('photos')
    .select('id, storage_path, thumbnail_path, display_path')
    .eq('photographer_id', user.id)

  if (fetchErr) throw fetchErr
  if (!photos?.length) return { deleted: 0 }

  const paths = new Set<string>()
  for (const p of photos) {
    if (p.storage_path) paths.add(p.storage_path)
    if (p.thumbnail_path) paths.add(p.thumbnail_path)
    if (p.display_path) paths.add(p.display_path)
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const unique = Array.from(new Set(ids)).filter(Boolean)
  if (!unique.length) return { deleted: 0 }

  const admin = await isUserAdmin(supabase, user.id)
  let sel = supabase
    .from('photos')
    .select('id, storage_path, thumbnail_path, display_path')
    .in('id', unique)
  if (!admin) sel = sel.eq('photographer_id', user.id)
  const { data: photos, error: fetchErr } = await sel

  if (fetchErr) throw fetchErr
  if (!photos?.length) return { deleted: 0 }

  const paths = new Set<string>()
  for (const p of photos) {
    if (p.storage_path) paths.add(p.storage_path)
    if (p.thumbnail_path) paths.add(p.thumbnail_path)
    if (p.display_path) paths.add(p.display_path)
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
  revalidatePath('/admin/libraries')
  return { deleted: photos.length }
}

export async function publishPhoto(
  formValues: PhotoFormValues & { description?: string },
  storagePath: string,
  photographerId: string,
  paths?: {
    thumbnailPath?: string | null
    displayPath?: string | null
    contentHash?: string | null
  },
) {
  const { supabase, actingAsAdmin } = await assertOwnerOrAdmin(photographerId)
  if (actingAsAdmin) {
    await assertCollectionOwnedByPhotographer(formValues.collection_id, photographerId)
  } else {
    await assertOwnedCollectionId(formValues.collection_id, photographerId)
  }

  // New collection: reuse same row when name matches (multi-photo batch / retries).
  let collectionId = formValues.collection_id
  const newName = formValues.new_collection_name?.trim()
  if (newName) {
    const { id } = await getOrCreateCollectionByName({
      name: newName,
      category: formValues.category,
      ownerId: photographerId,
    })
    collectionId = id
  }

  const neighborhoodResolved = await resolveNeighborhoodForDb(supabase, formValues.neighborhood)

  const baseRow = {
    title: formValues.title,
    photographer_id: photographerId,
    collection_id: collectionId,
    category: formValues.category,
    neighborhood: neighborhoodResolved,
    subarea: formValues.subarea,
    captured_date: formValues.captured_date,
    tags: formValues.tags,
    notes: formValues.notes,
    description: formValues.description ?? null,
    storage_path: storagePath,
    thumbnail_path: paths?.thumbnailPath ?? null,
    display_path: paths?.displayPath ?? null,
    downloads_count: 0,
  }

  const withHash =
    paths?.contentHash && paths.contentHash.length > 0
      ? { ...baseRow, content_hash: paths.contentHash }
      : baseRow

  let { data: inserted, error } = await supabase.from('photos').insert(withHash).select('id').single()

  if (error && paths?.contentHash && isMissingColumnError(error, 'content_hash')) {
    devWarn(
      '[publishPhoto] content_hash column missing — retry without it. Run migration 20260325210000_photos_content_hash.sql',
    )
    ;({ data: inserted, error } = await supabase.from('photos').insert(baseRow).select('id').single())
  }

  if (error) throw error
  if (!inserted?.id) throw new Error('Insert succeeded but no photo id returned')
  revalidatePath('/')
  revalidatePath('/my-photos')
  revalidatePath('/admin')
  revalidatePath('/admin/libraries')
  return { id: inserted.id }
}
