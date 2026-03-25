'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import PhotoTile from './PhotoTile'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { getOrCreateSignedUrls, peekCachedSignedUrl } from '@/lib/utils/signedUrlCache'
import type { Photo } from '@/lib/types/database.types'

interface Props {
  photos: Photo[]
  userId: string
  onFavoriteToggle: (id: string, val: boolean) => void
  onDownload: (id: string) => void
  showEdit?: boolean
  /** When set, overrides `showEdit` per tile (e.g. only your uploads in “My downloads”). */
  canEditPhoto?: (photo: Photo) => boolean
  onEdit?: (id: string) => void
  /** My Photos: long-press / right-click to select & bulk-delete */
  selectable?: boolean
  selectionMode?: boolean
  selectedIds?: string[]
  onBeginSelection?: (photoId: string) => void
  onToggleSelected?: (photoId: string) => void
}

export default function PhotoGrid({
  photos,
  userId,
  onFavoriteToggle,
  onDownload,
  showEdit,
  canEditPhoto,
  onEdit,
  selectable,
  selectionMode,
  selectedIds,
  onBeginSelection,
  onToggleSelected,
}: Props) {
  const displayPathsKey = useMemo(
    () =>
      Array.from(
        new Set(
          photos
            .map((photo) => photo.thumbnail_path ?? photo.storage_path)
            .filter((path): path is string => Boolean(path)),
        ),
      ).join('\n'),
    [photos],
  )
  const displayPaths = useMemo(
    () => (displayPathsKey ? displayPathsKey.split('\n') : []),
    [displayPathsKey],
  )
  const selectedSet = useMemo(() => new Set(selectedIds ?? []), [selectedIds])
  const providedUrls = useMemo(
    () =>
      Object.fromEntries(
        photos
          .map((photo) => {
            const path = photo.thumbnail_path ?? photo.storage_path
            return path && photo.thumbnail_url ? ([path, photo.thumbnail_url] as const) : null
          })
          .filter((entry): entry is readonly [string, string] => Boolean(entry)),
      ),
    [photos],
  )
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      displayPaths
        .map((path) => [path, peekCachedSignedUrl(path) ?? providedUrls[path]] as const)
        .filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
    ),
  )
  const signedUrlsRef = useRef(signedUrls)

  useEffect(() => {
    signedUrlsRef.current = signedUrls
  }, [signedUrls])

  useEffect(() => {
    if (!displayPaths.length) {
      setSignedUrls({})
      return
    }

    const next: Record<string, string> = {}
    const missing: string[] = []
    for (const path of displayPaths) {
      const known = peekCachedSignedUrl(path) ?? providedUrls[path] ?? signedUrlsRef.current[path]
      if (known) {
        next[path] = known
      } else {
        missing.push(path)
      }
    }
    setSignedUrls(next)

    if (!missing.length) return

    let cancelled = false
    ;(async () => {
      const supabase = getSupabaseBrowserClient()
      const urls = await getOrCreateSignedUrls(supabase, missing, 3600)
      if (cancelled) return
      setSignedUrls((prev) => ({ ...prev, ...urls }))
    })()

    return () => {
      cancelled = true
    }
  }, [displayPaths, providedUrls])

  return (
    <div className={`photo-grid${selectionMode ? ' photo-grid-selecting' : ''}`}>
      {photos.map(photo => (
        <PhotoTile
          key={photo.id}
          photo={photo}
          userId={userId}
          imageUrl={signedUrls[photo.thumbnail_path ?? photo.storage_path ?? ''] ?? photo.thumbnail_url ?? null}
          onFavoriteToggle={onFavoriteToggle}
          onDownload={onDownload}
          showEdit={showEdit}
          canEditPhoto={canEditPhoto}
          onEdit={onEdit}
          selectable={selectable}
          selectionMode={selectionMode}
          selected={selectedSet.has(photo.id)}
          onBeginSelection={onBeginSelection}
          onToggleSelected={onToggleSelected}
        />
      ))}
    </div>
  )
}
