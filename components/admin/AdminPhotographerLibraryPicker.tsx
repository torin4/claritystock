'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useId, useState } from 'react'

export type PhotographerPickRow = {
  id: string
  name: string | null
  initials: string | null
  libraryPhotos: number
}

function formatPickLabel(p: PhotographerPickRow) {
  const who = p.name || p.initials || p.id
  return `${who} · ${p.libraryPhotos} photo${p.libraryPhotos === 1 ? '' : 's'}`
}

export default function AdminPhotographerLibraryPicker({
  photographers,
  selectedId,
}: {
  photographers: PhotographerPickRow[]
  selectedId: string
}) {
  const router = useRouter()
  const labelId = useId()
  const [sheetOpen, setSheetOpen] = useState(false)

  const selected = photographers.find(p => p.id === selectedId)
  const triggerLabel = selected ? formatPickLabel(selected) : 'Select photographer'

  const navigateTo = useCallback(
    (id: string) => {
      router.push(id ? `/admin/libraries?photographer=${encodeURIComponent(id)}` : '/admin/libraries')
      setSheetOpen(false)
    },
    [router],
  )

  useEffect(() => {
    if (!sheetOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheetOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [sheetOpen])

  return (
    <div className="ph admin-lib-picker-wrap" style={{ paddingBottom: 8 }}>
      <div
        className="admin-lib-picker-row"
        style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}
      >
        <span id={labelId} className="ph-sub admin-lib-picker-label" style={{ margin: 0 }}>
          Photographer
        </span>

        {/* Mobile: custom sheet — OS select menus stay tiny; this is readable + tappable */}
        <div className="admin-lib-picker-mobile md:hidden w-full">
          <button
            type="button"
            className="admin-lib-picker-trigger"
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
            aria-labelledby={labelId}
            onClick={() => setSheetOpen(true)}
          >
            <span className="admin-lib-picker-trigger-text">{triggerLabel}</span>
            <span className="admin-lib-picker-trigger-chev" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>
          {sheetOpen ? (
            <>
              <button
                type="button"
                className="admin-lib-picker-backdrop"
                aria-label="Close photographer list"
                onClick={() => setSheetOpen(false)}
              />
              <div
                className="admin-lib-picker-sheet"
                role="dialog"
                aria-modal="true"
                aria-labelledby={`${labelId}-sheet-title`}
              >
                <div className="admin-lib-picker-sheet-top">
                  <div id={`${labelId}-sheet-title`} className="admin-lib-picker-sheet-title">
                    Choose photographer
                  </div>
                  <button
                    type="button"
                    className="admin-lib-picker-sheet-close"
                    aria-label="Close"
                    onClick={() => setSheetOpen(false)}
                  >
                    Done
                  </button>
                </div>
                <ul className="admin-lib-picker-list" role="listbox">
                  {photographers.map(p => {
                    const active = p.id === selectedId
                    return (
                      <li key={p.id} role="presentation">
                        <button
                          type="button"
                          role="option"
                          aria-selected={active}
                          className={`admin-lib-picker-option${active ? ' is-selected' : ''}`}
                          onClick={() => navigateTo(p.id)}
                        >
                          {formatPickLabel(p)}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </>
          ) : null}
        </div>

        <select
          id="admin-lib-pick"
          className="ui admin-photographer-select admin-lib-picker-native hidden md:block w-full"
          aria-labelledby={labelId}
          value={selectedId}
          onChange={e => {
            const id = e.target.value
            navigateTo(id)
          }}
          style={{ minWidth: 240, maxWidth: '100%' }}
        >
          {photographers.map(p => (
            <option key={p.id} value={p.id}>
              {formatPickLabel(p)}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
