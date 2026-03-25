'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { extractGps } from '@/lib/utils/exif'
import { fileToBase64 } from '@/lib/utils/fileToBase64'
import { uploadPhoto, uploadThumbnail } from '@/lib/utils/storage'
import { createJpegThumbnail } from '@/lib/utils/imageThumbnail'
import { publishPhoto } from '@/lib/actions/photos.actions'
import { createCollection } from '@/lib/actions/collections.actions'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import type { Category, PhotoFormValues, AiTagResult, ExifResult } from '@/lib/types/database.types'
import { PlusIcon } from '@/components/icons/PlusIcon'
import { devWarn } from '@/lib/utils/devLog'

type Row = {
  file: File
  exif: ExifResult | null
  ai: AiTagResult | null
  aiScanning: boolean
  form: PhotoFormValues
  published: boolean
  error: string | null
}

interface Props {
  photographers: { id: string; name: string | null; initials: string | null; role: string }[]
  /** When true, render as a section below team analytics (no duplicate “Admin” page title). */
  embedded?: boolean
}

const MAX_UPLOAD_MB = 50
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

function formForCollection(collectionId: string | null): PhotoFormValues {
  return {
    title: '',
    category: null,
    collection_id: collectionId,
    new_collection_name: null,
    neighborhood: null,
    subarea: null,
    captured_date: null,
    tags: [],
    notes: null,
  }
}

function stripExtension(name: string) {
  return name.replace(/\.[^.]+$/, '')
}

