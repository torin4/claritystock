import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Category, QuickFilter, SortOption } from '@/lib/types/database.types'

interface FilterState {
  search: string
  category: Category | null
  neighborhood: string | null
  sort: SortOption
  quickFilter: QuickFilter
  collectionId: string | null
}

interface FilterActions {
  setSearch: (v: string) => void
  setCategory: (v: Category | null) => void
  setNeighborhood: (v: string | null) => void
  setSort: (v: SortOption) => void
  setQuickFilter: (v: QuickFilter) => void
  setCollection: (v: string | null) => void
  clearAll: () => void
}

const defaultFilters: FilterState = {
  search: '',
  category: null,
  neighborhood: null,
  sort: 'new',
  quickFilter: 'all',
  collectionId: null,
}

export const useFilterStore = create<FilterState & FilterActions>()(
  persist(
    (set) => ({
      ...defaultFilters,
      setSearch: (v) => set({ search: v }),
      setCategory: (v) => set({ category: v }),
      setNeighborhood: (v) => set({ neighborhood: v }),
      setSort: (v) => set({ sort: v }),
      setQuickFilter: (v) => set({ quickFilter: v }),
      setCollection: (v) => set({ collectionId: v }),
      clearAll: () => set(defaultFilters),
    }),
    { name: 'clarity-browse-filters', storage: typeof window !== 'undefined' ? undefined : { getItem: () => null, setItem: () => {}, removeItem: () => {} } }
  )
)
