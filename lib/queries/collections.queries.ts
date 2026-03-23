import type { SupabaseClient } from '@supabase/supabase-js'

export async function getCollections(supabase: SupabaseClient, excludeCreatedBy?: string | null) {
  /**
   * `photos(count)` gives total size without loading all photo ids.
   * `preview_photos` returns up to 3 recent thumbs for mosaic cards.
   */
  let query = supabase
    .from('collections')
    .select('id, name, category, created_by, created_at, photos(count), preview_photos:photos(storage_path, thumbnail_path, created_at)')
    .order('created_at', { ascending: false })
    .order('created_at', { ascending: false, foreignTable: 'preview_photos' })
    .limit(3, { foreignTable: 'preview_photos' })

  if (excludeCreatedBy) {
    query = query.neq('created_by', excludeCreatedBy)
  }

  const { data, error } = await query

  if (error) throw error

  return (data ?? []).map((
    c: {
      photos: { count: number }[] | null
      preview_photos?: { storage_path: string | null; thumbnail_path: string | null }[] | null
    } & Record<string, unknown>,
  ) => {
    const raw = c.photos?.[0]?.count
    const photo_count = typeof raw === 'number' ? raw : Number(raw ?? 0) || 0
    const { photos: _p, preview_photos, ...rest } = c
    return { ...rest, photo_count, photos: preview_photos ?? [] }
  })
}

export async function getMyCollections(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('collections')
    .select('id, name, category, created_by, created_at')
    .eq('created_by', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}
