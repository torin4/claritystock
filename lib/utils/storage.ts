import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { getOrCreateSignedUrl } from '@/lib/utils/signedUrlCache'

async function uploadDerivative(blob: Blob, userId: string, folder: string): Promise<string> {
  const supabase = getSupabaseBrowserClient()
  const path = `${userId}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`
  const { error } = await supabase.storage.from('photos').upload(path, blob, {
    cacheControl: '86400',
    upsert: false,
    contentType: 'image/jpeg',
  })
  if (error) throw error
  return path
}

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

/** Signed URL for private bucket; use for `<img src>` and downloads. Uses shared cache. */
export async function getSignedPhotoUrl(path: string, expiresSec = 3600): Promise<string | null> {
  const supabase = getSupabaseBrowserClient()
  return getOrCreateSignedUrl(supabase, path, expiresSec)
}

/** Upload a pre-generated thumbnail JPEG/WebP blob next to originals. */
export async function uploadThumbnail(blob: Blob, userId: string): Promise<string> {
  return uploadDerivative(blob, userId, 'thumbs')
}

/** Upload a lightbox-sized JPEG derivative next to originals. */
export async function uploadDisplayImage(blob: Blob, userId: string): Promise<string> {
  return uploadDerivative(blob, userId, 'display')
}
