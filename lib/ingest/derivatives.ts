import sharp from 'sharp'
import {
  AI_TAG_OPTIONS,
  DISPLAY_OPTIONS,
  THUMBNAIL_OPTIONS,
  type DerivativeOptions,
} from '@/lib/utils/imageThumbnail'

/** Formats accepted from a sender, keyed by sharp's detected format. */
const FORMAT_MIME: Record<string, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  tiff: 'image/tiff',
}

/** Sniff the real format from the bytes; null when it is not jpeg/png/webp/tiff. */
export async function detectImageMime(buf: Buffer): Promise<string | null> {
  try {
    const { format } = await sharp(buf).metadata()
    return (format && FORMAT_MIME[format]) || null
  } catch {
    return null
  }
}

/**
 * Server-side twin of `bitmapToJpegBlob` in lib/utils/imageThumbnail.ts: honour
 * EXIF orientation (as createImageBitmap does), fit inside maxDimension without
 * enlarging, encode JPEG at the same quality.
 */
function toJpeg(buf: Buffer, options: DerivativeOptions): Promise<Buffer> {
  return sharp(buf)
    .rotate()
    .resize({
      width: options.maxDimension,
      height: options.maxDimension,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: Math.round(options.quality * 100) })
    .toBuffer()
}

export async function createServerDerivatives(buf: Buffer): Promise<{
  display: Buffer
  thumbnail: Buffer
  aiTag: Buffer
}> {
  const [display, thumbnail, aiTag] = await Promise.all([
    toJpeg(buf, DISPLAY_OPTIONS),
    toJpeg(buf, THUMBNAIL_OPTIONS),
    toJpeg(buf, AI_TAG_OPTIONS),
  ])
  return { display, thumbnail, aiTag }
}
