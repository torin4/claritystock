import type { SupabaseClient } from '@supabase/supabase-js'

export async function getCollections(supabase: SupabaseClient) {
  /** `photos(count)` = one aggregate row per collection — avoids loading every photo id (was very slow at scale). */
  const { data, error } = await supabase
    .from('collections')
    .select('*, photos(count)')
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((c: { photos: { count: number }[] | null } & Record<string, unknown>) => {
    const raw = c.photos?.[0]?.count
    const photo_count = typeof raw === 'number' ? raw : Number(raw ?? 0) || 0
    const { photos: _p, ...rest } = c
    return { ...rest, photo_count }
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
