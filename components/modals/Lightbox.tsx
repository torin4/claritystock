'use client'
import { useState, useEffect, useLayoutEffect, useCallback, useMemo } from 'react'
import { useUIStore } from '@/stores/ui.store'
import { recordDownload, updateJobRef } from '@/lib/actions/downloads.actions'
import { getSignedPhotoUrl } from '@/lib/utils/storage'
import { useSignedPhotoUrl } from '@/lib/hooks/useSignedPhotoUrl'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import type { Photo, Download } from '@/lib/types/database.types'

const CAT_COLORS: Record<string, string> = {
  neighborhood: 'var(--accent-light)',
  city: '#c49060',
  condo: '#6a9ec4',
}

interface Props {
  photos: Photo[]
  userId: string
  onDownload: (id: string) => void
}

interface DownloadRow {
  id: string
  photo_id: string
  downloaded_by: string
  job_ref: string | null
  created_at: string
  downloader?: { name: string | null; initials: string | null }
}

export default function Lightbox({ photos, userId, onDownload }: Props) {
  const lightboxOpen = useUIStore(s => s.lightboxOpen)
  const lightboxPhotoId = useUIStore(s => s.lightboxPhotoId)
  const closeLightbox = useUIStore(s => s.closeLightbox)
  const openLightbox = useUIStore(s => s.openLightbox)

  const currentIndex = lightboxPhotoId ? photos.findIndex(p => p.id === lightboxPhotoId) : -1
  const prevId = currentIndex > 0 ? photos[currentIndex - 1].id : null
  const nextId = currentIndex < photos.length - 1 && currentIndex >= 0 ? photos[currentIndex + 1].id : null
  const showPager = photos.length > 1 && currentIndex >= 0
  const pagerText = showPager ? `${currentIndex + 1} / ${photos.length}` : null

  const [downloadId, setDownloadId] = useState<string | null>(null)
  const [jobRef, setJobRef] = useState('')
  const [jobLogOpen, setJobLogOpen] = useState(false)
  const [jobSaved, setJobSaved] = useState(false)
  const [histOpen, setHistOpen] = useState(false)
  const [usageHistory, setUsageHistory] = useState<DownloadRow[]>([])
  const [displayImageLoaded, setDisplayImageLoaded] = useState(false)

  const photo = useMemo(
    () => (lightboxPhotoId ? photos.find(p => p.id === lightboxPhotoId) ?? null : null),
    [lightboxPhotoId, photos],
  )

  /** Primitive dep: avoids effect re-running every render when `photos` is a new array reference. */
  const photoPresent = useMemo(
    () => (!lightboxPhotoId ? true : photos.some(p => p.id === lightboxPhotoId)),
    [lightboxPhotoId, photos],
  )

  useEffect(() => {
    setDownloadId(null)
    setJobRef('')
    setJobLogOpen(false)
    setJobSaved(false)
    setHistOpen(false)
    setUsageHistory([])
  }, [lightboxPhotoId])

  const previewPath = photo?.thumbnail_path ?? photo?.display_path ?? photo?.storage_path ?? null
  const displayPath = photo?.display_path ?? photo?.storage_path ?? null

  useEffect(() => {
    setDisplayImageLoaded(false)
  }, [photo?.id, lightboxOpen])

  /** Close stale lightbox id before paint — avoids flash + getState() avoids effect/deps churn with zustand actions. */
  useLayoutEffect(() => {
    if (!lightboxOpen || !lightboxPhotoId || photoPresent) return
    useUIStore.getState().closeLightbox()
  }, [lightboxOpen, lightboxPhotoId, photoPresent])

  const fetchHistory = useCallback(async (photoId: string) => {
    const supabase = getSupabaseBrowserClient()
    const { data } = await supabase
      .from('downloads')
      .select('*, downloader:users!downloaded_by(name, initials)')
      .eq('photo_id', photoId)
      .order('created_at', { ascending: false })
      .limit(20)
    setUsageHistory((data as DownloadRow[]) ?? [])
  }, [])

  const handleDownload = async () => {
    if (!photo?.storage_path) return
    try {
      const href = await getSignedPhotoUrl(photo.storage_path)
      const id = await recordDownload(photo.id)
      setDownloadId(id)
      setJobLogOpen(true)
      onDownload(photo.id)
      if (href) {
        const a = document.createElement('a')
        a.href = href
        a.download = photo.title + '.jpg'
        a.target = '_blank'
        a.click()
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleJobLog = async () => {
    if (!downloadId || !jobRef.trim()) return
    try {
      await updateJobRef(downloadId, jobRef.trim())
      setJobSaved(true)
      setJobLogOpen(false)
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    if (!lightboxOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox()
      if (e.key === 'ArrowLeft' && prevId) openLightbox(prevId)
      if (e.key === 'ArrowRight' && nextId) openLightbox(nextId)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lightboxOpen, closeLightbox, prevId, nextId, openLightbox])

  const previewUrl = useSignedPhotoUrl(previewPath, {
    enabled: lightboxOpen && !!previewPath,
    initialUrl: photo?.thumbnail_url ?? null,
  })
  const displayImageUrl = useSignedPhotoUrl(displayPath, {
    enabled: lightboxOpen && !!displayPath,
    initialUrl: displayPath === previewPath ? previewUrl : null,
  })
  const showDisplayImage = !!displayImageUrl && displayImageLoaded
  const backdropUrl = previewUrl ?? displayImageUrl
  const showLoadingOverlay = !!displayPath && !showDisplayImage
  const isDone = !!downloadId

  if (!lightboxOpen) return null

  return (
    <div className={`lightbox ${lightboxOpen ? 'open' : ''}`}>
      <div className="lb-body">
        {/* Image area */}
        <div className="lb-img-area">
          {backdropUrl ? (
            <div className="lb-img-backdrop-layer" aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={`lb-img-backdrop${showDisplayImage ? ' is-settled' : ''}`}
                src={backdropUrl}
                alt=""
              />
            </div>
          ) : (
            <div className="lb-img-backdrop-fallback" aria-hidden />
          )}
          <div className={`lb-img-backdrop-wash${showDisplayImage ? ' is-settled' : ''}`} aria-hidden />
          <div className="lb-img-stack">
            {showLoadingOverlay ? (
              <div className={`lb-loading-overlay${showDisplayImage ? ' is-hidden' : ''}`} role="status" aria-live="polite">
                <div className="lb-loading-chip">
                  <span className="lb-loading-spinner" aria-hidden />
                  <span>Loading photo…</span>
                </div>
              </div>
            ) : null}
            {displayImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className={`lb-img lb-img-display${showDisplayImage ? ' is-ready' : ''}`}
                src={displayImageUrl}
                alt={photo?.title}
                onLoad={() => setDisplayImageLoaded(true)}
              />
            ) : null}
            {!backdropUrl && !showDisplayImage ? (
              <div className="lb-img lb-img-placeholder" />
            ) : null}
          </div>
          {prevId && (
            <button type="button" className="lb-arrow lb-prev" onClick={() => openLightbox(prevId)} aria-label="Previous photo">
              ‹
            </button>
          )}
          {nextId && (
            <button type="button" className="lb-arrow lb-next" onClick={() => openLightbox(nextId)} aria-label="Next photo">
              ›
            </button>
          )}
          {/* Keyboard hint: desktop only — on mobile the panel shows pager + tap prev/next */}
          {showPager ? (
            <div className="lb-kbd-hint" aria-hidden>
              <span className="lb-kbd-key">←</span>
              <span className="lb-kbd-key">→</span>
              <span>navigate</span>
              <span className="lb-kbd-key lb-kbd-key--wide">esc</span>
              <span>close</span>
            </div>
          ) : null}
        </div>

        {/* Info panel */}
        <div className="lb-panel">
          <div className="lb-panel-close">
            <div className="lb-panel-close-lead">
              <span className="lb-panel-title">Photo</span>
              {pagerText ? <span className="lb-panel-pager">{pagerText}</span> : null}
            </div>
            <div className="lb-panel-close-actions">
              {showPager ? (
                <div className="lb-panel-mobile-nav" aria-label="Photo navigation">
                  <button
                    type="button"
                    className="lb-panel-nav-btn"
                    disabled={!prevId}
                    onClick={() => prevId && openLightbox(prevId)}
                    aria-label="Previous photo"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className="lb-panel-nav-btn"
                    disabled={!nextId}
                    onClick={() => nextId && openLightbox(nextId)}
                    aria-label="Next photo"
                  >
                    ›
                  </button>
                </div>
              ) : null}
              <button type="button" className="lb-panel-close-btn" onClick={closeLightbox} aria-label="Close">
                ✕
              </button>
            </div>
          </div>

          {/* Download button */}
          <button
            type="button"
            className={`lb-dl-btn${isDone ? ' lb-dl-saved' : ''}`}
            onClick={isDone ? undefined : handleDownload}
            disabled={isDone}
          >
            {isDone ? (
              <>
                <svg className="lb-dl-ic lb-dl-check" width="16" height="16" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path
                    d="M2.5 6L5 8.5L9.5 3.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>In your library</span>
              </>
            ) : (
              <>
                <svg className="lb-dl-ic" width="15" height="15" viewBox="0 0 13 13" fill="none" aria-hidden>
                  <path
                    d="M6.5 1v8M3 6.5l3.5 3.5L10 6.5M2 12h9"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>Download</span>
              </>
            )}
          </button>

          {/* Job ref log */}
          {jobLogOpen && !jobSaved && (
            <div className="lb-log open">
              <div className="lb-log-lbl">Which job is this for?</div>
              <div className="lb-log-row">
                <input
                  className="lb-log-input"
                  value={jobRef}
                  onChange={e => setJobRef(e.target.value)}
                  placeholder="e.g. Toll Brothers Q2"
                  onKeyDown={e => e.key === 'Enter' && handleJobLog()}
                />
                <button className="lb-log-btn" onClick={handleJobLog}>Log</button>
              </div>
              <span className="lb-log-skip" onClick={() => setJobLogOpen(false)}>Skip</span>
            </div>
          )}
          {jobSaved && (
            <div className="lb-log-done show">✓ Job ref saved: {jobRef}</div>
          )}

          {/* Title & category */}
          {photo && (
            <>
              <div className="lb-sec">
                <div className="lb-title">{photo.title}</div>
                <div className="lb-cat-row">
                  {photo.category && (
                    <div className="lb-cat-dot" style={{ background: CAT_COLORS[photo.category] }} />
                  )}
                  <span className="lb-cat-txt">{photo.category ?? '—'}</span>
                  <span className="lb-uses">{photo.downloads_count} use{photo.downloads_count !== 1 ? 's' : ''}</span>
                </div>
              </div>

              {/* Metadata */}
              <div className="lb-sec">
                <div className="lb-mr">
                  <span className="lb-mk">Photographer</span>
                  <span className="lb-mv">{photo.photographer?.name ?? '—'}</span>
                </div>
                <div className="lb-mr">
                  <span className="lb-mk">Collection</span>
                  <span className="lb-mv">{photo.collection?.name ?? '—'}</span>
                </div>
                <div className="lb-mr">
                  <span className="lb-mk">Location</span>
                  <span className="lb-mv">
                    {[photo.neighborhood, photo.subarea].filter(Boolean).join(', ') || '—'}
                  </span>
                </div>
                <div className="lb-mr">
                  <span className="lb-mk">Captured</span>
                  <span className="lb-mv">
                    {photo.captured_date ? new Date(photo.captured_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                  </span>
                </div>
              </div>

              {/* Tags */}
              {photo.tags && photo.tags.length > 0 && (
                <div className="lb-sec">
                  <div className="lb-tags">
                    {photo.tags.map(tag => (
                      <span key={tag} className="lb-tag">{tag}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Usage history toggle */}
              <div
                className="lb-hist-toggle"
                onClick={() => {
                  const next = !histOpen
                  setHistOpen(next)
                  if (next) fetchHistory(photo.id)
                }}
              >
                <span className="lb-hist-label">Usage history</span>
                <span className="lb-hist-caret">{histOpen ? 'Hide ↑' : 'Show ↓'}</span>
              </div>
              {histOpen && (
                <div className="lb-hist-body open">
                  <table className="utbl">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Job ref</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usageHistory.length === 0 ? (
                        <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-3)' }}>No downloads yet</td></tr>
                      ) : usageHistory.map(d => (
                        <tr key={d.id}>
                          <td>{d.downloader?.name ?? '—'}</td>
                          <td>{d.job_ref ?? '—'}</td>
                          <td>{new Date(d.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
