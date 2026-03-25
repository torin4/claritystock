'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function recordDownload(
  photoId: string,
  jobRef?: string
): Promise<string> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data, error } = await supabase.rpc('record_download', {
    p_photo_id: photoId,
    p_job_ref: jobRef ?? null,
  })

  if (error) throw error
  return data as string
}

/** Delete your download rows for these photos and decrement global download counts. Library / Browse list unchanged. */
export async function removeMyDownloads(photoIds: string[]) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const unique = Array.from(new Set(photoIds)).filter(Boolean)
  if (!unique.length) return

  const { error } = await supabase.rpc('remove_my_downloads', {
    p_photo_ids: unique,
  })

  if (error) throw error

  revalidatePath('/')
  revalidatePath('/my-photos')
}

export async function updateJobRef(downloadId: string, jobRef: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { error } = await supabase
    .from('downloads')
    .update({ job_ref: jobRef })
    .eq('id', downloadId)
    .eq('downloaded_by', user.id)

  if (error) throw error
}
