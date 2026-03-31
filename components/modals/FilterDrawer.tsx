'use client'
import { useEffect, useMemo, useState } from 'react'
import { useFilterStore } from '@/stores/filter.store'
import { useUIStore } from '@/stores/ui.store'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
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

interface FilterDrawerProps {
  /** Canonical + in-grid neighborhood labels for the location filter. */
  neighborhoodOptions: string[]
}

export default function FilterDrawer({ neighborhoodOptions }: FilterDrawerProps) {
  const { filterDrawerOpen, closeFilter } = useUIStore()
  const { category, neighborhood, photographerId, sort, setCategory, setNeighborhood, setPhotographerId, setSort, clearAll } = useFilterStore()

  const [photographers, setPhotographers] = useState<Array<{ id: string; name: string | null; initials: string | null }>>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const supabase = getSupabaseBrowserClient()
        const { data, error } = await supabase
          .from('users')
          .select('id, name, initials, role')
          .eq('role', 'photographer')
          .order('name', { ascending: true })
        if (cancelled) return
        if (error) {
          setPhotographers([])
          return
        }
        setPhotographers((data ?? []).map((r) => ({
          id: r.id as string,
          name: (r as { name: string | null }).name ?? null,
          initials: (r as { initials: string | null }).initials ?? null,
        })))
      } catch {
        if (!cancelled) setPhotographers([])
      }
    })()
    return () => { cancelled = true }
  }, [])

  const dedupedOptions = useMemo(() => {
    const byKey = new Map<string, string>()
    for (const n of neighborhoodOptions) {
      const t = n.trim()
      if (!t) continue
      byKey.set(t.toLowerCase(), t)
    }
    return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b))
  }, [neighborhoodOptions])

  const locationChoices = useMemo(() => {
    const current = neighborhood?.trim() || ''
    const set = new Set(dedupedOptions)
    if (current && !set.has(current)) {
      return [...dedupedOptions, current].sort((a, b) => a.localeCompare(b))
    }
    return dedupedOptions
  }, [dedupedOptions, neighborhood])

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
              {locationChoices.map(n => (
                <option key={n.toLowerCase()} value={n}>{n}</option>
              ))}
            </select>
          </div>

          <div className="fd-sec">
            <div className="fd-lbl">Photographer</div>
            <select
              className="fd-select"
              value={photographerId ?? ''}
              onChange={(e) => setPhotographerId(e.target.value || null)}
            >
              <option value="">Anyone</option>
              {photographers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name ?? p.initials ?? 'Photographer'}
                </option>
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
