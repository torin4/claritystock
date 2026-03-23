'use client'
import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { useUIStore } from '@/stores/ui.store'
import { useUploadStore } from '@/stores/upload.store'
import { extractGps } from '@/lib/utils/exif'
import { uploadPhoto, uploadThumbnail } from '@/lib/utils/storage'
import { createJpegThumbnail } from '@/lib/utils/imageThumbnail'
import { publishPhoto } from '@/lib/actions/photos.actions'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import type { Collection, Category } from '@/lib/types/database.types'
import { PlusIcon } from '@/components/icons/PlusIcon'

const MAX_UPLOAD_MB = 50
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

type UploadNotice = {
  tone: 'warning' | 'info'
  message: string
} | null

interface Props {
  userId: string
  onSuccess: () => void
  /** When set (e.g. My Photos → inside a collection), new uploads default to this collection. */
  defaultCollectionId?: string | null
}

export default function UploadModal({ userId, onSuccess, defaultCollectionId = null }: Props) {
  const { uploadModalOpen, closeUpload } = useUIStore()
  const store = useUploadStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [collections, setCollections] = useState<Collection[]>([])
  const [uploadNotice, setUploadNotice] = useState<UploadNotice>(null)

  useEffect(() => {
    if (!uploadModalOpen) return
    const supabase = getSupabaseBrowserClient()
    supabase.from('collections').select('*').order('created_at', { ascending: false })
      .then(({ data }) => setCollections((data as Collection[]) ?? []))
  }, [uploadModalOpen])

  const targetCollectionName = useMemo(
    () =>
      defaultCollectionId
        ? collections.find(c => c.id === defaultCollectionId)?.name ?? null
        : null,
    [collections, defaultCollectionId],
  )

  const handleClose = () => {
    store.reset()
    setUploadNotice(null)
    closeUpload()
  }

  /** Backdrop closes modal on mobile only; desktop must use ✕ (avoids accidental loss of work). */
  const handleOverlayClick = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 769px)').matches) return
    handleClose()
  }

  const processFiles = useCallback(async (files: File[]) => {
    const images = files.filter(f => f.type.startsWith('image/'))
    const tooLarge = images.filter(f => f.size > MAX_UPLOAD_BYTES)
    const valid = images.filter(f => f.size <= MAX_UPLOAD_BYTES)
    const nonImages = files.length - images.length

    if (tooLarge.length || nonImages) {
      const rejectedNames = tooLarge.slice(0, 3).map(f => f.name).join(', ')
      setUploadNotice({
        tone: 'warning',
        message: [
          tooLarge.length
            ? `${tooLarge.length} photo${tooLarge.length === 1 ? '' : 's'} skipped for being over ${MAX_UPLOAD_MB}MB each${rejectedNames ? `: ${rejectedNames}` : ''}.`
            : null,
          nonImages
            ? `${nonImages} non-image file${nonImages === 1 ? '' : 's'} ignored.`
            : null,
        ].filter(Boolean).join(' '),
      })
    } else {
      setUploadNotice({
        tone: 'info',
        message: `Upload limit: ${MAX_UPLOAD_MB}MB per photo.`,
      })
    }

    if (!valid.length) return
    store.setFiles(valid)
    if (defaultCollectionId) {
      for (let i = 0; i < valid.length; i++) {
        store.updateForm(i, { collection_id: defaultCollectionId, new_collection_name: null })
      }
    }
    store.setStep(2)

    for (let i = 0; i < valid.length; i++) {
      const file = valid[i]
      // EXIF
      const gps = await extractGps(file)
      if (gps) store.setExif(i, gps)

      // Geocode if GPS
      let neighborhood: string | null = null
      if (gps) {
        try {
          const res = await fetch(`/api/geocode?lat=${gps.lat}&lng=${gps.lng}`)
          const geo = await res.json()
          neighborhood = geo.neighborhood ?? null
        } catch { /* silent */ }
      }
      if (neighborhood) store.updateForm(i, { neighborhood })

      // Gemini AI tagging
      store.setAiScanning(i, true)
      try {
        const b64 = await fileToBase64(file)
        const res = await fetch('/api/ai/tag', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: b64, mimeType: file.type }),
        })
        if (res.ok) {
          const ai = await res.json()
          store.setAi(i, ai)
        } else {
          const err = await res.json().catch(() => ({}))
          console.warn('[Add Photos] Gemini vision tag failed:', res.status, err)
        }
      } catch (e) {
        console.warn('[Add Photos] Gemini vision tag error:', e)
      } finally {
        store.setAiScanning(i, false)
      }
    }
  }, [store, defaultCollectionId])

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
      for (let i = 0; i < store.files.length; i++) {
        const f = store.files[i]
        if (f.published) continue
        try {
          const [storagePath, thumbBlob] = await Promise.all([
            uploadPhoto(f.file, userId),
            createJpegThumbnail(f.file),
          ])
          let thumbnailPath: string | null = null
          if (thumbBlob) {
            try {
              thumbnailPath = await uploadThumbnail(thumbBlob, userId)
            } catch (e) {
              console.warn('[Add Photos] Thumbnail upload failed:', e)
            }
          }
          await publishPhoto(
            { ...f.form, description: f.ai?.description },
            storagePath,
            userId,
            thumbnailPath,
          )
          store.markPublished(i)
        } catch (err) {
          store.setError(i, String(err))
        }
      }
      store.setStep(3)
      onSuccess()
    } finally {
      setPublishing(false)
    }
  }

  const reviewedCount = store.files.filter(f => f.ai !== null).length
  const publishedCount = store.files.filter(f => f.published).length

  return (
    <>
      <div className={`upload-modal-ov ${uploadModalOpen ? 'open' : ''}`} onClick={handleOverlayClick} />
      <div className={`upload-modal ${uploadModalOpen ? 'open' : ''}`}>
        <div className="upload-modal-hdr">
          <div>
            <div style={{ fontFamily: 'var(--font-head)', fontSize: 16, fontWeight: 700 }}>
              Add Photos
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
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
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
              <div className="dz-sub">JPEG or PNG · up to {MAX_UPLOAD_MB}MB each</div>
              <div
                style={{
                  marginTop: 8,
                  fontSize: 11,
                  color: 'var(--text-3)',
                  fontFamily: 'var(--font-mono)',
                  textAlign: 'center',
                }}
              >
                Files over {MAX_UPLOAD_MB}MB are skipped before upload starts.
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
              {/* Filmstrip */}
              <div className="filmstrip">
                {store.files.map((f, i) => {
                  const previewUrl = URL.createObjectURL(f.file)
                  return (
                    <div
                      key={i}
                      className={`ft ${store.currentIndex === i ? 'active' : ''} ${f.ai ? 'reviewed' : ''}`}
                      onClick={() => store.setCurrentIndex(i)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  )
                })}
              </div>

              {/* Card for current file */}
              <div className="upload-card">
                <UploadPreview file={current.file} />
                <div className="uc-body">
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
                      <option value="community">Community</option>
                      <option value="amenity">Amenity</option>
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
                        if (e.target.value === '__new__') {
                          store.updateForm(store.currentIndex, { new_collection_name: '', collection_id: null })
                        } else {
                          store.updateForm(store.currentIndex, { collection_id: e.target.value || null, new_collection_name: null })
                        }
                      }}
                    >
                      <option value="">No collection</option>
                      {collections.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                      <option value="__new__">+ Create new collection…</option>
                    </select>
                    {currentForm.new_collection_name !== null && (
                      <input
                        className="ui"
                        style={{ marginTop: 5 }}
                        placeholder="New collection name…"
                        value={currentForm.new_collection_name ?? ''}
                        onChange={e => store.updateForm(store.currentIndex, { new_collection_name: e.target.value })}
                      />
                    )}
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
                      <input
                        className="ui"
                        placeholder="Neighborhood"
                        value={currentForm.neighborhood ?? ''}
                        onChange={e => store.updateForm(store.currentIndex, { neighborhood: e.target.value || null })}
                      />
                      <input
                        className="ui"
                        placeholder="Sub-area or landmark"
                        value={currentForm.subarea ?? ''}
                        onChange={e => store.updateForm(store.currentIndex, { subarea: e.target.value || null })}
                      />
                    </div>
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
                  <span>Limit <b>{MAX_UPLOAD_MB}MB</b> each</span>
                </div>
              </div>

              <div className="upload-actions">
                <button className="btn btn-ghost" onClick={() => store.setStep(1)}>Back</button>
                <button
                  className="btn btn-primary"
                  onClick={handlePublish}
                  disabled={publishing}
                >
                  {publishing ? 'Publishing…' : `Publish ${store.files.length} photo${store.files.length !== 1 ? 's' : ''} →`}
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
                <button type="button" className="btn btn-ghost btn-with-icon" onClick={() => { store.reset(); store.setStep(1) }}>
                  <PlusIcon size={14} />
                  Add more photos
                </button>
                <button className="btn btn-primary" onClick={handleClose}>Done</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
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

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
