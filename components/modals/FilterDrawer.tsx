'use client'
import { useFilterStore } from '@/stores/filter.store'
import { useUIStore } from '@/stores/ui.store'
import type { Category, SortOption } from '@/lib/types/database.types'

const CATEGORIES: { label: string; value: Category | null }[] = [
  { label: 'All', value: null },
  { label: 'Neighborhood', value: 'neighborhood' },
  { label: 'City', value: 'city' },
  { label: 'Condo', value: 'condo' },
]

const SORT_OPTIONS: { label: string; value: SortOption }[] = [
  { label: 'Newest', value: 'new' },
  { label: 'Most used', value: 'used' },
]

const NEIGHBORHOODS = ['Kirkland', 'Bellevue', 'Redmond', 'Seattle', 'Issaquah', 'Sammamish']

export default function FilterDrawer() {
  const { filterDrawerOpen, closeFilter } = useUIStore()
  const { category, neighborhood, sort, setCategory, setNeighborhood, setSort, clearAll } = useFilterStore()

  return (
    <>
      <div
        className={`drawer-overlay ${filterDrawerOpen ? 'open' : ''}`}
        onClick={closeFilter}
      />
      <div className={`filter-drawer ${filterDrawerOpen ? 'open' : ''}`}>
        <div className="fd-hdr">
          <div className="fd-title">Filters</div>
          <button className="fd-close" onClick={closeFilter}>✕</button>
        </div>

        <div className="fd-body">
          <div className="fd-sec">
            <div className="fd-lbl">Category</div>
            <div className="fd-pills">
              {CATEGORIES.map(c => (
                <button
                  key={String(c.value)}
                  className={`fp ${category === c.value ? 'on' : ''}`}
                  onClick={() => setCategory(c.value)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="fd-sec">
            <div className="fd-lbl">Location</div>
            <select
              className="fd-select"
              value={neighborhood ?? ''}
              onChange={e => setNeighborhood(e.target.value || null)}
            >
              <option value="">Anywhere</option>
              {NEIGHBORHOODS.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          <div className="fd-sec">
            <div className="fd-lbl">Sort</div>
            <div className="fd-pills">
              {SORT_OPTIONS.map(s => (
                <button
                  key={s.value}
                  className={`fp ${sort === s.value ? 'on' : ''}`}
                  onClick={() => setSort(s.value)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="fd-footer">
          <button className="fd-clear" onClick={() => { clearAll(); closeFilter() }}>
            Clear all filters
          </button>
        </div>
      </div>
    </>
  )
}
