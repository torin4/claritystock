import { blobToBase64, fileToBase64 } from '@/lib/utils/fileToBase64'
import { extractGps } from '@/lib/utils/exif'
import { uploadDisplayImage, uploadPhoto, uploadThumbnail } from '@/lib/utils/storage'
import { createJpegForAiTagging, createPhotoDerivatives } from '@/lib/utils/imageThumbnail'
import { publishPhoto } from '@/lib/actions/photos.actions'
import { devWarn } from '@/lib/utils/devLog'
import type { AiTagResult, PhotoFormValues } from '@/lib/types/database.types'

export const MAX_UPLOAD_MB = 50
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

/** Geocode GPS coordinates into a neighborhood label (same as UploadModal). */
export async function neighborhoodFromCoordinates(
  lat: number,
  lng: number,
): Promise<string | null> {
  try {
    const res = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`)
    const geo = await res.json()
    return geo.neighborhood ?? null
  } catch {
    return null
  }
}

/** Single EXIF read + geocode. */
export async function neighborhoodFromExifFile(file: File): Promise<string | null> {
  const gps = await extractGps(file)
  if (gps?.lat == null || gps?.lng == null) return null
  return neighborhoodFromCoordinates(gps.lat, gps.lng)
}

/** Gemini vision tagging (same as UploadModal). */
export async function runAiTaggingOnFile(
  file: File,
  opts?: { debug?: boolean; debugLabel?: string },
): Promise<AiTagResult | null> {
  const debug = Boolean(opts?.debug)
  const label = opts?.debugLabel ? ` ${opts.debugLabel}` : ''
  try {
    const tagBlob = await createJpegForAiTagging(file)
    let b64: string
    let mimeType: string
    if (tagBlob) {
      b64 = await blobToBase64(tagBlob)
      mimeType = 'image/jpeg'
    } else if (file.size <= 2 * 1024 * 1024) {
      b64 = await fileToBase64(file)
      mimeType = file.type
    } else {
      devWarn('[upload] AI tag skipped: could not downscale and file is too large to POST')
      return null
    }
    const res = await fetch('/api/ai/tag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: b64, mimeType }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      if (debug) {
        // eslint-disable-next-line no-console
        console.warn(`[ai-tag] non-OK response${label}`, {
          status: res.status,
          statusText: res.statusText,
          err,
          mimeType,
          bytes: file.size,
          name: file.name,
        })
      }
      devWarn('[upload] Gemini vision tag failed:', res.status, err)
      return null
    }
    const payload = (await res.json()) as AiTagResult & { debug?: unknown }
    if (debug) {
      // eslint-disable-next-line no-console
      console.log(`[ai-tag] ok${label}`, { name: file.name, bytes: file.size, mimeType, payload })
    }
    return payload as AiTagResult
  } catch (e) {
    if (debug) {
      // eslint-disable-next-line no-console
      console.error(`[ai-tag] fetch error${label}`, e)
    }
    devWarn('[upload] Gemini vision tag error:', e)
    return null
  }
}

export function formDefaultsFromAi(ai: AiTagResult | null): Partial<PhotoFormValues> {
  if (!ai) return {}
  return {
    title: ai.title,
    tags: ai.tags,
    category: ai.category,
  }
}

export type PublishPhotoFileParams = {
  file: File
  userId: string
  form: PhotoFormValues
  ai: AiTagResult | null
  contentHash: string | null
}

export type UploadedPhotoAssets = {
  storagePath: string
  thumbnailPath: string | null
  displayPath: string | null
  contentHash: string | null
}

/** Upload originals + derivatives to storage (no DB row). */
export async function uploadPhotoAssetsForPublish(params: {
  file: File
  userId: string
  contentHash: string | null
}): Promise<UploadedPhotoAssets> {
  const { file, userId, contentHash } = params
  const [storagePath, derivatives] = await Promise.all([
    uploadPhoto(file, userId),
    createPhotoDerivatives(file),
  ])
  let thumbnailPath: string | null = null
  let displayPath: string | null = null

  const [thumbnailUpload, displayUpload] = await Promise.allSettled([
    derivatives.thumbnail ? uploadThumbnail(derivatives.thumbnail, userId) : Promise.resolve(null),
    derivatives.display ? uploadDisplayImage(derivatives.display, userId) : Promise.resolve(null),
  ])

  if (thumbnailUpload.status === 'fulfilled') {
    thumbnailPath = thumbnailUpload.value
  } else {
    devWarn('[upload] Thumbnail upload failed:', thumbnailUpload.reason)
  }

  if (displayUpload.status === 'fulfilled') {
    displayPath = displayUpload.value
  } else {
    devWarn('[upload] Display image upload failed:', displayUpload.reason)
  }

  return { storagePath, thumbnailPath, displayPath, contentHash }
}

/** Storage upload + publishPhoto (same as UploadModal handlePublish per file). */
export async function publishPhotoFileFromUploadState(params: PublishPhotoFileParams): Promise<string> {
  const { file, userId, form, ai, contentHash } = params
  const assets = await uploadPhotoAssetsForPublish({ file, userId, contentHash })
  const { id } = await publishPhoto(
    { ...form, description: ai?.description },
    assets.storagePath,
    userId,
    {
      thumbnailPath: assets.thumbnailPath,
      displayPath: assets.displayPath,
      contentHash: assets.contentHash,
    },
  )
  return id
}

/** Retry publish only — storage paths already uploaded (e.g. bulk item after failed publish). */
export async function publishPhotoFromStagingSnapshot(params: {
  userId: string
  storagePath: string
  thumbnailPath: string | null
  displayPath: string | null
  contentHash: string | null
  form: PhotoFormValues
  description: string | null
}): Promise<string> {
  const { userId, storagePath, thumbnailPath, displayPath, contentHash, form, description } = params
  const { id } = await publishPhoto(
    { ...form, description: description ?? undefined },
    storagePath,
    userId,
    { thumbnailPath, displayPath, contentHash },
  )
  return id
}
