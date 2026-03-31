'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import PhotoTile from './PhotoTile'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { getOrCreateSignedUrls, peekCachedSignedUrl } from '@/lib/utils/signedUrlCache'
import type { Photo } from '@/lib/types/database.types'

const GRID_TRANSFORM = { width: 1200, quality: 80 }

interface Props {
  photos: Photo[]
  userId: string
  onFavoriteToggle: (id: string, val: boolean) => void
  onDownload: (id: string) => void
  showEdit?: boolean
  /** When set, overrides `showEdit` per tile (e.g. only your uploads in "My downloads"). */
  canEditPhoto?: (photo: Photo) => boolean
  onEdit?: (id: string) => void
  /** My Photos: long-press / right-click to select & bulk-delete */
  selectable?: boolean
  selectionMode?: boolean
  selectedIds?: string[]
  onBeginSelection?: (photoId: string) => void
  onToggleSelected?: (photoId: string) => void
  /** Collection drill: group photos by `subarea` with section headers. */
  groupBySubarea?: boolean
  /** Section title for photos missing `subarea`. */
  emptySubareaLabel?: string
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
  groupBySubarea,
  emptySubareaLabel = 'No sub-location',
}: Props) {
  const displayPathsKey = useMemo(
    () =>
      Array.from(
        new Set(
          photos
            .map((photo) => photo.display_path ?? photo.storage_path)
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

  // Only use transformed URLs — never fall back to server-provided thumbnail_url
  // which lacks the transform and would show low-res images.
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      displayPaths
        .map((path) => [path, peekCachedSignedUrl(path, GRID_TRANSFORM)] as const)
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
      const known = peekCachedSignedUrl(path, GRID_TRANSFORM) ?? signedUrlsRef.current[path]
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
      const urls = await getOrCreateSignedUrls(supabase, missing, 3600, GRID_TRANSFORM)
      if (cancelled) return
      setSignedUrls((prev) => ({ ...prev, ...urls }))
    })()

    return () => {
      cancelled = true
    }
  }, [displayPaths])

  const bySubarea = useMemo(() => {
    if (!groupBySubarea) return null
    const map = new Map<string, Photo[]>()
    for (const p of photos) {
      const key = (p.subarea ?? '').trim()
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(p)
    }
    const keys = Array.from(map.keys()).sort((a, b) => a.localeCompare(b))
    // Keep empty first so "No sub-location" is easy to find.
    if (keys.includes('')) {
      const rest = keys.filter((k) => k !== '')
      return { keys: ['', ...rest], map }
    }
    return { keys, map }
  }, [groupBySubarea, photos])

  const renderTiles = (list: Photo[]) => (
    <div className={`photo-grid${selectionMode ? ' photo-grid-selecting' : ''}`}>
      {list.map(photo => (
        <PhotoTile
          key={photo.id}
          photo={photo}
          userId={userId}
          imageUrl={signedUrls[photo.display_path ?? photo.storage_path ?? ''] ?? null}
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

  if (bySubarea) {
    return (
      <div style={{ display: 'grid', gap: 18 }}>
        {bySubarea.keys.map((k) => {
          const label = k ? k : emptySubareaLabel
          const list = bySubarea.map.get(k) ?? []
          if (!list.length) return null
          return (
            <section key={k || '__none__'}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--text-2)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: 10,
                }}
              >
                {label}
              </div>
              {renderTiles(list)}
            </section>
          )
        })}
      </div>
    )
  }

  return (
    renderTiles(photos)
  )
}
