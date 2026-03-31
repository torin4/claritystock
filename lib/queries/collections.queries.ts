import type { SupabaseClient } from '@supabase/supabase-js'
import type { Collection, PhotoAsset } from '@/lib/types/database.types'

type CollectionQueryOptions = {
  excludeCreatedBy?: string | null
  createdBy?: string | null
  limit?: number
}

type CollectionQueryRow = Omit<Collection, 'photo_count' | 'photos'> & {
  photos: { count: number }[] | null
  preview_photos?: PhotoAsset[] | null
  /**
   * Supabase join shape can be an array even for 1:1 references depending on select syntax.
   * Normalize in `mapCollectionRows`.
   */
  creator?: Collection['creator'] | Array<NonNullable<Collection['creator']>>
}

function mapCollectionRows(rows: CollectionQueryRow[]): Collection[] {
  return rows.map((c) => {
    const raw = c.photos?.[0]?.count
    const photo_count = typeof raw === 'number' ? raw : Number(raw ?? 0) || 0
    const previewPhotos = c.preview_photos ?? []
    const creator = Array.isArray(c.creator) ? (c.creator[0] ?? null) : (c.creator ?? null)
    return {
      id: c.id,
      name: c.name,
      category: c.category,
      created_by: c.created_by,
      creator,
      created_at: c.created_at,
      photo_count,
      photos: previewPhotos,
    }
  })
}

export async function getCollections(supabase: SupabaseClient, options?: CollectionQueryOptions) {
  /**
   * `photos(count)` gives total size without loading all photo ids.
   * `preview_photos` returns up to 3 recent thumbs for mosaic cards.
   */
  let query = supabase
    .from('collections')
    .select('id, name, category, created_by, created_at, creator:users!created_by(id, name, initials, avatar_url), photos(count), preview_photos:photos(storage_path, thumbnail_path, created_at)')
    .order('created_at', { ascending: false })
    .order('created_at', { ascending: false, foreignTable: 'preview_photos' })
    .limit(3, { foreignTable: 'preview_photos' })

  if (options?.excludeCreatedBy) {
    query = query.neq('created_by', options.excludeCreatedBy)
  }
  if (options?.createdBy) {
    query = query.eq('created_by', options.createdBy)
  }
  if (options?.limit) {
    query = query.limit(options.limit)
  }

  const { data, error } = await query

  if (error) throw error

  return mapCollectionRows((data ?? []) as unknown as CollectionQueryRow[])
}

export async function getMyCollections(supabase: SupabaseClient, userId: string) {
  return getCollections(supabase, { createdBy: userId })
}
