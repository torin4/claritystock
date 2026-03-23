'use client'
import { useFilterStore } from '@/stores/filter.store'
import type { QuickFilter } from '@/lib/types/database.types'

const CHIPS: { label: string; value: QuickFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Downloaded by me', value: 'mine' },
  { label: 'Not downloaded', value: 'new' },
  { label: '♥ Favorites', value: 'fav' },
]

export default function QuickFilterRow() {
  const { quickFilter, setQuickFilter } = useFilterStore()

  return (
    <div className="quick-filter-row">
      <span style={{
        fontSize: '10px', fontWeight: 500, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: 'var(--text-3)', fontFamily: 'var(--font-mono)',
        whiteSpace: 'nowrap', flexShrink: 0,
      }}>
        Quick filter
      </span>
      {CHIPS.map(chip => (
        <button
          key={chip.value}
          className={`qchip ${quickFilter === chip.value ? 'active' : ''}`}
          onClick={() => setQuickFilter(chip.value)}
        >
          {chip.label}
        </button>
      ))}
    </div>
  )
}
