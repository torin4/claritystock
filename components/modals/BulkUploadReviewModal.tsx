'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useUIStore } from '@/stores/ui.store'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { PHOTO_TAG_NEEDS_LOCATION } from '@/lib/constants/photoTags'
import { publishPhotoFromStagingSnapshot } from '@/lib/uploads/processImageForPublish'
import { useSignedPhotoUrl } from '@/lib/hooks/useSignedPhotoUrl'
import LocationField from '@/components/neighborhoods/LocationField'
import { getNeighborhoodCanonicalLabels } from '@/lib/actions/neighborhoods.actions'
import { updatePhotosCategoryNeighborhood, updatePhotosCollectionIds } from '@/lib/actions/photos.actions'
import { getOrCreateCollectionByName } from '@/lib/actions/collections.actions'
import type { PhotoFormValues } from '@/lib/types/database.types'

type BulkItemRow = {
  id: string
  relative_path: string
  folder_name: string
  status: string
  photo_id: string | null
  error_message: string | null
  storage_path: string | null
  thumbnail_path: string | null
  display_path: string | null
  content_hash: string | null
  form_snapshot: Record<string, unknown> | null
}

type JobSummary = {
  success_count?: number
  failed_count?: number
  needs_location_count?: number
}

function parseSnapshot(raw: Record<string, unknown> | null): {
  form: PhotoFormValues
  description: string | null
} | null {
  if (!raw || typeof raw !== 'object') return null
  const form = raw.form as PhotoFormValues | undefined
  if (!form) return null
  const cid = form.collection_id
  if (cid !== null && typeof cid !== 'string') return null
  const description = (raw.description as string | null | undefined) ?? null
  return { form, description }
}

function ItemThumb({ path }: { path: string | null }) {
  const url = useSignedPhotoUrl(path, { enabled: !!path })
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" style={{ width: 48, height: 48, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
  ) : (
    <div style={{ width: 48, height: 48, borderRadius: 4, background: 'var(--surface-2)', flexShrink: 0 }} />
  )
}

interface Props {
  userId: string
}

