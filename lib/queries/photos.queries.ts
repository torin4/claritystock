import type { SupabaseClient } from '@supabase/supabase-js'
import type { BrowseFilters } from '@/lib/types/database.types'

export async function getPhotos(
  supabase: SupabaseClient,
  userId: string,
  filters: Partial<BrowseFilters> = {}
) {
  let query = supabase
    .from('photos')
    .select(`
      *,
      photographer:users!photographer_id(id, name, initials, avatar_url),
      collection:collections!collection_id(id, name, category)
    `)

  if (filters.search) {
    query = query.textSearch('fts', filters.search, { type: 'websearch' })
  }
  if (filters.category) {
    query = query.eq('category', filters.category)
  }
  if (filters.neighborhood) {
    query = query.eq('neighborhood', filters.neighborhood)
  }
  if (filters.collectionId) {
    query = query.eq('collection_id', filters.collectionId)
  }
  if (filters.quickFilter === 'mine') {
    const { data: downloads } = await supabase
      .from('downloads')
      .select('photo_id')
      .eq('downloaded_by', userId)
    const ids = (downloads ?? []).map((d: { photo_id: string }) => d.photo_id)
    query = query.in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
  }
  if (filters.quickFilter === 'new') {
    const { data: downloads } = await supabase
      .from('downloads')
      .select('photo_id')
      .eq('downloaded_by', userId)
    const ids = (downloads ?? []).map((d: { photo_id: string }) => d.photo_id)
    if (ids.length) query = query.not('id', 'in', `(${ids.join(',')})`)
  }
  if (filters.quickFilter === 'fav') {
    const { data: favs } = await supabase
      .from('favorites')
      .select('photo_id')
      .eq('user_id', userId)
    const ids = (favs ?? []).map((f: { photo_id: string }) => f.photo_id)
    query = query.in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
  }

  if (filters.sort === 'used') {
    query = query.order('downloads_count', { ascending: false })
  } else {
    query = query.order('created_at', { ascending: false })
  }

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function getMyPhotos(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('photos')
    .select(`*, collection:collections!collection_id(id, name, category)`)
    .eq('photographer_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function getPhotoById(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from('photos')
    .select(`
      *,
      photographer:users!photographer_id(id, name, initials, avatar_url),
      collection:collections!collection_id(id, name, category)
    `)
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}
