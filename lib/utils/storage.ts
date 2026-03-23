import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { getOrCreateSignedUrl } from '@/lib/utils/signedUrlCache'

export async function uploadPhoto(file: File, userId: string): Promise<string> {
  const supabase = getSupabaseBrowserClient()
  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const { error } = await supabase.storage.from('photos').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  })
  if (error) throw error
  return path
}

/** Only works if the `photos` bucket is public — prefer {@link getSignedPhotoUrl} for private buckets. */
export function getPublicUrl(path: string): string {
  const supabase = getSupabaseBrowserClient()
  const { data } = supabase.storage.from('photos').getPublicUrl(path)
  return data.publicUrl
}

/** Signed URL for private bucket; use for `<img src>` and downloads. Uses shared cache. */
export async function getSignedPhotoUrl(path: string, expiresSec = 3600): Promise<string | null> {
  const supabase = getSupabaseBrowserClient()
  return getOrCreateSignedUrl(supabase, path, expiresSec)
}

/** Upload a pre-generated thumbnail JPEG/WebP blob next to originals. */
export async function uploadThumbnail(blob: Blob, userId: string): Promise<string> {
  const supabase = getSupabaseBrowserClient()
  const path = `${userId}/thumbs/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`
  const { error } = await supabase.storage.from('photos').upload(path, blob, {
    cacheControl: '86400',
    upsert: false,
    contentType: 'image/jpeg',
  })
  if (error) throw error
  return path
}

export async function deletePhotoFromStorage(path: string): Promise<void> {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase.storage.from('photos').remove([path])
  if (error) throw error
}
