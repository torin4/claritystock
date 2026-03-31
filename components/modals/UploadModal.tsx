'use client'
import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { useUIStore } from '@/stores/ui.store'
import { useUploadStore } from '@/stores/upload.store'
import { extractGps } from '@/lib/utils/exif'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { devWarn } from '@/lib/utils/devLog'
import {
  MAX_SIMPLE_UPLOAD_PHOTOS,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MB,
  neighborhoodFromCoordinates,
  publishPhotoFileFromUploadState,
  runAiTaggingOnFile,
  uploadPhotoAssetsForPublish,
} from '@/lib/uploads/processImageForPublish'
import { contentHashInFilter, isContentHashColumnMissingError } from '@/lib/utils/contentHashQuery'
import { sha256HexFromFile } from '@/lib/utils/sha256File'
import type { Collection, Category } from '@/lib/types/database.types'
import { PlusIcon } from '@/components/icons/PlusIcon'
import LocationField from '@/components/neighborhoods/LocationField'
import { getNeighborhoodCanonicalLabels } from '@/lib/actions/neighborhoods.actions'
import { publishPhoto, updatePhotosCategoryNeighborhood } from '@/lib/actions/photos.actions'
import { runWithConcurrency } from '@/lib/utils/runWithConcurrency'
import { useSignedPhotoUrl } from '@/lib/hooks/useSignedPhotoUrl'
import { getOrCreateCollectionByName } from '@/lib/actions/collections.actions'
import { sortCollectionsByName } from '@/lib/utils/sortCollectionsByName'
import { PHOTO_TAG_NEEDS_LOCATION } from '@/lib/constants/photoTags'
import type { AiTagResult, PhotoFormValues } from '@/lib/types/database.types'

type UploadNotice = {
  tone: 'warning' | 'info'
  message: string
} | null

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

type BulkJobSummary = {
  success_count?: number
  failed_count?: number
  needs_location_count?: number
}

function BulkUpdateRowThumb({ path }: { path: string | null }) {
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
  onSuccess: () => void
  /** When set (e.g. My Photos → inside a collection), new uploads default to this collection. */
  defaultCollectionId?: string | null
}

