import { createServiceClient } from '@/lib/supabase/service'

const DEFAULT_EXPIRES_SEC = 3600

type PhotoAssetRow = {
  storage_path?: string | null
  thumbnail_path?: string | null
  thumbnail_url?: string | null
}

type CollectionPreviewRow<TPhoto extends PhotoAssetRow = PhotoAssetRow> = {
  photos?: TPhoto[] | null
}

type StorageBucket = ReturnType<ReturnType<typeof createServiceClient>['storage']['from']>

function getPhotoStorage() {
  return createServiceClient().storage.from('photos') as StorageBucket & {
    createSignedUrls?: (
      paths: string[],
      expiresIn: number,
    ) => Promise<{ data?: { path: string; signedUrl: string }[] | null; error?: unknown }>
  }
}

export async function getSignedPhotoUrls(
  paths: Array<string | null | undefined>,
  expiresSec = DEFAULT_EXPIRES_SEC,
): Promise<Record<string, string>> {
  const uniquePaths = Array.from(new Set(paths.filter((path): path is string => Boolean(path))))
  if (!uniquePaths.length) return {}

  const storage = getPhotoStorage()

  if (typeof storage.createSignedUrls === 'function') {
    const { data, error } = await storage.createSignedUrls(uniquePaths, expiresSec)
    if (!error && data?.length) {
      return Object.fromEntries(
        data
          .flatMap((entry) => (
            entry?.path && entry?.signedUrl ? [[entry.path, entry.signedUrl] as const] : []
          )),
      )
    }
  }

  const pairs = await Promise.all(
    uniquePaths.map(async (path) => {
      const { data, error } = await storage.createSignedUrl(path, expiresSec)
      return [path, error || !data?.signedUrl ? null : data.signedUrl] as const
    }),
  )

  return Object.fromEntries(
    pairs.filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
  )
}

export async function getSignedPhotoUrl(
  path: string | null | undefined,
  expiresSec = DEFAULT_EXPIRES_SEC,
): Promise<string | null> {
  if (!path) return null
  const urls = await getSignedPhotoUrls([path], expiresSec)
  return urls[path] ?? null
}

export async function attachSignedThumbnailUrls<T extends PhotoAssetRow>(
  rows: T[],
  options?: { limit?: number; expiresSec?: number },
): Promise<Array<T & { thumbnail_url?: string }>> {
  const limit = Math.max(0, Math.min(options?.limit ?? rows.length, rows.length))
  if (!limit) return rows as Array<T & { thumbnail_url?: string }>

  const paths = rows
    .slice(0, limit)
    .map((row) => row.thumbnail_path ?? row.storage_path)

  const urls = await getSignedPhotoUrls(paths, options?.expiresSec)

  return rows.map((row, index) => {
    if (index >= limit) return row
    const path = row.thumbnail_path ?? row.storage_path
    if (!path) return row
    const url = urls[path]
    return url ? { ...row, thumbnail_url: url } : row
  }) as Array<T & { thumbnail_url?: string }>
}

export async function attachSignedCollectionPreviewUrls<
  TCollection extends CollectionPreviewRow<TPhoto>,
  TPhoto extends PhotoAssetRow,
>(
  collections: TCollection[],
  options?: { limitCollections?: number; photosPerCollection?: number; expiresSec?: number },
): Promise<Array<TCollection & { photos?: Array<TPhoto & { thumbnail_url?: string }> }>> {
  const limitCollections = Math.max(0, Math.min(options?.limitCollections ?? collections.length, collections.length))
  const photosPerCollection = Math.max(0, options?.photosPerCollection ?? 3)
  if (!limitCollections || !photosPerCollection) {
    return collections as Array<TCollection & { photos?: Array<TPhoto & { thumbnail_url?: string }> }>
  }

  const paths: string[] = []
  for (let collectionIndex = 0; collectionIndex < limitCollections; collectionIndex++) {
    const photos = collections[collectionIndex]?.photos ?? []
    for (let photoIndex = 0; photoIndex < Math.min(photos.length, photosPerCollection); photoIndex++) {
      const path = photos[photoIndex]?.thumbnail_path ?? photos[photoIndex]?.storage_path
      if (path) paths.push(path)
    }
  }

  const urls = await getSignedPhotoUrls(paths, options?.expiresSec)

  return collections.map((collection, collectionIndex) => {
    if (collectionIndex >= limitCollections || !collection.photos?.length) return collection

    return {
      ...collection,
      photos: collection.photos.map((photo, photoIndex) => {
        if (photoIndex >= photosPerCollection) return photo
        const path = photo.thumbnail_path ?? photo.storage_path
        if (!path) return photo
        const url = urls[path]
        return url ? { ...photo, thumbnail_url: url } : photo
      }),
    }
  }) as Array<TCollection & { photos?: Array<TPhoto & { thumbnail_url?: string }> }>
}
