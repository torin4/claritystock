import type { SupabaseClient } from '@supabase/supabase-js'

export type SidebarPhotoRow = {
  id: string
  title: string
  created_at: string
  collection_id: string | null
  thumbnail_path: string | null
  storage_path: string | null
}

/** Recent uploads from other photographers (same idea as excluding your collections from the strip). */
export async function getRecentSidebarPhotos(
  supabase: SupabaseClient,
  options: { excludePhotographerId: string; limit: number },
): Promise<SidebarPhotoRow[]> {
  const { data, error } = await supabase
    .from('photos')
    .select('id, title, created_at, collection_id, thumbnail_path, storage_path')
    .neq('photographer_id', options.excludePhotographerId)
    .order('created_at', { ascending: false })
    .limit(options.limit)

  if (error) throw error
  return (data ?? []) as SidebarPhotoRow[]
}
