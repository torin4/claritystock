'use client'
import { memo, useState, useRef, useCallback, useEffect } from 'react'
import { useUIStore } from '@/stores/ui.store'
import { toggleFavorite } from '@/lib/actions/favorites.actions'
import { recordDownload } from '@/lib/actions/downloads.actions'
import { downloadFromUrl } from '@/lib/photos/downloadFromUrl'
import { getSignedPhotoUrl } from '@/lib/utils/storage'
import { devError } from '@/lib/utils/devLog'
import type { Photo } from '@/lib/types/database.types'

const CAT_COLORS: Record<string, string> = {
  neighborhood: 'var(--accent-light)',
  city: '#c49060',
  condo: '#6a9ec4',
}

const LONG_PRESS_MS = 520
const MOVE_CANCEL_PX = 12

interface Props {
  photo: Photo
  userId: string
  onFavoriteToggle: (id: string, val: boolean) => void
  onDownload: (id: string) => void
  showEdit?: boolean
  canEditPhoto?: (photo: Photo) => boolean
  onEdit?: (id: string) => void
  imageUrl?: string | null
  selectable?: boolean
  selectionMode?: boolean
  selected?: boolean
  onBeginSelection?: (photoId: string) => void
  onToggleSelected?: (photoId: string) => void
}

function PhotoTile({
  photo,
  userId,
  onFavoriteToggle,
  onDownload,
  showEdit,
  canEditPhoto,
  onEdit,
  imageUrl,
  selectable,
  selectionMode,
  selected,
  onBeginSelection,
  onToggleSelected,
}: Props) {
  const allowEdit = canEditPhoto ? canEditPhoto(photo) : Boolean(showEdit)
  const isOwnUpload = Boolean(userId && photo.photographer_id && photo.photographer_id === userId)
  const { openLightbox } = useUIStore()
  const [favLoading, setFavLoading] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pointerStart = useRef<{ x: number; y: number } | null>(null)
  /** Swallow the click that fires after a long-press (avoids toggling selection off). */
  const suppressNextClick = useRef(false)

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    pointerStart.current = null
  }, [])

  useEffect(() => () => clearLongPress(), [clearLongPress])

  async function handleFav(e: React.MouseEvent) {
    e.stopPropagation()
    if (selectionMode) return
    if (favLoading) return
    setFavLoading(true)
    try {
      const next = await toggleFavorite(photo.id)
      onFavoriteToggle(photo.id, next)
    } finally {
      setFavLoading(false)
    }
  }

  async function handleDownload(e: React.MouseEvent) {
    e.stopPropagation()
    if (selectionMode) return
    if (!photo.storage_path) return
    try {
      const href = await getSignedPhotoUrl(photo.storage_path)
      if (!href) return
      await recordDownload(photo.id)
      onDownload(photo.id)
      await downloadFromUrl(href, `${photo.title || 'photo'}.jpg`)
    } catch (err) {
      devError(err)
    }
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (!selectable || selectionMode) return
    if (e.button !== 0) return
    suppressNextClick.current = false
    pointerStart.current = { x: e.clientX, y: e.clientY }
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null
      suppressNextClick.current = true
      onBeginSelection?.(photo.id)
      try {
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(12)
      } catch { /* ignore */ }
    }, LONG_PRESS_MS)
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!pointerStart.current || !longPressTimer.current) return
    const dx = e.clientX - pointerStart.current.x
    const dy = e.clientY - pointerStart.current.y
    if (dx * dx + dy * dy > MOVE_CANCEL_PX * MOVE_CANCEL_PX) clearLongPress()
  }

  function handlePointerEnd() {
    clearLongPress()
  }

  function handleContextMenu(e: React.MouseEvent) {
    if (!selectable) return
    e.preventDefault()
    suppressNextClick.current = true
    onBeginSelection?.(photo.id)
  }

  function handleTileClick() {
    if (suppressNextClick.current) {
      suppressNextClick.current = false
      return
    }
    if (selectionMode) {
      onToggleSelected?.(photo.id)
      return
    }
    openLightbox(photo.id)
  }

  return (
    <div
      className={`ptile${selectionMode ? ' ptile-selecting' : ''}${selected ? ' selected' : ''}`}
      style={selectable && !selectionMode ? { touchAction: 'manipulation' } : undefined}
      onClick={handleTileClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onPointerLeave={handlePointerEnd}
      onContextMenu={handleContextMenu}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="ptile-bg"
          src={imageUrl}
          alt={photo.title}
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      ) : (
        <div className="ptile-bg" style={{ background: 'var(--surface-2)' }} />
      )}

      {photo.category && !selectionMode && (
        <div
          className="ptile-cat-dot"
          style={{ background: CAT_COLORS[photo.category] ?? 'var(--text-3)' }}
        />
      )}

      {selectionMode && (
        <div className="ptile-sel-check" aria-hidden>
          {selected ? (
            <svg className="ptile-sel-check-svg" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path
                d="M2.5 6L5 8.5L9.5 3.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : null}
        </div>
      )}

      <div className="ptile-ov">
        <div className="ptile-title">{photo.title}</div>
        <div className="ptile-meta">
          {photo.photographer?.name ?? 'Unknown'}
          {photo.neighborhood ? ` · ${photo.neighborhood}` : ''}
        </div>
      </div>

      {!selectionMode && (
        <>
          <button
            className={`ptile-fav ${photo.is_favorited ? 'on' : ''}`}
            onClick={handleFav}
            title={photo.is_favorited ? 'Remove from favorites' : 'Add to favorites'}
            aria-label="Toggle favorite"
          >
            {photo.is_favorited ? '♥' : '♡'}
          </button>

          {allowEdit && onEdit ? (
            <button
              className="ptile-dl"
              onClick={e => { e.stopPropagation(); onEdit(photo.id) }}
              title="Edit photo"
              aria-label="Edit photo"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M9 2L11 4L5 10H3V8L9 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
              </svg>
            </button>
          ) : isOwnUpload ? (
            <span className="ptile-own-badge" title="Your upload — download from My Photos">
              Yours
            </span>
          ) : (
            <button
              className={`ptile-dl${photo.is_downloaded_by_me ? ' ptile-dl-saved' : ''}`}
              onClick={handleDownload}
              title={photo.is_downloaded_by_me ? 'Download again' : 'Download'}
              aria-label={photo.is_downloaded_by_me ? 'Download again' : 'Download'}
            >
              {photo.is_downloaded_by_me ? (
                <svg width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path
                    d="M2.5 6L5 8.5L9.5 3.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
                  <path
                    d="M6.5 1v8M3 6.5l3.5 3.5L10 6.5M2 12h9"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          )}
        </>
      )}
    </div>
  )
}

export default memo(PhotoTile)
