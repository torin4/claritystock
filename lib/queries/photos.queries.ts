import type { SupabaseClient } from '@supabase/supabase-js'
import type { BrowseFilters, Photo, User } from '@/lib/types/database.types'
import {
  BROWSE_PAGE_SIZE,
  MY_LIBRARY_PAGE_SIZE,
  PHOTO_CARD_SELECT,
  PHOTO_DETAIL_SELECT,
  PHOTO_MY_LIBRARY_CARD_SELECT,
} from '@/lib/queries/photoSelects'
import { buildPhotosSearchOrClause } from '@/lib/photos/photoTextSearch'

export async function getPhotos(
  supabase: SupabaseClient,
  userId: string,
  filters: Partial<BrowseFilters> = {},
  options: { hideOwnPhotosInBrowse?: boolean } = {},
) {
  let query = supabase
    .from('photos')
    .select(PHOTO_CARD_SELECT)

  if (options.hideOwnPhotosInBrowse && userId) {
    query = query.or(`photographer_id.is.null,photographer_id.neq.${userId}`)
  }

  {
    const searchOr = buildPhotosSearchOrClause(filters.search ?? '')
    if (searchOr) query = query.or(searchOr)
  }
  if (filters.category) {
    query = query.eq('category', filters.category)
  }
  {
    const n = filters.neighborhood?.trim()
    if (n) query = query.eq('neighborhood', n)
  }
  if (filters.collectionId) {
    query = query.eq('collection_id', filters.collectionId)
  }
  if (filters.quickFilter === 'mine') {
    const { data: downloads } = await supabase
      .from('downloads')
      .select('photo_id')
      .eq('downloaded_by', userId)
      .is('archived_at', null)
      .limit(2000)
    const ids = (downloads ?? []).map((d: { photo_id: string }) => d.photo_id)
    query = query.in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
  }
  if (filters.quickFilter === 'new') {
    const { data: downloads } = await supabase
      .from('downloads')
      .select('photo_id')
      .eq('downloaded_by', userId)
      .is('archived_at', null)
      .limit(2000)
    const ids = (downloads ?? []).map((d: { photo_id: string }) => d.photo_id)
    if (ids.length) query = query.not('id', 'in', `(${ids.join(',')})`)
  }
  if (filters.quickFilter === 'fav') {
    const { data: favs } = await supabase
      .from('favorites')
      .select('photo_id')
      .eq('user_id', userId)
      .limit(2000)
    const ids = (favs ?? []).map((f: { photo_id: string }) => f.photo_id)
    query = query.in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
  }

  if (filters.sort === 'used') {
    query = query.order('downloads_count', { ascending: false })
  } else {
    query = query.order('created_at', { ascending: false })
  }

  const { data, error } = await query.limit(BROWSE_PAGE_SIZE)
  if (error) throw error
  return data ?? []
}

type LibraryPhotographer = Pick<User, 'id' | 'name' | 'initials' | 'avatar_url'>

type GetMyPhotosPageOptions = {
  photographer?: LibraryPhotographer | null
  limit?: number
  offset?: number
  search?: string
  collectionId?: string | null
}

export async function getMyPhotosPage(
  supabase: SupabaseClient,
  userId: string,
  options: GetMyPhotosPageOptions = {},
) {
  let query = supabase
    .from('photos')
    .select(PHOTO_MY_LIBRARY_CARD_SELECT, { count: 'exact' })
    .eq('photographer_id', userId)

  const searchOr = buildPhotosSearchOrClause(options.search ?? '')
  if (searchOr) query = query.or(searchOr)
  if (options.collectionId) {
    query = query.eq('collection_id', options.collectionId)
  }

  const offset = options.offset ?? 0
  const limit = options.limit ?? MY_LIBRARY_PAGE_SIZE
  const { data: rows, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw error

  let prof: LibraryPhotographer | undefined = options.photographer ?? undefined
  if (!prof) {
    const { data: userRow } = await supabase
      .from('users')
      .select('id, name, initials, avatar_url')
      .eq('id', userId)
      .maybeSingle()
    prof = userRow ?? undefined
  }

  const photos = ((rows ?? []) as unknown as Photo[]).map((photo) => (
    prof ? { ...photo, photographer: prof } : photo
  )) as Photo[]

  return {
    photos,
    total: count ?? photos.length,
  }
}

/** Photos you’ve downloaded from the library (any photographer), most recently saved first; deduped per photo. */
export async function getMyDownloadedPhotos(supabase: SupabaseClient, userId: string) {
  const { data: dls, error: dErr } = await supabase
    .from('downloads')
    .select('photo_id, created_at')
    .eq('downloaded_by', userId)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(2000)

  if (dErr) throw dErr

  const seen = new Set<string>()
  const orderedIds: string[] = []
  for (const row of dls ?? []) {
    const pid = row.photo_id as string
    if (seen.has(pid)) continue
    seen.add(pid)
    orderedIds.push(pid)
  }

  if (!orderedIds.length) return []

  const [{ data: photos, error: pErr }, { data: favs, error: fErr }] = await Promise.all([
    supabase
      .from('photos')
      .select(PHOTO_CARD_SELECT)
      .in('id', orderedIds),
    supabase
      .from('favorites')
      .select('photo_id')
      .eq('user_id', userId),
  ])

  if (pErr) throw pErr
  if (fErr) throw fErr
  const favSet = new Set((favs ?? []).map((f: { photo_id: string }) => f.photo_id))

  const byId = new Map((photos ?? []).map((p: { id: string }) => [p.id, p]))

  const ordered = orderedIds
    .map(id => byId.get(id))
    .filter((p): p is NonNullable<typeof p> => p != null)

  return ordered.map(p => ({
    ...p,
    is_downloaded_by_me: true,
    is_favorited: favSet.has(p.id),
  })) as Photo[]
}

export async function getPhotoById(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from('photos')
    .select(PHOTO_DETAIL_SELECT)
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}
