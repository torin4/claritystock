'use client'
import { useState, useEffect } from 'react'
import { useUIStore } from '@/stores/ui.store'
import { updatePhoto, deletePhoto } from '@/lib/actions/photos.actions'
import { getOrCreateCollectionByName } from '@/lib/actions/collections.actions'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import type { Photo, Collection, Category } from '@/lib/types/database.types'
import LocationField from '@/components/neighborhoods/LocationField'
import { getNeighborhoodCanonicalLabels } from '@/lib/actions/neighborhoods.actions'
import { sortCollectionsByName } from '@/lib/utils/sortCollectionsByName'

interface Props {
  userId: string
  onSuccess: () => void
}

export default function EditModal({ userId, onSuccess }: Props) {
  const { editModalPhotoId, closeEdit } = useUIStore()
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [collections, setCollections] = useState<Collection[]>([])
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<Category | null>(null)
  const [collectionId, setCollectionId] = useState<string | null>(null)
  const [neighborhood, setNeighborhood] = useState('')
  const [capturedDate, setCapturedDate] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [locationLabels, setLocationLabels] = useState<string[]>([])
  const [creatingColl, setCreatingColl] = useState(false)
  const [newCollName, setNewCollName] = useState('')
  const [collBusy, setCollBusy] = useState(false)

  useEffect(() => {
    getNeighborhoodCanonicalLabels()
      .then(setLocationLabels)
      .catch(() => setLocationLabels([]))
  }, [])

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    supabase
      .from('collections')
      .select('*')
      .eq('created_by', userId)
      .then(({ data }) =>
        setCollections(sortCollectionsByName((data as Collection[]) ?? [])),
      )
  }, [userId])

  useEffect(() => {
    if (!editModalPhotoId) { setPhoto(null); return }
    const supabase = getSupabaseBrowserClient()
    supabase
      .from('photos')
      .select('*, collection:collections!collection_id(id, name)')
      .eq('id', editModalPhotoId)
      .single()
      .then(({ data }) => {
        if (!data) return
        const p = data as Photo
        setPhoto(p)
        setTitle(p.title ?? '')
        setCategory(p.category ?? null)
        setCollectionId(p.collection_id ?? null)
        setNeighborhood(p.neighborhood ?? '')
        setCapturedDate(p.captured_date ?? '')
        setTags(p.tags ?? [])
        setNotes(p.notes ?? '')
      })
  }, [editModalPhotoId])

  const handleSave = async () => {
    if (!photo) return
    setSaving(true)
    try {
      await updatePhoto(photo.id, {
        title,
        category,
        collection_id: collectionId,
        neighborhood: neighborhood || null,
        captured_date: capturedDate || null,
        tags,
        notes: notes || null,
      })
      onSuccess()
      closeEdit()
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveFromCollection = async () => {
    if (!photo?.collection_id) return
    setSaving(true)
    try {
      await updatePhoto(photo.id, { collection_id: null })
      setCollectionId(null)
      onSuccess()
      closeEdit()
    } finally {
      setSaving(false)
    }
  }

  /** Create (or reuse) a collection by name, then select it. Saved with the photo on Save. */
  const handleCreateCollection = async () => {
    const name = newCollName.trim()
    if (!name || collBusy) return
    setCollBusy(true)
    try {
      const { id } = await getOrCreateCollectionByName({ name })
      setCollections((prev) =>
        prev.some((c) => c.id === id)
          ? prev
          : sortCollectionsByName([...prev, { id, name } as unknown as Collection]),
      )
      setCollectionId(id)
      setNewCollName('')
      setCreatingColl(false)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not create collection')
    } finally {
      setCollBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!photo || !confirm('Remove this photo from the library?')) return
    setDeleting(true)
    try {
      await deletePhoto(photo.id, photo.storage_path, photo.thumbnail_path, photo.display_path)
      onSuccess()
      closeEdit()
    } finally {
      setDeleting(false)
    }
  }

  const addTag = (val: string) => {
    const trimmed = val.trim().toLowerCase()
    if (trimmed && !tags.includes(trimmed)) setTags(prev => [...prev, trimmed])
    setTagInput('')
  }

  const open = !!editModalPhotoId

  return (
    <div
      className={`modal-overlay ${open ? 'open' : ''}`}
      onClick={e => { if (e.target === e.currentTarget) closeEdit() }}
    >
      <div className="modal">
        <div className="modal-body">
          <div className="modal-hdr">
            <input
              className="modal-title-input"
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
            <button className="modal-close" onClick={closeEdit}>✕</button>
          </div>

          <div className="modal-stat">
            Used <span>{photo?.downloads_count ?? 0}×</span>
            &nbsp;·&nbsp; Added <span>{photo ? new Date(photo.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span>
            {photo?.collection && <>&nbsp;·&nbsp; <span>{(photo.collection as Collection).name}</span></>}
          </div>

          <div className="modal-row">
            <div className="modal-field">
              <div className="modal-lbl">Category</div>
              <select
                className="ui"
                value={category ?? ''}
                onChange={e => setCategory((e.target.value as Category) || null)}
              >
                <option value="">No category</option>
                <option value="neighborhood">Neighborhood</option>
                <option value="city">City</option>
                <option value="condo">Condo</option>
              </select>
            </div>
            <div className="modal-field">
              <div className="modal-lbl">Collection</div>
              <select
                className="ui"
                value={collectionId ?? ''}
                onChange={e => setCollectionId(e.target.value || null)}
              >
                <option value="">No collection</option>
                {collections.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {creatingColl ? (
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <input
                    className="ui"
                    autoFocus
                    value={newCollName}
                    onChange={e => setNewCollName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); void handleCreateCollection() }
                      if (e.key === 'Escape') { setCreatingColl(false); setNewCollName('') }
                    }}
                    placeholder="New collection name"
                    style={{ flex: 1 }}
                    disabled={collBusy}
                  />
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => void handleCreateCollection()} disabled={collBusy || !newCollName.trim()}>
                    {collBusy ? '…' : 'Create'}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setCreatingColl(false); setNewCollName('') }} disabled={collBusy}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 14, marginTop: 8, alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ padding: 0, fontSize: 11 }}
                    onClick={() => setCreatingColl(true)}
                    disabled={saving}
                  >
                    + New collection
                  </button>
                  {photo?.collection_id ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ padding: 0, fontSize: 11 }}
                      onClick={() => {
                        if (!confirm('Remove this photo from its collection? It stays in your library.')) return
                        void handleRemoveFromCollection()
                      }}
                      disabled={saving}
                    >
                      Remove from collection
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          <div className="modal-row">
            <div className="modal-field">
              <div className="modal-lbl">Neighborhood</div>
              <LocationField
                value={neighborhood}
                onChange={setNeighborhood}
                labels={locationLabels}
                placeholder="e.g. Kirkland"
              />
            </div>
            <div className="modal-field">
              <div className="modal-lbl">Captured</div>
              <input
                className="ui"
                type="date"
                value={capturedDate}
                onChange={e => setCapturedDate(e.target.value)}
              />
            </div>
          </div>

          <div className="modal-field">
            <div className="modal-lbl">Tags · click to remove · type + enter to add</div>
            <div
              className="tag-editor"
              onClick={() => document.getElementById('edit-tag-input')?.focus()}
            >
              {tags.map(tag => (
                <span key={tag} className="tag-pill">
                  {tag}
                  <span className="tag-pill-x" onClick={() => setTags(prev => prev.filter(t => t !== tag))}>✕</span>
                </span>
              ))}
              <input
                id="edit-tag-input"
                className="tag-input"
                placeholder="add tag…"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput) }
                  if (e.key === 'Backspace' && !tagInput && tags.length) {
                    setTags(prev => prev.slice(0, -1))
                  }
                }}
                onBlur={() => tagInput && addTag(tagInput)}
              />
            </div>
          </div>

          <div className="modal-field">
            <div className="modal-lbl">Notes</div>
            <input
              className="ui"
              placeholder="Optional shoot notes…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          <div className="modal-footer">
            <button className="btn-del-sm" onClick={handleDelete} disabled={deleting}>
              ✕ {deleting ? 'Removing…' : 'Remove from Library'}
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={closeEdit}>Cancel</button>
              <button className="btn-save" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
