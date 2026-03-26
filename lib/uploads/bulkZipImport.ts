import JSZip from 'jszip'
import { PHOTO_TAG_NEEDS_LOCATION } from '@/lib/constants/photoTags'
import {
  formDefaultsFromAi,
  MAX_UPLOAD_BYTES,
  neighborhoodFromCoordinates,
} from '@/lib/uploads/processImageForPublish'
import { extractGps } from '@/lib/utils/exif'
import type { AiTagResult, Category, PhotoFormValues } from '@/lib/types/database.types'

/** Cap per ZIP — keeps browser memory and long-running import manageable. */
export const MAX_BULK_IMAGES = 100
export const BULK_CONCURRENCY = 2

/** Empty string = file at ZIP root — not assigned to any collection. */
export const BULK_NO_FOLDER = ''

const IMAGE_RE = /\.(jpe?g|png|webp|heic|heif)$/i

function isImagePath(path: string): boolean {
  const base = path.split('/').pop() ?? ''
  if (base.startsWith('.') || base === 'Thumbs.db') return false
  return IMAGE_RE.test(base)
}

export type BulkZipEntry = {
  relativePath: string
  folderName: string
  file: File
}

/** Expand ZIP to flat list of images with folder = first path segment (`""` = ZIP root, no collection). */
export async function parseBulkZipToEntries(zipFile: File): Promise<BulkZipEntry[]> {
  const buf = await zipFile.arrayBuffer()
  const zip = await JSZip.loadAsync(buf)
  const out: BulkZipEntry[] = []

  const names = Object.keys(zip.files).sort()
  for (const path of names) {
    const entry = zip.files[path]
    if (!entry || entry.dir) continue
    const normalized = path.replace(/\\/g, '/')
    if (normalized.includes('__MACOSX/') || normalized.includes('.DS_Store')) continue
    if (!isImagePath(normalized)) continue

    const parts = normalized.split('/').filter(Boolean)
    if (parts.length < 1) continue
    const fileName = parts[parts.length - 1]
    let folderName: string
    if (parts.length === 1) {
      folderName = BULK_NO_FOLDER
    } else {
      folderName = parts[0].trim() || BULK_NO_FOLDER
    }

    const blob = await entry.async('blob')
    const imageFile = new File([blob], fileName, { type: blob.type || 'image/jpeg' })
    if (imageFile.size > MAX_UPLOAD_BYTES) continue

    out.push({ relativePath: normalized, folderName, file: imageFile })
    if (out.length >= MAX_BULK_IMAGES) break
  }

  return out
}

export async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      const item = items[idx]
      if (item !== undefined) await fn(item, idx)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
}

export async function buildFormForBulkFile(
  file: File,
  collectionId: string | null,
  ai: AiTagResult | null,
): Promise<PhotoFormValues> {
  const gps = await extractGps(file)
  let neighborhood: string | null = null
  if (gps?.lat != null && gps?.lng != null) {
    neighborhood = await neighborhoodFromCoordinates(gps.lat, gps.lng)
  }
  const fromAi = formDefaultsFromAi(ai)
  const title = (fromAi.title ?? file.name.replace(/\.[^.]+$/, '')).trim() || 'Untitled'
  const category = (fromAi.category ?? 'neighborhood') as Category
  const baseTags = [...(fromAi.tags ?? ai?.tags ?? [])]
  const tagsWithout = baseTags.filter((t) => t !== PHOTO_TAG_NEEDS_LOCATION)
  const hasLocation = Boolean(neighborhood?.trim())
  const tags = hasLocation ? tagsWithout : [...tagsWithout, PHOTO_TAG_NEEDS_LOCATION]
  return {
    title,
    category,
    collection_id: collectionId,
    new_collection_name: null,
    neighborhood,
    subarea: null,
    captured_date: null,
    tags,
    notes: null,
  }
}

