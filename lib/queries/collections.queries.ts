import type { SupabaseClient } from '@supabase/supabase-js'

export async function getCollections(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('collections')
    .select('*, photos(id)')
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((c: { photos: { id: string }[] } & Record<string, unknown>) => ({
    ...c,
    photo_count: c.photos?.length ?? 0,
    photos: undefined,
  }))
}

export async function getMyCollections(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('collections')
    .select('*, photos(id, storage_path, thumbnail_path)')
    .eq('created_by', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}
