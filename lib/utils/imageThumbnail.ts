/**
 * Client-side JPEG thumbnail for grid tiles (small uploads vs multi‑MB originals).
 */
export async function createJpegThumbnail(
  file: File,
  maxDimension = 640,
  quality = 0.82,
): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(file)
    try {
      const scale = Math.min(1, maxDimension / Math.max(bmp.width, bmp.height))
      const w = Math.max(1, Math.round(bmp.width * scale))
      const h = Math.max(1, Math.round(bmp.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(bmp, 0, 0, w, h)
      return await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
      })
    } finally {
      bmp.close()
    }
  } catch {
    return null
  }
}
