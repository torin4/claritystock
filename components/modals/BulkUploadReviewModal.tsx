'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUIStore } from '@/stores/ui.store'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { PHOTO_TAG_NEEDS_LOCATION } from '@/lib/constants/photoTags'
import { publishPhotoFromStagingSnapshot } from '@/lib/uploads/processImageForPublish'
import { useSignedPhotoUrl } from '@/lib/hooks/useSignedPhotoUrl'
import LocationField from '@/components/neighborhoods/LocationField'
import { getNeighborhoodCanonicalLabels } from '@/lib/actions/neighborhoods.actions'
import { updatePhotosCategoryNeighborhood } from '@/lib/actions/photos.actions'
import type { Category, PhotoFormValues } from '@/lib/types/database.types'

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

function FailedThumb({ path }: { path: string | null }) {
  const url = useSignedPhotoUrl(path, { enabled: !!path })
  if (!url) {
    return (
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 4,
          background: 'var(--surface-2)',
          flexShrink: 0,
        }}
      />
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      style={{ width: 48, height: 48, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }}
    />
  )
}

interface Props {
  userId: string
}

export default function BulkUploadReviewModal({ userId }: Props) {
  const router = useRouter()
  const bulkReviewJobId = useUIStore((s) => s.bulkReviewJobId)
  const closeBulkReview = useUIStore((s) => s.closeBulkReview)
  const openEdit = useUIStore((s) => s.openEdit)
  const [loading, setLoading] = useState(true)
  const [jobSummary, setJobSummary] = useState<JobSummary | null>(null)
  const [items, setItems] = useState<BulkItemRow[]>([])
  const [needsLocationPhotoIds, setNeedsLocationPhotoIds] = useState<string[]>([])
  const [missingLocationOrCategoryPhotoIds, setMissingLocationOrCategoryPhotoIds] = useState<string[]>([])
  const [selectedBulkIds, setSelectedBulkIds] = useState<string[]>([])
  const [locationLabels, setLocationLabels] = useState<string[]>([])
  const [bulkCategory, setBulkCategory] = useState<'' | Category>('')
  const [bulkNeighborhood, setBulkNeighborhood] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryingId, setRetryingId] = useState<string | null>(null)

  useEffect(() => {
    getNeighborhoodCanonicalLabels()
      .then(setLocationLabels)
      .catch(() => setLocationLabels([]))
  }, [])

  const load = useCallback(async () => {
    if (!bulkReviewJobId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/bulk-upload/jobs/${bulkReviewJobId}`, {
        credentials: 'same-origin',
      })
      const body = (await res.json()) as {
        error?: string
        job?: { summary: unknown; status: string }
        items?: BulkItemRow[]
        needsLocationPhotoIds?: string[]
        missingLocationOrCategoryPhotoIds?: string[]
      }
      if (!res.ok) {
        setError(body.error ?? res.statusText)
        setItems([])
        setNeedsLocationPhotoIds([])
        setMissingLocationOrCategoryPhotoIds([])
        setSelectedBulkIds([])
        setLoading(false)
        return
      }
      setJobSummary((body.job?.summary as JobSummary) ?? {})
      const nextItems = body.items ?? []
      setItems(nextItems)
      const needs = body.needsLocationPhotoIds ?? []
      setNeedsLocationPhotoIds(needs)
      setMissingLocationOrCategoryPhotoIds(body.missingLocationOrCategoryPhotoIds ?? [])
      const successIds = nextItems
        .filter((i) => i.status === 'success' && i.photo_id)
        .map((i) => i.photo_id as string)
      setSelectedBulkIds(needs.length > 0 ? needs : successIds)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load job')
      setItems([])
      setNeedsLocationPhotoIds([])
      setMissingLocationOrCategoryPhotoIds([])
      setSelectedBulkIds([])
    }
    setLoading(false)
  }, [bulkReviewJobId])

  useEffect(() => {
    void load()
  }, [load])

  const selectedSet = useMemo(() => new Set(selectedBulkIds), [selectedBulkIds])

  const toggleBulkId = (id: string) => {
    setSelectedBulkIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const handleBulkApply = async () => {
    const ids = selectedBulkIds.filter(Boolean)
    if (!ids.length) {
      setError('Select at least one photo.')
      return
    }
    const applyCat = bulkCategory !== ''
    const applyNeigh = bulkNeighborhood.trim().length > 0
    if (!applyCat && !applyNeigh) {
      setError('Choose a category and/or enter a neighborhood to apply.')
      return
    }
    setBulkBusy(true)
    setError(null)
    try {
      await updatePhotosCategoryNeighborhood(ids, {
        ...(applyCat ? { category: bulkCategory } : {}),
        ...(applyNeigh ? { neighborhood: bulkNeighborhood.trim() } : {}),
      })
      setBulkNeighborhood('')
      await load()
      router.refresh()
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
        .update({
          status: 'success',
          photo_id: photoId,
          error_message: null,
          form_snapshot: null,
        })
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
        setSelectedBulkIds((prev) => (prev.includes(photoId) ? prev : [...prev, photoId]))
      }
      router.refresh()
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

  const needsLocSet = useMemo(() => new Set(needsLocationPhotoIds), [needsLocationPhotoIds])

  const successItems = useMemo(
    () => items.filter((i) => i.status === 'success' && i.photo_id),
    [items],
  )

  const failed = items.filter((i) => i.status === 'failed')
  const ok = jobSummary?.success_count ?? items.filter((i) => i.status === 'success').length
  const fail = jobSummary?.failed_count ?? failed.length
  const needsCount = needsLocationPhotoIds.length
  const allSet = successItems.length > 0 && failed.length === 0 && missingLocationOrCategoryPhotoIds.length === 0

  if (!bulkReviewJobId) return null

  return (
    <>
      <div className="upload-modal-ov open" onClick={handleOverlayClick} aria-hidden />
      <div className="upload-modal open" style={{ maxWidth: 600 }}>
        <div className="upload-modal-hdr">
          <div>
            <div style={{ fontFamily: 'var(--font-head)', fontSize: 16, fontWeight: 700 }}>Bulk import review</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
              {loading
                ? 'Loading…'
                : `${ok} published · ${fail} failed${
                    needsCount > 0 ? ` · ${needsCount} need location` : ''
                  }`}
            </div>
          </div>
          <button
            type="button"
            className="modal-close"
            style={{ width: 30, height: 30, fontSize: 14 }}
            onClick={closeBulkReview}
          >
            ✕
          </button>
        </div>
        <div className="upload-modal-body" style={{ paddingBottom: 20, maxHeight: '70vh', overflowY: 'auto' }}>
          {error && (
            <p style={{ color: 'var(--cm-bad, #c44)', fontSize: 13, marginBottom: 12 }}>{error}</p>
          )}
          {!loading && failed.length > 0 && (
            <>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  marginTop: 20,
                  marginBottom: 8,
                  color: 'var(--text-1)',
                }}
              >
                Failed imports
              </div>
              {failed.map((item) => {
                const canRetry = Boolean(item.storage_path && parseSnapshot(item.form_snapshot))
                return (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      gap: 12,
                      alignItems: 'flex-start',
                      padding: '10px 0',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <FailedThumb path={item.thumbnail_path ?? item.storage_path} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{ fontSize: 12, fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}
                      >
                        {item.relative_path}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                        {item.folder_name?.trim() ? item.folder_name : 'ZIP root (no collection)'}
                      </div>
                      {item.error_message && (
                        <div style={{ fontSize: 12, color: 'var(--cm-bad, #c44)', marginTop: 6 }}>
                          {item.error_message}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                        {canRetry && (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={retryingId === item.id}
                            onClick={() => void handleRetry(item)}
                          >
                            {retryingId === item.id ? 'Retrying…' : 'Retry publish'}
                          </button>
                        )}
                        {item.photo_id && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => openEdit(item.photo_id!)}
                          >
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

          {!loading && failed.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 12 }}>No failed files.</p>
          )}
        </div>
        <div style={{ padding: '0 20px 16px' }}>
          <button type="button" className="btn btn-primary" onClick={closeBulkReview}>
            Close
          </button>
        </div>
      </div>
    </>
  )
}
