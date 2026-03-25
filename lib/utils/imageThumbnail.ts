type DerivativeOptions = {
  maxDimension: number
  quality: number
}

const THUMBNAIL_OPTIONS: DerivativeOptions = {
  maxDimension: 640,
  quality: 0.82,
}

const DISPLAY_OPTIONS: DerivativeOptions = {
  maxDimension: 1920,
  quality: 0.86,
}

async function bitmapToJpegBlob(
  bitmap: ImageBitmap,
  options: DerivativeOptions,
): Promise<Blob | null> {
  const scale = Math.min(1, options.maxDimension / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(bitmap, 0, 0, width, height)
  return await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', options.quality)
  })
}

/**
 * Decode once, then generate both grid and lightbox derivatives client-side.
 */
export async function createPhotoDerivatives(file: File): Promise<{
  thumbnail: Blob | null
  display: Blob | null
}> {
  try {
    const bitmap = await createImageBitmap(file)
    try {
      const [thumbnail, display] = await Promise.all([
        bitmapToJpegBlob(bitmap, THUMBNAIL_OPTIONS),
        bitmapToJpegBlob(bitmap, DISPLAY_OPTIONS),
      ])
      return { thumbnail, display }
    } finally {
      bitmap.close()
    }
  } catch {
    return { thumbnail: null, display: null }
  }
}

/**
 * Client-side JPEG thumbnail for grid tiles (small uploads vs multi‑MB originals).
 */
export async function createJpegThumbnail(file: File): Promise<Blob | null> {
  const { thumbnail } = await createPhotoDerivatives(file)
  return thumbnail
}

export async function createJpegDisplayImage(file: File): Promise<Blob | null> {
  const { display } = await createPhotoDerivatives(file)
  return display
}
