'use client'
import { useEffect, useMemo, useState } from 'react'
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
  const displayPaths = useMemo(
    () =>
      Array.from(
        new Set(
          photos
            .map((photo) => photo.thumbnail_path ?? photo.storage_path)
            .filter((path): path is string => Boolean(path)),
        ),
      ),
    [photos],
  )
  const displayKey = displayPaths.join('|')
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      displayPaths
        .map((path) => [path, peekCachedSignedUrl(path)] as const)
        .filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
    ),
  )

  useEffect(() => {
    if (!displayPaths.length) {
      setSignedUrls({})
      return
    }

    setSignedUrls(
      Object.fromEntries(
        displayPaths
          .map((path) => [path, peekCachedSignedUrl(path)] as const)
          .filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
      ),
    )

    let cancelled = false
    ;(async () => {
      const supabase = getSupabaseBrowserClient()
      const urls = await getOrCreateSignedUrls(supabase, displayPaths, 3600)
      if (cancelled) return
      setSignedUrls(urls)
    })()

    return () => {
      cancelled = true
    }
  }, [displayKey, displayPaths])

  return (
    <div className={`photo-grid${selectionMode ? ' photo-grid-selecting' : ''}`}>
      {photos.map(photo => (
        <PhotoTile
          key={photo.id}
          photo={photo}
          userId={userId}
          imageUrl={signedUrls[photo.thumbnail_path ?? photo.storage_path ?? ''] ?? null}
          onFavoriteToggle={onFavoriteToggle}
          onDownload={onDownload}
          showEdit={showEdit}
          canEditPhoto={canEditPhoto}
          onEdit={onEdit}
          selectable={selectable}
          selectionMode={selectionMode}
          selected={selectedIds?.includes(photo.id) ?? false}
          onBeginSelection={onBeginSelection}
          onToggleSelected={onToggleSelected}
        />
      ))}
    </div>
  )
}
