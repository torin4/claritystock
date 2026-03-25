'use server'

import { createClient } from '@/lib/supabase/server'

/** All canonical location labels (Puget Sound seed + any manual rows). */
export async function getNeighborhoodCanonicalLabels(): Promise<string[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('neighborhood_canonicals')
    .select('label')
    .order('label', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r: { label: string }) => r.label)
}
