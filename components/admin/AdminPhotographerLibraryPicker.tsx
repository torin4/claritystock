'use client'

import { useRouter } from 'next/navigation'

export type PhotographerPickRow = {
  id: string
  name: string | null
  initials: string | null
  libraryPhotos: number
}

export default function AdminPhotographerLibraryPicker({
  photographers,
  selectedId,
}: {
  photographers: PhotographerPickRow[]
  selectedId: string
}) {
  const router = useRouter()

  return (
    <div className="ph" style={{ paddingBottom: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <label htmlFor="admin-lib-pick" className="ph-sub" style={{ margin: 0 }}>
          Photographer
        </label>
        <select
          id="admin-lib-pick"
          className="ui"
          value={selectedId}
          onChange={e => {
            const id = e.target.value
            router.push(id ? `/admin/libraries?photographer=${encodeURIComponent(id)}` : '/admin/libraries')
          }}
          style={{ minWidth: 240, maxWidth: '100%' }}
        >
          {photographers.map(p => (
            <option key={p.id} value={p.id}>
              {(p.name || p.initials || p.id) + ` · ${p.libraryPhotos} photo${p.libraryPhotos === 1 ? '' : 's'}`}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
