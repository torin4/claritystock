'use client'
import { useState, useEffect } from 'react'
import { createCollection } from '@/lib/actions/collections.actions'
import type { Category } from '@/lib/types/database.types'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
  /** Admin: create the collection owned by this user (not the signed-in admin). */
  ownedByUserId?: string
}

export default function CreateCollectionModal({ open, onClose, onCreated, ownedByUserId }: Props) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<Category | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setName('')
      setCategory(null)
    }
  }, [open])

  const handleClose = () => {
    if (!saving) onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      await createCollection(
        ownedByUserId
          ? { name: trimmed, category, ownedByUserId }
          : { name: trimmed, category },
      )
      onCreated()
      onClose()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not create collection')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className={`modal-overlay ${open ? 'open' : ''}`}
      onClick={e => { if (e.target === e.currentTarget) handleClose() }}
      role="presentation"
    >
      <div className="modal create-coll-modal" onClick={e => e.stopPropagation()} role="dialog" aria-labelledby="create-coll-title">
        <div className="modal-body create-coll-modal-body">
          <div className="modal-hdr create-coll-modal-hdr">
            <div id="create-coll-title" style={{ fontFamily: 'var(--font-head)', fontSize: 16, fontWeight: 600 }}>
              New collection
            </div>
            <button type="button" className="modal-close" onClick={handleClose} disabled={saving} aria-label="Close">
              ✕
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="modal-field" style={{ marginBottom: 14 }}>
              <div className="modal-lbl">Name</div>
              <input
                className="ui"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Spring 2025 — Kirkland"
                autoFocus
                disabled={saving}
              />
            </div>
            <div className="modal-field" style={{ marginBottom: 20 }}>
              <div className="modal-lbl">Category</div>
              <select
                className="ui"
                value={category ?? ''}
                onChange={e => setCategory((e.target.value as Category) || null)}
                disabled={saving}
              >
                <option value="">No category</option>
                <option value="neighborhood">Neighborhood</option>
                <option value="community">Community</option>
                <option value="amenity">Amenity</option>
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={handleClose} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !name.trim()}>
                {saving ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