export default function UploadModal({ userId, onSuccess, defaultCollectionId = null }: Props) {
  const { uploadModalOpen, closeUpload, bulkUpdateJobId } = useUIStore()
  const store = useUploadStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const zipInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [collections, setCollections] = useState<Collection[]>([])
  const [uploadNotice, setUploadNotice] = useState<UploadNotice>(null)
  /** Shown when “new collection” name matches an existing collection (same rules as publish). */
  const [existingCollNameNotice, setExistingCollNameNotice] = useState<string | null>(null)
  /** Set when DB has no `content_hash` column — library dup check skipped; same-batch still works */
  const [libraryDupNeedsMigration, setLibraryDupNeedsMigration] = useState(false)
  const [locationLabels, setLocationLabels] = useState<string[]>([])

  // Bulk update UI (moved from BulkUploadReviewModal)
  const [bulkUpdateLoading, setBulkUpdateLoading] = useState(true)
  const [bulkJobSummary, setBulkJobSummary] = useState<BulkJobSummary | null>(null)
  const [bulkItems, setBulkItems] = useState<BulkItemRow[]>([])
  const [bulkNeedsLocationPhotoIds, setBulkNeedsLocationPhotoIds] = useState<string[]>([])
  const [bulkMissingLocationOrCategoryPhotoIds, setBulkMissingLocationOrCategoryPhotoIds] = useState<string[]>([])
  const [bulkSelectedPhotoIds, setBulkSelectedPhotoIds] = useState<string[]>([])
  const [bulkBulkCategory, setBulkBulkCategory] = useState<'' | Category>('')
  const [bulkNeighborhood, setBulkNeighborhood] = useState('')
  const [bulkSubarea, setBulkSubarea] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkUpdateError, setBulkUpdateError] = useState<string | null>(null)

  // Bulk ZIP import (inside UploadModal)
  const setBulkUploadProgress = useUIStore((s) => s.setBulkUploadProgress)
  const bulkUploadProgress = useUIStore((s) => s.bulkUploadProgress)
  const bulkRunActiveRef = useRef(false)
  const bulkCancelledRef = useRef(false)
  const bulkJobIdRef = useRef<string | null>(null)
  const [uploadKind, setUploadKind] = useState<'standard' | 'bulk'>('standard')
  const [bulkPhase, setBulkPhase] = useState<'idle' | 'running' | 'error'>('idle')
  const [bulkMessage, setBulkMessage] = useState('')
  const cancelledRef = useRef(false)

  const bulkBarPct = useMemo(() => {
    const p = bulkUploadProgress
    if (!p?.total) return 0
    const half = p.inFlight && p.completed < p.total ? 0.5 : 0
    return Math.min(100, Math.round(((p.completed + half) / p.total) * 100))
  }, [bulkUploadProgress])

  useEffect(() => {
    if (!uploadModalOpen) return
    cancelledRef.current = false
    getNeighborhoodCanonicalLabels()
      .then(setLocationLabels)
      .catch(() => setLocationLabels([]))
  }, [uploadModalOpen])

  useEffect(() => {
    if (!uploadModalOpen) return
    const supabase = getSupabaseBrowserClient()
    supabase
      .from('collections')
      .select('*')
      .eq('created_by', userId)
      .then(({ data }) =>
        setCollections(sortCollectionsByName((data as Collection[]) ?? [])),
      )
  }, [uploadModalOpen, userId])

  const loadBulkUpdate = useCallback(async () => {
    if (!bulkUpdateJobId) return
    setBulkUpdateLoading(true)
    setBulkUpdateError(null)
    try {
      const res = await fetch(`/api/bulk-upload/jobs/${bulkUpdateJobId}`, {
        credentials: 'same-origin',
      })
      const body = (await res.json()) as {
        error?: string
        job?: { summary: BulkJobSummary; status: string }
        items?: BulkItemRow[]
        needsLocationPhotoIds?: string[]
        missingLocationOrCategoryPhotoIds?: string[]
      }
      if (!res.ok) {
        setBulkUpdateError(body.error ?? res.statusText)
        setBulkItems([])
        setBulkNeedsLocationPhotoIds([])
        setBulkMissingLocationOrCategoryPhotoIds([])
        setBulkSelectedPhotoIds([])
        setBulkJobSummary(null)
        return
      }
      setBulkJobSummary(body.job?.summary ?? null)
      const nextItems = body.items ?? []
      setBulkItems(nextItems)
      const needs = body.needsLocationPhotoIds ?? []
      const missing = body.missingLocationOrCategoryPhotoIds ?? []
      setBulkNeedsLocationPhotoIds(needs)
      setBulkMissingLocationOrCategoryPhotoIds(missing)

      // Start unchecked by default; user must choose explicit targets.
      setBulkSelectedPhotoIds([])
    } catch (e) {
      setBulkUpdateError(e instanceof Error ? e.message : 'Could not load bulk job')
      setBulkItems([])
      setBulkNeedsLocationPhotoIds([])
      setBulkMissingLocationOrCategoryPhotoIds([])
      setBulkSelectedPhotoIds([])
      setBulkJobSummary(null)
    } finally {
      setBulkUpdateLoading(false)
    }
  }, [bulkUpdateJobId])

  useEffect(() => {
    void loadBulkUpdate()
  }, [loadBulkUpdate])

  const handleBulkApply = useCallback(async () => {
    const ids = bulkSelectedPhotoIds.filter(Boolean)
    if (!ids.length) {
      setBulkUpdateError('Select at least one photo.')
      return
    }

    const applyCat = bulkBulkCategory !== ''
    const applyNeigh = bulkNeighborhood.trim().length > 0
    const applySub = bulkSubarea.trim().length > 0
    if (!applyCat && !applyNeigh && !applySub) {
      setBulkUpdateError('Choose a category, neighborhood, and/or sub-area to apply.')
      return
    }

    setBulkBusy(true)
    setBulkUpdateError(null)
    try {
      await updatePhotosCategoryNeighborhood(ids, {
        ...(applyCat ? { category: bulkBulkCategory } : {}),
        ...(applyNeigh ? { neighborhood: bulkNeighborhood.trim() } : {}),
        ...(applySub ? { subarea: bulkSubarea.trim() } : {}),
        ...(userId ? { photographerId: userId } : {}),
      })
      setBulkNeighborhood('')
      setBulkSubarea('')
      await loadBulkUpdate()
      // After applying, clear selection so nothing remains checked.
      setBulkSelectedPhotoIds([])
    } catch (e) {
      setBulkUpdateError(e instanceof Error ? e.message : 'Bulk update failed')
    } finally {
      setBulkBusy(false)
    }
  }, [bulkNeighborhood, bulkSubarea, bulkBulkCategory, bulkSelectedPhotoIds, loadBulkUpdate, userId])

  const targetCollectionName = useMemo(
    () =>
      defaultCollectionId
        ? collections.find(c => c.id === defaultCollectionId)?.name ?? null
        : null,
    [collections, defaultCollectionId],
  )

  const handleClose = () => {
    cancelledRef.current = true
    if (!bulkRunActiveRef.current) {
      bulkCancelledRef.current = true
      setBulkPhase('idle')
      setBulkMessage('')
    }
    store.reset()
    setUploadNotice(null)
    setExistingCollNameNotice(null)
    setLibraryDupNeedsMigration(false)
    setUploadKind('standard')
    closeUpload()
  }

  /** Backdrop closes modal on mobile only; desktop must use ✕ (avoids accidental loss of work). */
  const handleOverlayClick = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 769px)').matches) return
    handleClose()
  }

  /** SHA-256 match against library + used for per-batch duplicate hints */
  const runDuplicateFingerprint = useCallback(async (files: File[]) => {
    if (!files.length) return
    let hashes: string[]
    try {
      hashes = await Promise.all(files.map((f) => sha256HexFromFile(f)))
    } catch (e) {
      devWarn('[Add Photos] Could not hash files for duplicate check:', e)
      return
    }
    if (useUploadStore.getState().files.length !== files.length) return
    let rows: { id: string; title: string; content_hash: string | null }[] = []
    try {
      const unique = Array.from(new Set(hashes.filter(Boolean)))
      if (unique.length) {
        const supabase = getSupabaseBrowserClient()
        const inClause = contentHashInFilter(unique)
        const { data, error } = await supabase
          .from('photos')
          .select('id, title, content_hash')
          .filter('content_hash', 'in', inClause)
        if (error) {
          if (isContentHashColumnMissingError(error)) {
            setLibraryDupNeedsMigration(true)
            rows = []
          } else {
            devWarn('[Add Photos] Duplicate library lookup failed:', error.message, error)
            rows = []
          }
        } else {
          setLibraryDupNeedsMigration(false)
          rows = data ?? []
        }
      }
    } catch (e) {
      devWarn('[Add Photos] Duplicate library lookup failed:', e)
    }
    if (useUploadStore.getState().files.length !== files.length) return
    const byHash = new Map<string, { id: string; title: string }[]>()
    for (const row of rows) {
      if (!row.content_hash) continue
      const list = byHash.get(row.content_hash) ?? []
      list.push({ id: row.id, title: row.title })
      byHash.set(row.content_hash, list)
    }
    useUploadStore.getState().setAllFileFingerprints(
      hashes.map((h) => ({ contentHash: h, libraryDuplicates: byHash.get(h) ?? [] })),
    )
  }, [setLibraryDupNeedsMigration])

  const processFiles = useCallback(async (files: File[]) => {
    cancelledRef.current = false
    const images = files.filter(f => f.type.startsWith('image/'))
    const tooLarge = images.filter(f => f.size > MAX_UPLOAD_BYTES)
    const valid = images.filter(f => f.size <= MAX_UPLOAD_BYTES)
    const nonImages = files.length - images.length
    const capped =
      valid.length > MAX_SIMPLE_UPLOAD_PHOTOS
        ? valid.slice(0, MAX_SIMPLE_UPLOAD_PHOTOS)
        : valid
    const overflow = valid.length - capped.length

    const noticeParts: string[] = []
    if (tooLarge.length) {
      const rejectedNames = tooLarge.slice(0, 3).map(f => f.name).join(', ')
      noticeParts.push(
        `${tooLarge.length} photo${tooLarge.length === 1 ? '' : 's'} skipped for being over ${MAX_UPLOAD_MB}MB each${rejectedNames ? `: ${rejectedNames}` : ''}.`,
      )
    }
    if (nonImages) {
      noticeParts.push(`${nonImages} non-image file${nonImages === 1 ? '' : 's'} ignored.`)
    }
    if (overflow > 0) {
      noticeParts.push(
        `${overflow} photo${overflow === 1 ? '' : 's'} not added — simple upload allows at most ${MAX_SIMPLE_UPLOAD_PHOTOS} at a time.`,
      )
    }

    if (noticeParts.length) {
      setUploadNotice({
        tone: 'warning',
        message: noticeParts.join(' '),
      })
    } else {
      setUploadNotice({
        tone: 'info',
        message: `Upload limit: ${MAX_UPLOAD_MB}MB per photo, up to ${MAX_SIMPLE_UPLOAD_PHOTOS} photos at a time.`,
      })
    }

    if (!capped.length) return
    setLibraryDupNeedsMigration(false)
    setExistingCollNameNotice(null)
    store.setFiles(capped)
    if (defaultCollectionId) {
      for (let i = 0; i < capped.length; i++) {
        store.updateForm(i, { collection_id: defaultCollectionId, new_collection_name: null })
      }
    }
    store.setStep(2)
    void runDuplicateFingerprint(capped)

    /** Stable per-row id so EXIF/AI callbacks still target the right file after removals reorder indices. */
    const rowUploadIds = useUploadStore.getState().files.map((f) => f.uploadId)
    const applyByUploadId = (uploadId: string, fn: (slot: number) => void) => {
      const slot = useUploadStore.getState().files.findIndex((f) => f.uploadId === uploadId)
      if (slot !== -1) fn(slot)
    }

    // Parallelize EXIF/geocode + Gemini tagging (bounded to avoid CPU + API spikes).
    const indices = Array.from({ length: capped.length }, (_, i) => i)
    const REVIEW_CONCURRENCY = 2
    await runWithConcurrency(indices, REVIEW_CONCURRENCY, async (i) => {
      if (cancelledRef.current) return
      const file = capped[i]
      const uploadId = rowUploadIds[i]
      try {
        const gps = await extractGps(file)
        if (!cancelledRef.current && gps) applyByUploadId(uploadId, (slot) => store.setExif(slot, gps))

        if (!cancelledRef.current && gps?.lat != null && gps?.lng != null) {
          const neighborhood = await neighborhoodFromCoordinates(gps.lat, gps.lng)
          if (neighborhood) applyByUploadId(uploadId, (slot) => store.updateForm(slot, { neighborhood }))
        }
      } catch {
        /* ignore per-file EXIF/geocode errors */
      }

      if (cancelledRef.current) return
      applyByUploadId(uploadId, (slot) => store.setAiScanning(slot, true))
      try {
        const ai = await runAiTaggingOnFile(file, {
          debug: process.env.NEXT_PUBLIC_AI_TAG_DEBUG_UPLOAD === '1',
          debugLabel: 'simple-upload',
        })
        if (!cancelledRef.current && ai) applyByUploadId(uploadId, (slot) => store.setAi(slot, ai))
      } finally {
        if (!cancelledRef.current) applyByUploadId(uploadId, (slot) => store.setAiScanning(slot, false))
      }
    })
  }, [store, defaultCollectionId, runDuplicateFingerprint])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    processFiles(Array.from(e.dataTransfer.files))
  }, [processFiles])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(Array.from(e.target.files))
    e.target.value = ''
  }

  const current = store.files[store.currentIndex]
  const currentForm = current?.form
  const anyAiScanning = store.files.some(f => f.aiScanning)

  useEffect(() => {
    setExistingCollNameNotice(null)
  }, [store.currentIndex])

  useEffect(() => {
    if (store.step !== 2) return
    const row = store.files[store.currentIndex]
    if (!row?.form) return
    const raw = row.form.new_collection_name
    if (raw === null) return
    const name = raw.trim()
    if (!name) return
    const hit = collections.find((c) => c.name.trim().toLowerCase() === name.toLowerCase())
    if (!hit) return
    store.updateForm(store.currentIndex, { collection_id: hit.id, new_collection_name: null })
    setExistingCollNameNotice(
      `A collection named "${hit.name}" already exists — this photo will be added there.`,
    )
  }, [store.step, store.currentIndex, store.files, collections, store])

  const dupHints = useMemo(() => {
    return store.files.map((f, i) => {
      const h = f.contentHash
      const inBatch = !!h && store.files.some((g, j) => j !== i && g.contentHash === h)
      const inLibrary = (f.libraryDuplicates?.length ?? 0) > 0
      return { inBatch, inLibrary }
    })
  }, [store.files])

  const dupWarningCount = useMemo(
    () => dupHints.filter((d) => d.inLibrary || d.inBatch).length,
    [dupHints],
  )

  const currentDup = current ? dupHints[store.currentIndex] : null

  const handlePublish = async () => {
    const oversize = store.files.filter(f => f.file.size > MAX_UPLOAD_BYTES)
    if (oversize.length) {
      setUploadNotice({
        tone: 'warning',
        message: `${oversize.length} photo${oversize.length === 1 ? '' : 's'} still exceed the ${MAX_UPLOAD_MB}MB limit and were not uploaded.`,
      })
      return
    }
    setPublishing(true)
    try {
      const fileStates = store.files
      const indices = Array.from({ length: fileStates.length }, (_, i) => i)
      const PUBLISH_CONCURRENCY = 2
      await runWithConcurrency(indices, PUBLISH_CONCURRENCY, async (i) => {
        if (cancelledRef.current) return
        const f = fileStates[i]
        if (f?.published) return
        try {
          await publishPhotoFileFromUploadState({
            file: f.file,
            userId,
            form: f.form,
            ai: f.ai,
            contentHash: f.contentHash,
          })
          store.markPublished(i)
        } catch (err) {
          store.setError(i, String(err))
        }
      })
      if (!cancelledRef.current) {
        store.setStep(3)
        onSuccess()
      }
    } finally {
      setPublishing(false)
    }
  }

  const runBulkZip = useCallback(
    async (zipFile: File) => {
      bulkRunActiveRef.current = true
      bulkCancelledRef.current = false
      try {
        setBulkPhase('running')
        setBulkMessage('Reading ZIP…')

        const supabase = getSupabaseBrowserClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user?.id) {
          setBulkUploadProgress(null)
          setBulkPhase('error')
          setBulkMessage('You must be signed in to run a bulk ZIP import.')
          return
        }
        const authedUserId = user.id
        const targetPhotographerId = userId || authedUserId

        // Admin panel: allow acting on behalf of another photographer.
        if (targetPhotographerId !== authedUserId) {
          const { data: isAdmin, error: adminErr } = await supabase.rpc('is_admin')
          if (adminErr || !isAdmin) {
            setBulkUploadProgress(null)
            setBulkPhase('error')
            setBulkMessage('Only admins can import photos on behalf of another photographer.')
            return
          }
        }

        // Dynamically import ZIP parsing + bulk constants so JSZip doesn't bloat standard uploads.
        const bulk = await import('@/lib/uploads/bulkZipImport')
        const {
          BULK_CONCURRENCY,
          MAX_BULK_IMAGES,
          buildFormForBulkFile,
          parseBulkZipToEntries,
        } = bulk

        let entries: Awaited<ReturnType<typeof parseBulkZipToEntries>>
        try {
          entries = await parseBulkZipToEntries(zipFile)
        } catch (e) {
          setBulkUploadProgress(null)
          setBulkPhase('error')
          setBulkMessage(e instanceof Error ? e.message : 'Could not read ZIP')
          return
        }

        if (!entries.length) {
          setBulkUploadProgress(null)
          setBulkPhase('error')
          setBulkMessage('No images found in ZIP (JPEG/PNG/WebP/HEIC; max size limits apply).')
          return
        }

        const { data: jobRow, error: jobErr } = await supabase
          .from('bulk_upload_jobs')
          .insert({
            photographer_id: targetPhotographerId,
            status: 'running',
          })
          .select('id')
          .single()

        if (jobErr || !jobRow?.id) {
          setBulkUploadProgress(null)
          setBulkPhase('error')
          setBulkMessage(jobErr?.message ?? 'Could not start import job')
          return
        }

        const jobId = jobRow.id as string
        bulkJobIdRef.current = jobId

        const itemRows = entries.map((e) => ({
          job_id: jobId,
          relative_path: e.relativePath,
          folder_name: e.folderName,
          status: 'pending' as const,
        }))

        const { data: insertedItems, error: itemsErr } = await supabase
          .from('bulk_upload_items')
          .insert(itemRows)
          .select('id, relative_path')

        if (itemsErr || !insertedItems?.length) {
          await supabase
            .from('bulk_upload_jobs')
            .update({ status: 'failed', completed_at: new Date().toISOString() })
            .eq('id', jobId)
          setBulkUploadProgress(null)
          setBulkPhase('error')
          setBulkMessage(itemsErr?.message ?? 'Could not create import items')
          return
        }

        const pathToItemId = new Map(insertedItems.map((r) => [r.relative_path, r.id as string]))

        if (insertedItems.length !== entries.length) {
          await supabase
            .from('bulk_upload_jobs')
            .update({ status: 'failed', completed_at: new Date().toISOString() })
            .eq('id', jobId)
          setBulkUploadProgress(null)
          setBulkPhase('error')
          setBulkMessage(`Could not create all import rows (${insertedItems.length}/${entries.length}). Check for duplicate paths in the ZIP.`)
          return
        }

        const folderToCollection = new Map<string, string>()
        const uniqueFolders = Array.from(new Set(entries.map((e) => e.folderName))).filter((name) => name.length > 0)
        for (const folder of uniqueFolders) {
          try {
            const { id } = await getOrCreateCollectionByName({ name: folder, category: 'neighborhood', ownerId: targetPhotographerId })
            folderToCollection.set(folder, id)
          } catch (e) {
            await supabase
              .from('bulk_upload_jobs')
              .update({ status: 'failed', completed_at: new Date().toISOString() })
              .eq('id', jobId)
            setBulkUploadProgress(null)
            setBulkPhase('error')
            setBulkMessage(e instanceof Error ? e.message : 'Collection error')
            return
          }
        }

        let ok = 0
        let fail = 0
        let needsLocationOk = 0
        let processed = 0
        const total = entries.length

        setBulkUploadProgress({
          total,
          completed: 0,
          label: `Starting… 0/${total}`,
          inFlight: false,
        })

        await runWithConcurrency(entries, BULK_CONCURRENCY, async (entry) => {
          if (bulkCancelledRef.current) return
          const itemId = pathToItemId.get(entry.relativePath)
          const shortName = entry.relativePath.split('/').pop() ?? entry.relativePath

          try {
            if (!itemId) {
              fail += 1
              return
            }

            setBulkMessage(`Processing ${entry.relativePath}…`)
            setBulkUploadProgress({
              total,
              completed: processed,
              label: `${processed + 1}/${total} · ${shortName}`,
              inFlight: true,
            })

            try {
              await supabase.from('bulk_upload_items').update({ status: 'processing' }).eq('id', itemId)

              /** Root-level files (`folderName === ''`) are not in any collection — `null` is valid for `photos.collection_id`. */
              const collectionId: string | null =
                entry.folderName.length === 0 ? null : (folderToCollection.get(entry.folderName) ?? null)
              if (entry.folderName.length > 0 && !collectionId) {
                await supabase
                  .from('bulk_upload_items')
                  .update({ status: 'failed', error_message: 'Missing collection' })
                  .eq('id', itemId)
                fail += 1
                return
              }

              let ai: AiTagResult | null = null
              try {
                ai = await runAiTaggingOnFile(entry.file)
              } catch {
                ai = null
              }

              let form: PhotoFormValues
              try {
                form = await buildFormForBulkFile(entry.file, collectionId, ai)
              } catch (e) {
                await supabase
                  .from('bulk_upload_items')
                  .update({
                    status: 'failed',
                    error_message: e instanceof Error ? e.message : 'Form build failed',
                    collection_id: collectionId,
                  })
                  .eq('id', itemId)
                fail += 1
                return
              }

              let contentHash: string | null = null
              try {
                contentHash = await sha256HexFromFile(entry.file)
              } catch {
                contentHash = null
              }

              let assets: Awaited<ReturnType<typeof uploadPhotoAssetsForPublish>>
              try {
                assets = await uploadPhotoAssetsForPublish({
                  file: entry.file,
                  userId: targetPhotographerId,
                  contentHash,
                })
              } catch (e) {
                const errMsg = e instanceof Error ? e.message : 'Upload failed'
                await supabase
                  .from('bulk_upload_items')
                  .update({
                    status: 'failed',
                    error_message: errMsg,
                    collection_id: collectionId,
                  })
                  .eq('id', itemId)
                fail += 1
                return
              }

              await supabase
                .from('bulk_upload_items')
                .update({
                  storage_path: assets.storagePath,
                  thumbnail_path: assets.thumbnailPath,
                  display_path: assets.displayPath,
                  content_hash: assets.contentHash,
                  collection_id: collectionId,
                })
                .eq('id', itemId)

              const snap = {
                form,
                description: ai?.description ?? null,
              }

              try {
                const { id } = await publishPhoto(
                  { ...form, description: ai?.description },
                  assets.storagePath,
                  targetPhotographerId,
                  {
                    thumbnailPath: assets.thumbnailPath,
                    displayPath: assets.displayPath,
                    contentHash: assets.contentHash,
                  },
                )

                await supabase
                  .from('bulk_upload_items')
                  .update({
                    status: 'success',
                    photo_id: id,
                    collection_id: collectionId,
                    form_snapshot: null,
                  })
                  .eq('id', itemId)
                ok += 1
                if (form.tags?.includes(PHOTO_TAG_NEEDS_LOCATION)) {
                  needsLocationOk += 1
                }
              } catch (e) {
                const errMsg = e instanceof Error ? e.message : String(e)
                await supabase
                  .from('bulk_upload_items')
                  .update({
                    status: 'failed',
                    error_message: errMsg,
                    collection_id: collectionId,
                    form_snapshot: snap as unknown as Record<string, unknown>,
                  })
                  .eq('id', itemId)
                fail += 1
              }
            } catch (e) {
              const errMsg = e instanceof Error ? e.message : String(e)
              await supabase
                .from('bulk_upload_items')
                .update({
                  status: 'failed',
                  error_message: errMsg || 'Unexpected error',
                })
                .eq('id', itemId)
              fail += 1
            }
          } finally {
            processed += 1
            const label = processed >= total ? 'Finishing…' : `${processed}/${total} · ${shortName}`
            setBulkUploadProgress({
              total,
              completed: processed,
              label,
              inFlight: false,
            })
          }
        })

        // Mark any items that were skipped due to cancellation as failed
        if (bulkCancelledRef.current) {
          await supabase
            .from('bulk_upload_items')
            .update({ status: 'failed', error_message: 'Cancelled by user' })
            .eq('job_id', jobId)
            .eq('status', 'pending')
        }

        const completedAt = new Date().toISOString()
        const summary = {
          success_count: ok,
          failed_count: fail,
          needs_location_count: needsLocationOk,
        }
        await supabase
          .from('bulk_upload_jobs')
          .update({
            status: 'completed',
            completed_at: completedAt,
            summary,
          })
          .eq('id', jobId)

        bulkJobIdRef.current = null
        setBulkUploadProgress(null)
        setBulkPhase('idle')
        setBulkMessage('')

        if (ok > 0 || fail > 0) useUIStore.getState().openBulkReview(jobId)

        onSuccess()
        useUIStore.getState().bumpSidebarCollections()
      } finally {
        bulkRunActiveRef.current = false
      }
    },
    [onSuccess, setBulkUploadProgress, userId],
  )

  const onPickZip = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f && f.name.toLowerCase().endsWith('.zip')) void runBulkZip(f)
  }

  const bulkSuccessItems = useMemo(
    () => bulkItems.filter((i) => i.status === 'success' && i.photo_id),
    [bulkItems],
  )
  const bulkFailedItems = useMemo(() => bulkItems.filter((i) => i.status === 'failed'), [bulkItems])
  const bulkAllSet =
    bulkSuccessItems.length > 0 &&
    bulkFailedItems.length === 0 &&
    bulkMissingLocationOrCategoryPhotoIds.length === 0
  const bulkSelectedSet = useMemo(() => new Set(bulkSelectedPhotoIds), [bulkSelectedPhotoIds])
  const bulkNeedsLocationSet = useMemo(() => new Set(bulkNeedsLocationPhotoIds), [bulkNeedsLocationPhotoIds])
  const bulkMissingSet = useMemo(
    () => new Set(bulkMissingLocationOrCategoryPhotoIds),
    [bulkMissingLocationOrCategoryPhotoIds],
  )
  const [bulkCollapsedGroups, setBulkCollapsedGroups] = useState<Record<string, boolean>>({})
  const bulkGroupedSuccessItems = useMemo(() => {
    const map = new Map<string, BulkItemRow[]>()
    for (const item of bulkSuccessItems) {
      const key = item.folder_name?.trim() ? item.folder_name.trim() : '__root__'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(item)
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === '__root__' && b !== '__root__') return 1
      if (a !== '__root__' && b === '__root__') return -1
      return a.localeCompare(b)
    })
  }, [bulkSuccessItems])

  useEffect(() => {
    if (!bulkUpdateJobId) return
    const next: Record<string, boolean> = {}
    for (const [groupKey] of bulkGroupedSuccessItems) next[groupKey] = true
    setBulkCollapsedGroups(next)
  }, [bulkUpdateJobId, bulkGroupedSuccessItems])

  const reviewedCount = store.files.filter(f => f.ai !== null).length
  const publishedCount = store.files.filter(f => f.published).length

  if (bulkUpdateJobId) {
    const needsCount = bulkNeedsLocationPhotoIds.length
    const failedCount = bulkFailedItems.length

    const successIds = bulkSuccessItems.map((i) => i.photo_id as string)
    const needsSelect = bulkNeedsLocationPhotoIds

    const toggleBulkId = (pid: string) => {
      setBulkSelectedPhotoIds((prev) => (prev.includes(pid) ? prev.filter((x) => x !== pid) : [...prev, pid]))
    }

    return (
      <>
        <div
          className={`upload-modal-ov ${uploadModalOpen ? 'open' : ''}`}
          onClick={handleOverlayClick}
          aria-hidden
        />
        <div className={`upload-modal ${uploadModalOpen ? 'open' : ''}`} style={{ maxWidth: 600 }}>
          <div className="upload-modal-hdr">
            <div>
              <div style={{ fontFamily: 'var(--font-head)', fontSize: 16, fontWeight: 700 }}>Bulk update</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                {bulkUpdateLoading
                  ? 'Loading…'
                  : bulkAllSet
                    ? 'You’re all set'
                    : `${bulkSuccessItems.length} published · ${failedCount} failed${needsCount > 0 ? ` · ${needsCount} need location` : ''}`}
              </div>
            </div>
            <button className="modal-close" style={{ width: 30, height: 30, fontSize: 14 }} onClick={handleClose}>
              ✕
            </button>
          </div>

          <div className="upload-modal-body" style={{ paddingBottom: 20, maxHeight: '70vh', overflowY: 'auto' }}>
            {bulkUpdateError && (
              <p style={{ color: 'var(--cm-bad, #c44)', fontSize: 13, marginBottom: 12 }}>{bulkUpdateError}</p>
            )}

            {!bulkUpdateLoading && bulkAllSet && (
              <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 12 }}>You&apos;re all set.</p>
            )}

            {!bulkUpdateLoading && !bulkAllSet && (
              <>
                <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-1)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Choose photos to update</div>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>
                    Select images, then set category and/or neighborhood. Location updates clear the “needs location” tag.
                  </p>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setBulkSelectedPhotoIds(needsSelect)}
                      disabled={!needsSelect.length}
                    >
                      Select needs location ({needsSelect.length})
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setBulkSelectedPhotoIds(successIds)}
                      disabled={!successIds.length}
                    >
                      Select all published ({successIds.length})
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBulkSelectedPhotoIds([])}>
                      Clear selection
                    </button>
                  </div>

                  <div style={{ display: 'grid', gap: 12, marginBottom: 12 }}>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Category (optional)</span>
                      <select
                        className="ui"
                        value={bulkBulkCategory}
                        onChange={(e) => setBulkBulkCategory((e.target.value as Category | '') || '')}
                        aria-label="Bulk category"
                      >
                        <option value="">— Leave unchanged —</option>
                        <option value="neighborhood">Neighborhood</option>
                        <option value="city">City</option>
                        <option value="condo">Condo</option>
                      </select>
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Neighborhood (optional)</span>
                      <LocationField
                        value={bulkNeighborhood}
                        onChange={setBulkNeighborhood}
                        labels={locationLabels}
                        placeholder="Type to match neighborhood list"
                        aria-label="Bulk neighborhood"
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Sub-area or landmark (optional)</span>
                      <input
                        className="ui"
                        value={bulkSubarea}
                        onChange={(e) => setBulkSubarea(e.target.value)}
                        placeholder="Sub-area or landmark"
                        aria-label="Bulk sub-area"
                      />
                    </label>
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={bulkBusy || bulkSelectedPhotoIds.length === 0}
                    onClick={() => void handleBulkApply()}
                  >
                    {bulkBusy
                      ? 'Applying…'
                      : `Apply to ${bulkSelectedPhotoIds.length} selected photo${bulkSelectedPhotoIds.length === 1 ? '' : 's'}`}
                  </button>
                </div>

                {bulkGroupedSuccessItems.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        setBulkCollapsedGroups(() =>
                          Object.fromEntries(bulkGroupedSuccessItems.map(([k]) => [k, false])),
                        )}
                    >
                      Expand all groups
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        setBulkCollapsedGroups(() =>
                          Object.fromEntries(bulkGroupedSuccessItems.map(([k]) => [k, true])),
                        )}
                    >
                      Collapse all groups
                    </button>
                  </div>
                )}
                {bulkGroupedSuccessItems.map(([groupKey, groupItems]) => {
                  const collapsed = bulkCollapsedGroups[groupKey] ?? true
                  const groupLabel = groupKey === '__root__' ? 'ZIP root (no collection)' : groupKey
                  return (
                    <div key={groupKey}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 6 }}
                        onClick={() =>
                          setBulkCollapsedGroups((prev) => ({ ...prev, [groupKey]: !collapsed }))
                        }
                      >
                        {collapsed ? '▸' : '▾'} {groupLabel} ({groupItems.length})
                      </button>
                      {!collapsed &&
                        groupItems.map((item) => {
                          const pid = item.photo_id as string
                          const needs = bulkNeedsLocationSet.has(pid)
                          const checked = bulkSelectedSet.has(pid)
                          const thumbPath = item.thumbnail_path ?? item.storage_path
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
                              <label style={{ display: 'flex', alignItems: 'flex-start', paddingTop: 4, cursor: 'pointer' }}>
                                <input type="checkbox" checked={checked} onChange={() => toggleBulkId(pid)} aria-label={`Select ${item.relative_path}`} />
                              </label>
                              <BulkUpdateRowThumb path={thumbPath} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                                  {item.relative_path}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                                  {item.folder_name?.trim() ? item.folder_name : 'ZIP root (no collection)'}
                                </div>
                                {(needs || bulkMissingSet.has(pid)) && (
                                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
                                    {needs ? 'Needs location' : 'Missing category'}
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  )
                })}
              </>
            )}
          </div>

          <div style={{ padding: '0 20px 16px' }}>
            <button type="button" className="btn btn-primary" onClick={handleClose}>
              Close
            </button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className={`upload-modal-ov ${uploadModalOpen ? 'open' : ''}`} onClick={handleOverlayClick} />
      <div className={`upload-modal ${uploadModalOpen ? 'open' : ''}`}>
        <div className="upload-modal-hdr">
          <div>
            <div style={{ fontFamily: 'var(--font-head)', fontSize: 16, fontWeight: 700 }}>
              Add Photos
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`btn btn-sm ${uploadKind === 'standard' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setUploadKind('standard')}
                disabled={publishing || bulkPhase === 'running'}
              >
                Standard
              </button>
              <button
                type="button"
                className={`btn btn-sm ${uploadKind === 'bulk' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setUploadKind('bulk')}
                disabled={publishing || bulkPhase === 'running'}
              >
                Advanced (ZIP)
              </button>
            </div>
            <div className="steps" style={{ marginTop: 8, marginBottom: 0 }}>
              <div className={`step-n ${store.step >= 1 ? 'active' : ''} ${store.step > 1 ? 'done' : ''}`}>1</div>
              <div className="step-line" />
              <div className={`step-n ${store.step >= 2 ? 'active' : ''} ${store.step > 2 ? 'done' : ''}`}>2</div>
              <div className="step-line" />
              <div className={`step-n ${store.step >= 3 ? 'active' : ''}`}>3</div>
            </div>
          </div>
          <button
            className="modal-close"
            style={{ width: 30, height: 30, fontSize: 14 }}
            onClick={handleClose}
          >✕</button>
        </div>

        <div className="upload-modal-body">
          {uploadKind === 'bulk' && (
            <div style={{ paddingBottom: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>
                Each second-level folder becomes a collection (e.g. <code>City/Neighborhood/photo.jpg</code> → collection &ldquo;Neighborhood&rdquo;). Images without a second-level folder import without a collection.
              </div>
              <input
                ref={zipInputRef}
                type="file"
                accept=".zip,application/zip"
                hidden
                onChange={onPickZip}
              />

              {bulkPhase === 'idle' && (
                <button type="button" className="btn btn-primary" onClick={() => zipInputRef.current?.click()}>
                  Choose ZIP file
                </button>
              )}

              {bulkPhase === 'running' && (
                <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                  <p style={{ marginBottom: 8 }}>
                    Working in the background — you can close this dialog and a progress bar will stay at the bottom of the screen.
                  </p>
                  {bulkUploadProgress && bulkUploadProgress.total > 0 && (
                    <div className="bulk-upload-modal-bar" aria-hidden>
                      <div style={{ width: `${bulkBarPct}%` }} />
                    </div>
                  )}
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    {bulkUploadProgress?.label ?? bulkMessage ?? 'Processing…'}
                  </p>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={handleClose}
                    >
                      Close (continues in background)
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--cm-bad, #c44)' }}
                      onClick={() => { bulkCancelledRef.current = true }}
                    >
                      Cancel import
                    </button>
                  </div>
                </div>
              )}

              {bulkPhase === 'error' && (
                <div>
                  <p style={{ color: 'var(--cm-bad, #c44)', fontSize: 13, marginBottom: 8 }}>{bulkMessage}</p>
                  <button type="button" className="btn btn-primary" onClick={() => { setBulkPhase('idle'); setBulkMessage('') }}>
                    Try again
                  </button>
                </div>
              )}

              <div style={{ marginTop: 14 }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setUploadKind('standard')} disabled={bulkPhase === 'running'}>
                  Back to standard upload
                </button>
              </div>
            </div>
          )}

          {uploadKind !== 'bulk' && (
            <>
              {defaultCollectionId && store.step !== 3 && (
                <div
                  className="upload-target-banner"
                  role="status"
                  style={{
                    marginBottom: store.step === 1 ? 12 : 14,
                    marginTop: 0,
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid rgba(61, 122, 106, 0.35)',
                    background: 'var(--accent-dim)',
                    color: 'var(--text-2)',
                    fontSize: 12,
                    lineHeight: 1.45,
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      color: 'var(--accent)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    Target collection
                  </span>
                  <div style={{ fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>
                    {targetCollectionName ?? 'Selected collection'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                    You can change this per photo in the next step.
                  </div>
                </div>
              )}

          {/* Step 1 — Drop zone */}
          {store.step === 1 && (
            <div
              className={`dropzone ${dragOver ? 'drag-over' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFileInput}
              />
              <div className="dz-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'inherit' }}>
                <PlusIcon size={26} />
              </div>
              <div className="dz-title">Drop photos into Library</div>
              <div className="dz-sub">
                JPEG or PNG · up to {MAX_UPLOAD_MB}MB each · max {MAX_SIMPLE_UPLOAD_PHOTOS} photos per upload
              </div>
              <div
                style={{
                  marginTop: 8,
                  fontSize: 11,
                  color: 'var(--text-3)',
                  fontFamily: 'var(--font-mono)',
                  textAlign: 'center',
                }}
              >
                Files over {MAX_UPLOAD_MB}MB are skipped; extra photos beyond {MAX_SIMPLE_UPLOAD_PHOTOS} are not included.
              </div>
              <button
                className="btn btn-primary"
                onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}
              >
                Browse files
              </button>
            </div>
          )}

          {uploadNotice && (
            <div
              role="status"
              aria-live="polite"
              style={{
                marginTop: store.step === 1 ? 14 : 0,
                marginBottom: store.step === 1 ? 0 : 12,
                padding: '10px 12px',
                borderRadius: 8,
                border: `1px solid ${uploadNotice.tone === 'warning' ? 'rgba(176, 120, 64, 0.45)' : 'var(--border)'}`,
                background: uploadNotice.tone === 'warning' ? 'rgba(54, 42, 20, 0.65)' : 'var(--surface-2)',
                color: uploadNotice.tone === 'warning' ? 'var(--cm-t)' : 'var(--text-2)',
                fontSize: 12,
                lineHeight: 1.45,
              }}
            >
              {uploadNotice.message}
            </div>
          )}

          {/* Step 2 — Review each photo */}
          {store.step === 2 && currentForm && (
            <>
              {libraryDupNeedsMigration && (
                <div className="upload-dup-hint upload-dup-hint--migration" role="status">
                  <strong>Library duplicate check is unavailable.</strong> Your Supabase project does not have a{' '}
                  <code className="upload-dup-code">content_hash</code> column on{' '}
                  <code className="upload-dup-code">photos</code> yet. Apply migration{' '}
                  <code className="upload-dup-code">20260325210000_photos_content_hash.sql</code> (SQL Editor or{' '}
                  <code className="upload-dup-code">supabase db push</code>). Until then, the same file uploaded again
                  later will not match the library. If you add the same file twice in this upload, you will still see a
                  warning.
                </div>
              )}
              {/* Filmstrip */}
              <div className="filmstrip">
                {store.files.map((f, i) => {
                  const hint = dupHints[i]
                  const dup = !!(hint?.inLibrary || hint?.inBatch)
                  const titleHint = dup
                    ? [
                        hint?.inLibrary ? 'Matches a photo already in your library (same file)' : null,
                        hint?.inBatch ? 'Repeated in this upload' : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : `Photo ${i + 1} of ${store.files.length}`
                  return (
                    <UploadFilmstripThumb
                      key={f.uploadId}
                      file={f.file}
                      active={store.currentIndex === i}
                      reviewed={!!f.ai}
                      isDup={dup}
                      dupInLibrary={!!hint?.inLibrary}
                      title={titleHint}
                      onSelect={() => store.setCurrentIndex(i)}
                      onRemove={() => store.removeFileAt(i)}
                      disableRemove={publishing}
                    />
                  )
                })}
              </div>

              {/* Card for current file */}
              <div className="upload-card">
                <UploadPreview file={current.file} />
                <div className="uc-body">
                  {current.libraryDuplicates === null && (
                    <div className="upload-dup-hint upload-dup-hint--pending" role="status">
                      Checking for identical files in the library…
                    </div>
                  )}
                  {currentDup?.inBatch && (
                    <div className="upload-dup-hint upload-dup-hint--warn" role="alert">
                      Same file appears more than once in this upload — you can remove extras before publishing.
                    </div>
                  )}
                  {currentDup?.inLibrary && current.libraryDuplicates && current.libraryDuplicates.length > 0 && (
                    <div className="upload-dup-hint upload-dup-hint--warn" role="alert">
                      <div className="upload-dup-hint-title">Already in the library (identical file)</div>
                      <ul className="upload-dup-list">
                        {current.libraryDuplicates.map((m) => (
                          <li key={m.id}>{m.title}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={publishing}
                      onClick={() => store.removeFileAt(store.currentIndex)}
                    >
                      Remove from upload
                    </button>
                  </div>
                  {/* Title */}
                  <div className="uf">
                    <div className="ul-row">
                      <div className="ul">Photo name</div>
                      {current.ai && <span className="ai-badge">✦ AI suggested</span>}
                    </div>
                    <input
                      className="ui"
                      type="text"
                      value={currentForm.title}
                      onChange={e => store.updateForm(store.currentIndex, { title: e.target.value })}
                      placeholder="Enter a title…"
                    />
                  </div>

                  {/* Category */}
                  <div className="uf">
                    <div className="ul-row">
                      <div className="ul">Category</div>
                      {current.ai && <span className="ai-badge">✦ AI</span>}
                    </div>
                    <select
                      className="ui"
                      value={currentForm.category ?? ''}
                      onChange={e => store.updateForm(store.currentIndex, { category: (e.target.value as Category) || null })}
                    >
                      <option value="">Select category…</option>
                      <option value="neighborhood">Neighborhood</option>
                      <option value="city">City</option>
                      <option value="condo">Condo</option>
                    </select>
                  </div>

                  {/* Collection */}
                  <div className="uf">
                    <div className="ul-row">
                      <div className="ul">Collection <span style={{ color: 'var(--text-3)', fontFamily: 'var(--font-body)', textTransform: 'none', letterSpacing: 0, fontSize: 10 }}>optional</span></div>
                    </div>
                    <select
                      className="ui"
                      value={currentForm.new_collection_name ? '__new__' : (currentForm.collection_id ?? '')}
                      onChange={e => {
                        setExistingCollNameNotice(null)
                        if (e.target.value === '__new__') {
                          store.updateForm(store.currentIndex, { new_collection_name: '', collection_id: null })
                        } else {
                          store.updateForm(store.currentIndex, { collection_id: e.target.value || null, new_collection_name: null })
                        }
                      }}
                    >
                      <option value="">No collection</option>
                      <option value="__new__">+ Create new collection…</option>
                      {collections.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    {currentForm.new_collection_name !== null && (
                      <>
                        <input
                          className="ui"
                          style={{ marginTop: 5 }}
                          placeholder="New collection name…"
                          value={currentForm.new_collection_name ?? ''}
                          onChange={e => store.updateForm(store.currentIndex, { new_collection_name: e.target.value })}
                        />
                        {store.files.length > 1 && currentForm.new_collection_name.trim().length > 0 && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ marginTop: 8, display: 'block' }}
                            onClick={() => {
                              const n = currentForm.new_collection_name?.trim()
                              if (!n) return
                              const hit = collections.find(
                                (c) => c.name.trim().toLowerCase() === n.toLowerCase(),
                              )
                              if (hit) {
                                store.assignCollectionIdToAll(hit.id)
                                setExistingCollNameNotice(
                                  `A collection named "${hit.name}" already exists — all ${store.files.length} photos will be added there.`,
                                )
                              } else {
                                store.applyNewCollectionFromCurrentToAllPhotos()
                              }
                            }}
                          >
                            Use this new collection for all {store.files.length} photos
                          </button>
                        )}
                      </>
                    )}
                    {existingCollNameNotice ? (
                      <div className="upload-dup-hint upload-dup-hint--pending" role="status" style={{ marginTop: 8 }}>
                        {existingCollNameNotice}
                      </div>
                    ) : null}
                  </div>

                  {/* Location */}
                  <div className="uf">
                    <div className="ul-row">
                      <div className="ul">Location</div>
                      {current.exif && (
                        <span style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                          ● GPS from EXIF
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      <LocationField
                        value={currentForm.neighborhood ?? ''}
                        onChange={(v) => store.updateForm(store.currentIndex, { neighborhood: v || null })}
                        labels={locationLabels}
                        placeholder="Neighborhood"
                      />
                      <input
                        className="ui"
                        placeholder="Sub-area or landmark"
                        value={currentForm.subarea ?? ''}
                        onChange={e => store.updateForm(store.currentIndex, { subarea: e.target.value || null })}
                      />
                    </div>
                    {store.files.length > 1 && (
                      <div style={{ marginTop: 8 }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => store.applySharedMetadataFromCurrentToAll()}
                        >
                          Apply collection, location & sub-area to all {store.files.length} photos
                        </button>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.4 }}>
                          Category, tags, and photo names stay per image.
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Tags */}
                  <div className="uf">
                    <div className="ul-row">
                      <div className="ul">Tags</div>
                      {current.aiScanning && (
                        <span style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                          ● AI scanning…
                        </span>
                      )}
                      {!current.aiScanning && current.ai && (
                        <span style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>● AI generated</span>
                      )}
                    </div>
                    {current.aiScanning && (
                      <div className="uc-tags-loader" role="status" aria-live="polite">
                        <span className="uc-tags-spinner" aria-hidden />
                        <span>Scanning image for tags…</span>
                      </div>
                    )}
                    {anyAiScanning && !current.aiScanning && !current.ai && (
                      <div className="uc-tags-queue-note" role="status">
                        AI is analyzing another photo first — tags will appear here when this image is scanned.
                      </div>
                    )}
                    <TagEditor
                      tags={currentForm.tags}
                      onChange={tags => store.updateForm(store.currentIndex, { tags })}
                      disabled={current.aiScanning}
                    />
                  </div>

                  {/* Notes */}
                  <div className="uf">
                    <div className="ul">Notes</div>
                    <input
                      className="ui"
                      placeholder="Optional shoot notes…"
                      value={currentForm.notes ?? ''}
                      onChange={e => store.updateForm(store.currentIndex, { notes: e.target.value || null })}
                    />
                  </div>
                </div>

                {/* Nav footer */}
                <div className="upload-footer-nav">
                  <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                    Photo {store.currentIndex + 1} of {store.files.length}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={store.currentIndex === 0}
                      onClick={() => store.setCurrentIndex(store.currentIndex - 1)}
                    >← Prev</button>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={store.currentIndex === store.files.length - 1}
                      onClick={() => store.setCurrentIndex(store.currentIndex + 1)}
                    >Next →</button>
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="upload-summary-bar">
                <div className="upload-summary-stats">
                  <span><b>{store.files.length}</b> photos selected</span>
                  <span><b>{reviewedCount}</b> AI-tagged</span>
                  {dupWarningCount > 0 && (
                    <span style={{ color: 'var(--amber)' }}>
                      <b>{dupWarningCount}</b> duplicate{dupWarningCount !== 1 ? 's' : ''} flagged
                    </span>
                  )}
                  <span>
                    Max <b>{MAX_SIMPLE_UPLOAD_PHOTOS}</b> photos · <b>{MAX_UPLOAD_MB}MB</b> each
                  </span>
                </div>
              </div>

              <div className="upload-actions">
                {!publishing && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      store.setStep(1)
                      setExistingCollNameNotice(null)
                    }}
                  >
                    Back
                  </button>
                )}
                {publishing && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => { cancelledRef.current = true }}
                  >
                    Cancel
                  </button>
                )}
                <button
                  className="btn btn-primary"
                  onClick={handlePublish}
                  disabled={publishing || anyAiScanning}
                >
                  {publishing
                    ? 'Publishing…'
                    : anyAiScanning
                      ? 'Waiting for AI…'
                      : `Publish ${store.files.length} photo${store.files.length !== 1 ? 's' : ''} →`}
                </button>
              </div>
            </>
          )}

          {/* Step 3 — Success */}
          {store.step === 3 && (
            <div className="upload-success">
              <div className="us-icon">✓</div>
              <div className="us-title">{publishedCount} photo{publishedCount !== 1 ? 's' : ''} published</div>
              <div className="us-sub">Added to Library · AI indexed</div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-with-icon"
                  onClick={() => {
                    store.reset()
                    store.setStep(1)
                    setExistingCollNameNotice(null)
                  }}
                >
                  <PlusIcon size={14} />
                  Add more photos
                </button>
                <button className="btn btn-primary" onClick={handleClose}>Done</button>
              </div>
            </div>
          )}
            </>
          )}
        </div>
      </div>
    </>
  )
}

function UploadFilmstripThumb({
  file,
  active,
  reviewed,
  isDup,
  dupInLibrary,
  title,
  onSelect,
  onRemove,
  disableRemove,
}: {
  file: File
  active: boolean
  reviewed: boolean
  isDup: boolean
  dupInLibrary: boolean
  title: string
  onSelect: () => void
  onRemove: () => void
  disableRemove: boolean
}) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])

  return (
    <div
      className={`ft ${active ? 'active' : ''} ${reviewed ? 'reviewed' : ''} ${isDup ? 'dup' : ''}`}
      onClick={onSelect}
      title={title}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', background: 'var(--surface-2)' }} />
      )}
      {isDup ? (
        <span className={`ft-dup-badge${dupInLibrary ? ' ft-dup-badge--lib' : ''}`} aria-hidden>
          Dup
        </span>
      ) : null}
      <button
        type="button"
        className="ft-remove"
        aria-label="Remove from upload"
        disabled={disableRemove}
        onClick={(e) => {
          e.stopPropagation()
          if (!disableRemove) onRemove()
        }}
      >
        ×
      </button>
    </div>
  )
}

function UploadPreview({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  if (!url) return <div className="uc-img" style={{ background: 'var(--surface-2)' }} />
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="uc-img" src={url} alt="" />
}

function TagEditor({
  tags,
  onChange,
  disabled,
}: {
  tags: string[]
  onChange: (tags: string[]) => void
  disabled?: boolean
}) {
  const [input, setInput] = useState('')

  const addTag = (val: string) => {
    if (disabled) return
    const trimmed = val.trim().toLowerCase()
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed])
    }
    setInput('')
  }

  const removeTag = (tag: string) => {
    if (disabled) return
    onChange(tags.filter(t => t !== tag))
  }

  return (
    <div
      className={`tags-wrap${disabled ? ' tags-wrap-disabled' : ''}`}
      style={disabled ? { opacity: 0.45, pointerEvents: 'none' } : undefined}
    >
      {tags.map(tag => (
        <span key={tag} className="tag-pill">
          {tag}
          <span className="tag-pill-x" onClick={() => removeTag(tag)}>✕</span>
        </span>
      ))}
      <input
        className="tag-input"
        style={{ border: 'none', background: 'none', outline: 'none', fontFamily: 'var(--font-body)', fontSize: 12, minWidth: 80, color: 'var(--text)' }}
        placeholder={disabled ? '…' : 'add tag…'}
        value={input}
        disabled={disabled}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            addTag(input)
          }
          if (e.key === 'Backspace' && !input && tags.length) {
            removeTag(tags[tags.length - 1])
          }
        }}
        onBlur={() => input && addTag(input)}
      />
    </div>
  )
}
