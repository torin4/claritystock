'use server'

import { createClient } from '@/lib/supabase/server'

export async function recordDownload(
  photoId: string,
  jobRef?: string
): Promise<string> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data, error } = await supabase.rpc('record_download', {
    p_photo_id: photoId,
    p_downloaded_by: user.id,
    p_job_ref: jobRef ?? null,
  })

  if (error) throw error
  return data as string
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