export default function BulkUploadReviewModal({ userId }: Props) {
  const bulkReviewJobId = useUIStore((s) => s.bulkReviewJobId)
  const closeBulkReview = useUIStore((s) => s.closeBulkReview)
  const openEdit = useUIStore((s) => s.openEdit)
  const [loading, setLoading] = useState(true)
  const [jobSummary, setJobSummary] = useState<JobSummary | null>(null)
  const [items, setItems] = useState<BulkItemRow[]>([])
  const [needsLocationPhotoIds, setNeedsLocationPhotoIds] = useState<string[]>([])
  const [missingLocationOrCategoryPhotoIds, setMissingLocationOrCategoryPhotoIds] = useState<string[]>([])
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([])
  const [jobPhotographerId, setJobPhotographerId] = useState<string | null>(null)
  const [locationLabels, setLocationLabels] = useState<string[]>([])
  const [bulkCollectionName, setBulkCollectionName] = useState('')
  const [bulkNeighborhood, setBulkNeighborhood] = useState('')
  const [bulkSubarea, setBulkSubarea] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [allSetDismissed, setAllSetDismissed] = useState(false)

  useEffect(() => {
    getNeighborhoodCanonicalLabels()
      .then(setLocationLabels)
      .catch(() => setLocationLabels([]))
  }, [])

  const load = useCallback(async () => {
    if (!bulkReviewJobId) return
    setLoading(true)
    setError(null)
    setAllSetDismissed(false)
    try {
      const res = await fetch(`/api/bulk-upload/jobs/${bulkReviewJobId}`, { credentials: 'same-origin' })
      const body = (await res.json()) as {
        error?: string
        job?: { summary: unknown; status: string; photographerId?: string }
        items?: BulkItemRow[]
        needsLocationPhotoIds?: string[]
        missingLocationOrCategoryPhotoIds?: string[]
      }
      if (!res.ok) {
        setError(body.error ?? res.statusText)
        setItems([])
        setNeedsLocationPhotoIds([])
        setMissingLocationOrCategoryPhotoIds([])
        setSelectedPhotoIds([])
        setLoading(false)
        return
      }
      setJobSummary((body.job?.summary as JobSummary) ?? {})
      setJobPhotographerId(body.job?.photographerId ?? null)
      const nextItems = body.items ?? []
      setItems(nextItems)
      const needs = body.needsLocationPhotoIds ?? []
      setNeedsLocationPhotoIds(needs)
      setMissingLocationOrCategoryPhotoIds(body.missingLocationOrCategoryPhotoIds ?? [])
      // Start unchecked by default; user chooses selection explicitly.
      setSelectedPhotoIds([])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load job')
      setItems([])
      setNeedsLocationPhotoIds([])
      setMissingLocationOrCategoryPhotoIds([])
      setSelectedPhotoIds([])
    }
    setLoading(false)
  }, [bulkReviewJobId])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    setBulkCollectionName('')
    setBulkNeighborhood('')
    setBulkSubarea('')
  }, [bulkReviewJobId])

  const selectedSet = useMemo(() => new Set(selectedPhotoIds), [selectedPhotoIds])

  const togglePhotoId = (id: string) => {
    setSelectedPhotoIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  const successItems = useMemo(
    () => items.filter((i) => i.status === 'success' && i.photo_id),
    [items],
  )

  const allPhotoIds = useMemo(() => successItems.map((i) => i.photo_id!), [successItems])

  const checkAll = () => setSelectedPhotoIds(allPhotoIds)
  const uncheckAll = () => setSelectedPhotoIds([])

  // Group by folder_name for collection view
  const byCollection = useMemo(() => {
    const map = new Map<string, BulkItemRow[]>()
    for (const item of successItems) {
      const key = item.folder_name || ''
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(item)
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (!a && b) return 1
      if (a && !b) return -1
      return a.localeCompare(b)
    })
  }, [successItems])

  const needsLocSet = useMemo(() => new Set(needsLocationPhotoIds), [needsLocationPhotoIds])

  const handleBulkApply = async () => {
    const ids = selectedPhotoIds.filter(Boolean)
    if (!ids.length) { setError('Select at least one photo.'); return }
    const applyCollection = bulkCollectionName.trim().length > 0
    const applyNeigh = bulkNeighborhood.trim().length > 0
    const applySub = bulkSubarea.trim().length > 0
    if (!applyCollection && !applyNeigh && !applySub) {
      setError('Choose a collection and/or neighborhood and/or sub-area to apply.')
      return
    }
    setBulkBusy(true)
    setError(null)
    try {
      if (applyCollection) {
        const { id } = await getOrCreateCollectionByName({
          name: bulkCollectionName.trim(),
          ownerId: jobPhotographerId ?? undefined,
        })
        await updatePhotosCollectionIds(
          ids,
          id,
          jobPhotographerId ? { photographerId: jobPhotographerId } : undefined,
        )
      }
      await updatePhotosCategoryNeighborhood(ids, {
        ...(applyNeigh ? { neighborhood: bulkNeighborhood.trim() } : {}),
        ...(applySub ? { subarea: bulkSubarea.trim() } : {}),
        ...(jobPhotographerId ? { photographerId: jobPhotographerId } : {}),
      })
      setBulkCollectionName('')
      setBulkNeighborhood('')
      setBulkSubarea('')
      await load()
      // After applying, clear selection so nothing remains checked.
      setSelectedPhotoIds([])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bulk update failed')
    } finally {
      setBulkBusy(false)
    }
  }

  const handleRetry = async (item: BulkItemRow) => {
    const parsed = parseSnapshot(item.form_snapshot)
    if (!item.storage_path || !parsed) {
      setError('Cannot retry — files were not uploaded. Re-import from a new ZIP.')
      return
    }
    setRetryingId(item.id)
    setError(null)
    try {
      const photoId = await publishPhotoFromStagingSnapshot({
        userId,
        storagePath: item.storage_path,
        thumbnailPath: item.thumbnail_path,
        displayPath: item.display_path,
        contentHash: item.content_hash,
        form: parsed.form,
        description: parsed.description,
      })
      const supabase = getSupabaseBrowserClient()
      await supabase
        .from('bulk_upload_items')
        .update({ status: 'success', photo_id: photoId, error_message: null, form_snapshot: null })
        .eq('id', item.id)
      setItems((prev) =>
        prev.map((r) =>
          r.id === item.id
            ? { ...r, status: 'success', photo_id: photoId, error_message: null, form_snapshot: null }
            : r,
        ),
      )
      setJobSummary((prev) => ({
        success_count: (prev?.success_count ?? 0) + 1,
        failed_count: Math.max(0, (prev?.failed_count ?? 1) - 1),
        needs_location_count:
          (prev?.needs_location_count ?? 0) +
          (parsed.form.tags?.includes(PHOTO_TAG_NEEDS_LOCATION) ? 1 : 0),
      }))
      if (parsed.form.tags?.includes(PHOTO_TAG_NEEDS_LOCATION)) {
        setNeedsLocationPhotoIds((prev) => (prev.includes(photoId) ? prev : [...prev, photoId]))
        setSelectedPhotoIds((prev) => (prev.includes(photoId) ? prev : [...prev, photoId]))
      }
      useUIStore.getState().bumpSidebarCollections()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Retry failed')
    } finally {
      setRetryingId(null)
    }
  }

  const handleOverlayClick = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 769px)').matches) return
    closeBulkReview()
  }

  const failed = items.filter((i) => i.status === 'failed')
  const ok = jobSummary?.success_count ?? successItems.length
  const fail = jobSummary?.failed_count ?? failed.length
  const needsCount = needsLocationPhotoIds.length
  const allSet = !loading && successItems.length > 0 && needsCount === 0

  if (!bulkReviewJobId) return null

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid var(--border)',
    cursor: 'pointer',
  }

  const renderSuccessRow = (item: BulkItemRow) => {
    const photoId = item.photo_id!
    const checked = selectedSet.has(photoId)
    const needsLoc = needsLocSet.has(photoId)
    return (
      <div key={item.id} style={rowStyle} onClick={() => togglePhotoId(photoId)}>
        <input
          type="checkbox"
          checked={checked}
          onChange={() => togglePhotoId(photoId)}
          onClick={(e) => e.stopPropagation()}
          style={{ flexShrink: 0, accentColor: 'var(--accent)' }}
        />
        <ItemThumb path={item.thumbnail_path ?? item.storage_path} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.relative_path.split('/').pop() ?? item.relative_path}
          </div>
          {needsLoc && (
            <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600, marginTop: 2, display: 'block' }}>
              Needs location
            </span>
          )}
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ flexShrink: 0, fontSize: 11 }}
          onClick={(e) => { e.stopPropagation(); openEdit(photoId) }}
        >
          Edit
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="upload-modal-ov open" onClick={handleOverlayClick} aria-hidden />
      <div className="upload-modal open" style={{ maxWidth: 620, display: 'flex', flexDirection: 'column', maxHeight: '88vh' }}>
        {/* Header */}
        <div className="upload-modal-hdr">
          <div>
            <div style={{ fontFamily: 'var(--font-head)', fontSize: 16, fontWeight: 700 }}>Advanced upload review</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
              {loading
                ? 'Loading…'
                : allSet
                  ? 'All set ✓'
                  : `${ok} published · ${fail} failed${needsCount > 0 ? ` · ${needsCount} need location` : ''}`}
            </div>
          </div>
          <button type="button" className="modal-close" style={{ width: 30, height: 30, fontSize: 14 }} onClick={closeBulkReview}>
            ✕
          </button>
        </div>

        {/* All set screen */}
        {allSet && !allSetDismissed && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', gap: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 40 }}>✓</div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-head)', color: 'var(--text-1)' }}>All set!</div>
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>All uploaded photos have locations assigned.</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setAllSetDismissed(true)}>
                Back to editor
              </button>
              <button type="button" className="btn btn-primary" onClick={closeBulkReview}>
                OK
              </button>
            </div>
          </div>
        )}

        {/* Scrollable photo list */}
        {(!allSet || allSetDismissed) && <div className="upload-modal-body" style={{ paddingBottom: 8, overflowY: 'auto', flex: 1 }}>
          {error && (
            <p style={{ color: 'var(--cm-bad, #c44)', fontSize: 13, marginBottom: 12 }}>{error}</p>
          )}

          {/* Failed imports */}
          {!loading && failed.length > 0 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4, marginBottom: 8, color: 'var(--text-1)' }}>
                Failed imports
              </div>
              {failed.map((item) => {
                const canRetry = Boolean(item.storage_path && parseSnapshot(item.form_snapshot))
                return (
                  <div key={item.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <ItemThumb path={item.thumbnail_path ?? item.storage_path} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                        {item.relative_path}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                        {item.folder_name?.trim() ? item.folder_name : 'ZIP root (no collection)'}
                      </div>
                      {item.error_message && (
                        <div style={{ fontSize: 12, color: 'var(--cm-bad, #c44)', marginTop: 6 }}>{item.error_message}</div>
                      )}
                      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                        {canRetry && (
                          <button type="button" className="btn btn-primary btn-sm" disabled={retryingId === item.id} onClick={() => void handleRetry(item)}>
                            {retryingId === item.id ? 'Retrying…' : 'Retry publish'}
                          </button>
                        )}
                        {item.photo_id && (
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(item.photo_id!)}>
                            Edit photo
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </>
          )}

          {/* Successful photos */}
          {!loading && successItems.length > 0 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: failed.length > 0 ? 20 : 4, marginBottom: 10, color: 'var(--text-1)' }}>
                Published photos
              </div>

              {/* Controls row */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={checkAll}>
                  Check all
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={uncheckAll}>
                  Uncheck all
                </button>
                <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 'auto' }}>
                  {selectedPhotoIds.length}/{successItems.length} selected
                </span>
              </div>

              {byCollection.map(([folder, groupItems]) => {
                const groupPhotoIds = groupItems.map((i) => i.photo_id as string)
                const allGroupChecked = groupPhotoIds.every((id: string) => selectedSet.has(id))
                const toggleGroup = () => {
                  if (allGroupChecked) {
                    setSelectedPhotoIds((prev) => prev.filter((id: string) => !groupPhotoIds.includes(id)))
                  } else {
                    setSelectedPhotoIds((prev) => Array.from(new Set([...prev, ...groupPhotoIds])))
                  }
                }
                return (
                  <div key={folder || '__root__'} style={{ marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0 6px', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', flex: 1 }}>
                        {folder || 'No collection'}
                      </span>
                      <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={toggleGroup}>
                        {allGroupChecked ? 'Deselect group' : 'Select group'}
                      </button>
                    </div>
                    {groupItems.map(renderSuccessRow)}
                  </div>
                )
              })}
            </>
          )}

          {!loading && successItems.length === 0 && failed.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 12 }}>No items found.</p>
          )}
        </div>}

        {/* Sticky footer — location/category editor + close */}
        {(!allSet || allSetDismissed) && <div style={{ borderTop: '1px solid var(--border)', padding: '12px 20px 16px', background: 'var(--surface)', flexShrink: 0 }}>
          {!loading && (!allSet || allSetDismissed) && (
            <>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>
                {selectedPhotoIds.length > 0
                  ? `Update ${selectedPhotoIds.length} selected photo${selectedPhotoIds.length !== 1 ? 's' : ''}`
                  : 'Select photos above to update'}
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 10px', lineHeight: 1.45 }}>
                Set collection and/or location for selected photos. Category is set by AI at import; use Edit on a photo to change it. Group headers are ZIP folder names — tags and names stay per image.
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
                <div style={{ flex: '1 1 220px', minWidth: 180 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Collection (optional)</div>
                  <input
                    value={bulkCollectionName}
                    onChange={(e) => setBulkCollectionName(e.target.value)}
                    placeholder="Type collection name…"
                    className="ui"
                    style={{ fontSize: 13, padding: '6px 8px', borderRadius: 6, width: '100%', boxSizing: 'border-box' }}
                    aria-label="Bulk collection name"
                  />
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Neighborhood</div>
                  <LocationField
                    value={bulkNeighborhood}
                    onChange={setBulkNeighborhood}
                    labels={locationLabels}
                    placeholder="Type neighborhood…"
                  />
                </div>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Sub-area</div>
                  <input
                    value={bulkSubarea}
                    onChange={(e) => setBulkSubarea(e.target.value)}
                    placeholder="Landmark…"
                    className="ui"
                    style={{ fontSize: 13, padding: '6px 8px', borderRadius: 6, width: '100%', boxSizing: 'border-box' }}
                    aria-label="Bulk sub-area"
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={
                    bulkBusy ||
                    selectedPhotoIds.length === 0 ||
                    (bulkCollectionName.trim() === '' && bulkNeighborhood.trim() === '' && bulkSubarea.trim() === '')
                  }
                  onClick={() => void handleBulkApply()}
                >
                  {bulkBusy ? 'Applying…' : 'Apply'}
                </button>
              </div>
            </>
          )}
          <button type="button" className="btn btn-ghost" onClick={closeBulkReview}>
            Close
          </button>
        </div>}
      </div>
    </>
  )
}
