'use client'
import { useFilterStore } from '@/stores/filter.store'
import type { Collection } from '@/lib/types/database.types'

const CAT_COLORS: Record<string, string> = {
  neighborhood: 'var(--accent-light)',
  community: '#c49060',
  amenity: '#6a9ec4',
}

export default function CollectionsStrip({ collections }: { collections: Collection[] }) {
  const { collectionId, setCollection } = useFilterStore()

  if (!collections.length) return null

  return (
    <div className="coll-strip">
      <button
        className={`coll-chip ${!collectionId ? 'active' : ''}`}
        onClick={() => setCollection(null)}
      >
        All collections
      </button>
      {collections.map(c => (
        <button
          key={c.id}
          className={`coll-chip ${collectionId === c.id ? 'active' : ''}`}
          onClick={() => setCollection(collectionId === c.id ? null : c.id)}
        >
          {c.category && (
            <span
              className="coll-chip-dot"
              style={{ background: CAT_COLORS[c.category] ?? 'var(--text-3)' }}
            />
          )}
          {c.name}
          {c.photo_count !== undefined && (
            <span style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
              {c.photo_count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