export default function AdminUploadClient({ photographers, embedded = false }: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [targetUserId, setTargetUserId] = useState('')
  const [collections, setCollections] = useState<{ id: string; name: string }[]>([])
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('')
  const [newCollName, setNewCollName] = useState('')
  const [newCollCategory, setNewCollCategory] = useState<Category | ''>('')
  const [creatingColl, setCreatingColl] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [publishing, setPublishing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!targetUserId) {
      setCollections([])
      setSelectedCollectionId('')
      return
    }
    const supabase = getSupabaseBrowserClient()
    supabase
      .from('collections')
      .select('id, name')
      .eq('created_by', targetUserId)
      .order('created_at', { ascending: false })
      .then(({ data }) => setCollections((data as { id: string; name: string }[]) ?? []))
  }, [targetUserId])

  const targetLabel = photographers.find(p => p.id === targetUserId)?.name ?? targetUserId

  const processFiles = useCallback(
    async (files: File[]) => {
      const images = files.filter(f => f.type.startsWith('image/'))
      const valid = images.filter(f => f.size <= MAX_UPLOAD_BYTES)
      if (images.length !== valid.length) {
        setNotice(`Some files were skipped (over ${MAX_UPLOAD_MB}MB or not images).`)
      } else {
        setNotice(null)
      }
      if (!valid.length) return
      if (!targetUserId) {
        setNotice('Choose a photographer first.')
        return
      }
      if (!selectedCollectionId) {
        setNotice('Choose a collection or create one for this photographer.')
        return
      }

      const baseForm = formForCollection(selectedCollectionId)

      setRows(prev => {
        const startIdx = prev.length
        const initial: Row[] = valid.map(file => ({
          file,
          exif: null,
          ai: null,
          aiScanning: false,
          form: { ...baseForm },
          published: false,
          error: null,
        }))

        void (async () => {
          for (let i = 0; i < valid.length; i++) {
            const idx = startIdx + i
            const file = valid[i]
            const gps = await extractGps(file)
            if (gps) {
              setRows(prevInner => {
                const next = [...prevInner]
                if (next[idx]) next[idx] = { ...next[idx], exif: gps }
                return next
              })
              let neighborhood: string | null = null
              try {
                const res = await fetch(`/api/geocode?lat=${gps.lat}&lng=${gps.lng}`)
                const geo = await res.json()
                neighborhood = geo.neighborhood ?? null
              } catch { /* silent */ }
              if (neighborhood) {
                setRows(prevInner => {
                  const next = [...prevInner]
                  if (next[idx]) {
                    next[idx] = {
                      ...next[idx],
                      form: { ...next[idx].form, neighborhood },
                    }
                  }
                  return next
                })
              }
            }

            setRows(prevInner => {
              const next = [...prevInner]
              if (next[idx]) next[idx] = { ...next[idx], aiScanning: true }
              return next
            })
            try {
              const b64 = await fileToBase64(file)
              const res = await fetch('/api/ai/tag', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64: b64, mimeType: file.type }),
              })
              if (res.ok) {
                const ai = (await res.json()) as AiTagResult
                setRows(prevInner => {
                  const next = [...prevInner]
                  if (next[idx]) {
                    next[idx] = {
                      ...next[idx],
                      ai,
                      aiScanning: false,
                      form: {
                        ...next[idx].form,
                        title: ai.title || stripExtension(file.name),
                        category: ai.category,
                        tags: ai.tags ?? [],
                      },
                    }
                  }
                  return next
                })
              } else {
                setRows(prevInner => {
                  const next = [...prevInner]
                  if (next[idx]) {
                    next[idx] = {
                      ...next[idx],
                      aiScanning: false,
                      form: {
                        ...next[idx].form,
                        title: stripExtension(file.name),
                        category: 'neighborhood',
                      },
                    }
                  }
                  return next
                })
              }
            } catch {
              setRows(prevInner => {
                const next = [...prevInner]
                if (next[idx]) {
                  next[idx] = {
                    ...next[idx],
                    aiScanning: false,
                    form: {
                      ...next[idx].form,
                      title: stripExtension(file.name),
                      category: 'neighborhood',
                    },
                  }
                }
                return next
              })
            }
          }
        })()

        return [...prev, ...initial]
      })
    },
    [targetUserId, selectedCollectionId],
  )

  const handleCreateCollection = async () => {
    const name = newCollName.trim()
    if (!name || !targetUserId) return
    setCreatingColl(true)
    try {
      const { id } = await createCollection({
        name,
        category: newCollCategory || null,
        ownedByUserId: targetUserId,
      })
      setCollections(prev => [{ id, name }, ...prev])
      setSelectedCollectionId(id)
      setNewCollName('')
      setNewCollCategory('')
      setNotice(null)
      router.refresh()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not create collection')
    } finally {
      setCreatingColl(false)
    }
  }

  const handlePublishAll = async () => {
    if (!targetUserId || !selectedCollectionId || !rows.length) return
    const pending = rows.map((r, i) => ({ r, i })).filter(x => !x.r.published && !x.r.error)
    if (!pending.length) return
    setPublishing(true)
    try {
      for (const { r, i } of pending) {
        try {
          const [storagePath, thumbBlob] = await Promise.all([
            uploadPhoto(r.file, targetUserId),
            createJpegThumbnail(r.file),
          ])
          let thumbnailPath: string | null = null
          if (thumbBlob) {
            try {
              thumbnailPath = await uploadThumbnail(thumbBlob, targetUserId)
            } catch (e) {
              devWarn('[Admin upload] Thumbnail failed:', e)
            }
          }
          await publishPhoto(
            { ...r.form, description: r.ai?.description },
            storagePath,
            targetUserId,
            { thumbnailPath },
          )
          setRows(prev => {
            const next = [...prev]
            next[i] = { ...next[i], published: true, error: null }
            return next
          })
        } catch (err) {
          setRows(prev => {
            const next = [...prev]
            next[i] = { ...next[i], error: err instanceof Error ? err.message : String(err) }
            return next
          })
        }
      }
      router.refresh()
    } finally {
      setPublishing(false)
    }
  }

  const anyScanning = rows.some(r => r.aiScanning)
  const canPublish =
    targetUserId &&
    selectedCollectionId &&
    rows.length > 0 &&
    !anyScanning &&
    !publishing

  return (
    <div
      style={{
        padding: embedded ? '28px 20px 48px' : '24px 20px 48px',
        maxWidth: embedded ? undefined : 720,
        borderTop: embedded ? '1px solid var(--border)' : undefined,
      }}
    >
      <div className="ph" style={{ marginBottom: 24, paddingBottom: 0, border: 'none' }}>
        <div>
          {embedded ? (
            <div
              style={{
                fontFamily: 'var(--font-head)',
                fontSize: 18,
                fontWeight: 700,
                marginBottom: 6,
              }}
            >
              Proxy upload
            </div>
          ) : (
            <div className="ph-title">Admin</div>
          )}
          <div className="ph-sub">
            Upload photos into a photographer’s library (correct ownership). Use collections they own or create one below.
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <label className="admin-field">
          <span className="admin-label">Photographer</span>
          <select
            className="ui"
            value={targetUserId}
            onChange={e => {
              setTargetUserId(e.target.value)
              setRows([])
              setSelectedCollectionId('')
            }}
            aria-label="Target photographer"
          >
            <option value="">Select user…</option>
            {photographers.map(p => (
              <option key={p.id} value={p.id}>
                {p.name || p.initials || p.id}{p.role === 'admin' ? ' (admin)' : ''}
              </option>
            ))}
          </select>
        </label>

        {!!targetUserId && (
          <>
            <label className="admin-field">
              <span className="admin-label">Collection</span>
              <select
                className="ui"
                value={selectedCollectionId}
                onChange={e => setSelectedCollectionId(e.target.value)}
                aria-label="Target collection"
              >
                <option value="">Select collection…</option>
                {collections.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <div
              style={{
                padding: 14,
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface-2)',
              }}
            >
              <div className="admin-label" style={{ marginBottom: 8 }}>
                New collection for {targetLabel}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
                <input
                  className="si"
                  style={{ flex: '1 1 180px' }}
                  placeholder="Collection name"
                  value={newCollName}
                  onChange={e => setNewCollName(e.target.value)}
                />
                <select
                  className="ui"
                  style={{ width: 160 }}
                  value={newCollCategory}
                  onChange={e => setNewCollCategory(e.target.value as Category | '')}
                  aria-label="Collection category"
                >
                  <option value="">Category…</option>
                  <option value="neighborhood">Neighborhood</option>
                  <option value="community">Community</option>
                  <option value="amenity">Amenity</option>
                </select>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={creatingColl || !newCollName.trim()}
                  onClick={() => void handleCreateCollection()}
                >
                  {creatingColl ? 'Creating…' : 'Create collection'}
                </button>
              </div>
            </div>
          </>
        )}

        <div>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*"
            style={{ display: 'none' }}
            onChange={e => {
              if (e.target.files) void processFiles(Array.from(e.target.files))
              e.target.value = ''
            }}
          />
          <button
            type="button"
            className="btn btn-primary btn-sm btn-with-icon"
            disabled={!targetUserId || !selectedCollectionId}
            onClick={() => fileRef.current?.click()}
          >
            <PlusIcon size={15} />
            Add images
          </button>
          {!targetUserId || !selectedCollectionId ? (
            <span style={{ marginLeft: 12, fontSize: 12, color: 'var(--text-3)' }}>
              Select photographer and collection first.
            </span>
          ) : null}
        </div>

        {notice && (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              fontSize: 12,
              color: 'var(--text-2)',
            }}
          >
            {notice}
          </div>
        )}

        {rows.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>
                {rows.length} file{rows.length !== 1 ? 's' : ''}
                {anyScanning ? ' · AI tagging…' : ''}
              </span>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!canPublish}
                onClick={() => void handlePublishAll()}
              >
                {publishing ? 'Publishing…' : 'Publish all to library'}
              </button>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {rows.map((r, i) => (
                <li
                  key={`${r.file.name}-${i}`}
                  style={{
                    padding: '8px 0',
                    borderBottom: '1px solid var(--border)',
                    fontSize: 12,
                    color: 'var(--text-2)',
                  }}
                >
                  <span style={{ fontWeight: 500, color: 'var(--text)' }}>{r.file.name}</span>
                  {r.aiScanning && ' · Tagging…'}
                  {r.published && (
                    <span style={{ color: 'var(--accent)', marginLeft: 8 }}>Published</span>
                  )}
                  {r.error && (
                    <span style={{ color: 'var(--cm-bad, #c44)', marginLeft: 8 }}>{r.error}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
