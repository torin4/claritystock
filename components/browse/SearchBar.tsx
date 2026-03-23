'use client'
import { useFilterStore } from '@/stores/filter.store'
import { useUIStore } from '@/stores/ui.store'

export default function SearchBar({ hasActiveFilters }: { hasActiveFilters: boolean }) {
  const { search, setSearch } = useFilterStore()
  const { openFilter } = useUIStore()

  return (
    <div className="browse-search-bar">
      <div className="si-wrap">
        <span className="si-icon">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </span>
        <input
          className="si"
          placeholder="Search Library…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <button
        className={`filter-btn ${hasActiveFilters ? 'active' : ''}`}
        onClick={openFilter}
        title="Filters"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M2 3h12L9 9v4l-2-1V9L2 3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
        </svg>
        <div className={`filter-dot ${hasActiveFilters ? 'on' : ''}`} />
      </button>
    </div>
  )
}
