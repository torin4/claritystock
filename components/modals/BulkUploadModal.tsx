'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUIStore } from '@/stores/ui.store'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { getOrCreateCollectionByName } from '@/lib/actions/collections.actions'
import { publishPhoto } from '@/lib/actions/photos.actions'
import {
  BULK_CONCURRENCY,
  buildFormForBulkFile,
  parseBulkZipToEntries,
  runWithConcurrency,
} from '@/lib/uploads/bulkZipImport'
import { runAiTaggingOnFile, uploadPhotoAssetsForPublish } from '@/lib/uploads/processImageForPublish'
import { sha256HexFromFile } from '@/lib/utils/sha256File'
import type { AiTagResult, PhotoFormValues } from '@/lib/types/database.types'

interface Props {
  userId: string
}

export default function BulkUploadModal({ userId }: Props) {
  const router = useRouter()
  const { bulkUploadModalOpen, closeBulkUpload } = useUIStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const cancelledRef = useRef(false)
  const [phase, setPhase] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [lastSummary, setLastSummary] = useState<{ ok: number; fail: number } | null>(null)

  const handleClose = () => {
    cancelledRef.current = true
    closeBulkUpload()
    setPhase('idle')
    setMessage('')
  }

  /** Backdrop closes on small screens only (same pattern as UploadModal). */
  const handleOverlayClick = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 769px)').matches) return
    handleClose()
  }

  const runBulk = useCallback(
    async (zipFile: File) => {
      cancelledRef.current = false
      setPhase('running')
      setMessage('Reading ZIP…')
      const supabase = getSupabaseBrowserClient()

      let entries
      try {
        entries = await parseBulkZipToEntries(zipFile)
      } catch (e) {
        setPhase('error')
        setMessage(e instanceof Error ? e.message : 'Could not read ZIP')
        return
      }

      if (!entries.length) {
        setPhase('error')
        setMessage('No images found in ZIP (JPEG/PNG/WebP/HEIC; max size limits apply).')
        return
      }

      const { data: jobRow, error: jobErr } = await supabase
        .from('bulk_upload_jobs')
        .insert({
          photographer_id: userId,
          status: 'running',
        })
        .select('id')
        .single()

      if (jobErr || !jobRow?.id) {
        setPhase('error')
        setMessage(jobErr?.message ?? 'Could not start import job')
        return
      }

      const jobId = jobRow.id as string

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
        await supabase.from('bulk_upload_jobs').update({ status: 'failed', completed_at: new Date().toISOString() }).eq('id', jobId)
        setPhase('error')
        setMessage(itemsErr?.message ?? 'Could not create import items')
        return
      }

      const pathToItemId = new Map(insertedItems.map((r) => [r.relative_path, r.id as string]))

      const folderToCollection = new Map<string, string>()
      const uniqueFolders = Array.from(new Set(entries.map((e) => e.folderName))).filter((name) => name.length > 0)
      for (const folder of uniqueFolders) {
        try {
          const { id } = await getOrCreateCollectionByName({ name: folder, category: 'neighborhood' })
          folderToCollection.set(folder, id)
        } catch (e) {
          await supabase.from('bulk_upload_jobs').update({ status: 'failed', completed_at: new Date().toISOString() }).eq('id', jobId)
          setPhase('error')
          setMessage(e instanceof Error ? e.message : 'Collection error')
          return
        }
      }

      let ok = 0
      let fail = 0

      await runWithConcurrency(entries, BULK_CONCURRENCY, async (entry) => {
        if (cancelledRef.current) return
        const itemId = pathToItemId.get(entry.relativePath)
        if (!itemId) return

        setMessage(`Processing ${entry.relativePath}…`)

        await supabase.from('bulk_upload_items').update({ status: 'processing' }).eq('id', itemId)

        const collectionId = folderToCollection.get(entry.folderName)
        if (!collectionId) {
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
            userId,
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
            userId,
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
      })

      const completedAt = new Date().toISOString()
      const summary = { success_count: ok, failed_count: fail }
      await supabase
        .from('bulk_upload_jobs')
        .update({
          status: 'completed',
          completed_at: completedAt,
          summary,
        })
        .eq('id', jobId)

      setLastSummary({ ok, fail })
      setPhase('done')
      setMessage('')
      router.refresh()
      useUIStore.getState().bumpSidebarCollections()
    },
    [userId, router],
  )

  const onPickZip = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f && f.name.toLowerCase().endsWith('.zip')) void runBulk(f)
  }

  if (!bulkUploadModalOpen) return null

  return (
    <>
      <div className="upload-modal-ov open" onClick={handleOverlayClick} aria-hidden />
      <div className="upload-modal open">
        <div className="upload-modal-hdr">
          <div>
            <div style={{ fontFamily: 'var(--font-head)', fontSize: 16, fontWeight: 700 }}>Bulk upload (ZIP)</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
              Each top-level folder becomes a collection. AI tags and location run automatically.
            </div>
          </div>
          <button type="button" className="modal-close" style={{ width: 30, height: 30, fontSize: 14 }} onClick={handleClose}>
            ✕
          </button>
        </div>
        <div className="upload-modal-body" style={{ paddingBottom: 20 }}>
          {phase === 'idle' && (
            <div>
              <input ref={fileRef} type="file" accept=".zip,application/zip" hidden onChange={onPickZip} />
              <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()}>
                Choose ZIP file
              </button>
              <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 12 }}>
                Structure: <code>FolderName/photo.jpg</code> — each folder becomes a collection. Files at the ZIP root
                (not in a folder) are imported without a collection. Max {500} images.
              </p>
            </div>
          )}
          {phase === 'running' && (
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
              <p style={{ marginBottom: 8 }}>Working in the background — you can leave this dialog and browse the app.</p>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{message || 'Processing…'}</p>
              <button type="button" className="btn btn-ghost" style={{ marginTop: 12 }} onClick={handleClose}>
                Close (import continues)
              </button>
            </div>
          )}
          {phase === 'done' && lastSummary && (
            <div>
              <p style={{ fontSize: 14, marginBottom: 8 }}>
                Import finished: <strong>{lastSummary.ok}</strong> published
                {lastSummary.fail > 0 ? (
                  <>
                    , <strong>{lastSummary.fail}</strong> failed — check notifications to review.
                  </>
                ) : (
                  ' ✓'
                )}
              </p>
              <button type="button" className="btn btn-primary" onClick={handleClose}>
                Done
              </button>
            </div>
          )}
          {phase === 'error' && (
            <div>
              <p style={{ color: 'var(--cm-bad, #c44)', fontSize: 13, marginBottom: 8 }}>{message}</p>
              <button type="button" className="btn btn-primary" onClick={() => { setPhase('idle'); setMessage('') }}>
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
