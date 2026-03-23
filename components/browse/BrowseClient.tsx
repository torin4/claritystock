'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useFilterStore } from '@/stores/filter.store'
import { useUIStore } from '@/stores/ui.store'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import SearchBar from '@/components/browse/SearchBar'
import QuickFilterRow from '@/components/browse/QuickFilterRow'
import CollectionsStrip from '@/components/browse/CollectionsStrip'
import PhotoGrid from '@/components/photos/PhotoGrid'
import FilterDrawer from '@/components/modals/FilterDrawer'
import Lightbox from '@/components/modals/Lightbox'
import UploadModal from '@/components/modals/UploadModal'
import { PlusIcon } from '@/components/icons/PlusIcon'
import type { Photo, Collection } from '@/lib/types/database.types'

interface BrowseClientProps {
  initialPhotos: Photo[]
  collections: Collection[]
  userId: string
}

export default function BrowseClient({ initialPhotos, collections, userId }: BrowseClientProps) {
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos)
  const [loading, setLoading] = useState(false)
  const filters = useFilterStore()
  const { openUpload } = useUIStore()
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  const fetchPhotos = useCallback(async () => {
    setLoading(true)
    try {
      const supabase = getSupabaseBrowserClient()
      let query = supabase
        .from('photos')
        .select('*, photographer:users!photographer_id(id, name, initials), collection:collections!collection_id(id, name, category)')

      if (filters.search) {
        query = query.textSearch('fts', filters.search, { type: 'websearch' })
      }
      if (filters.category) query = query.eq('category', filters.category)
      if (filters.neighborhood) query = query.eq('neighborhood', filters.neighborhood)
      if (filters.collectionId) query = query.eq('collection_id', filters.collectionId)

      if (filters.sort === 'used') {
        query = query.order('downloads_count', { ascending: false })
      } else {
        query = query.order('created_at', { ascending: false })
      }

      // Quick filter: favorites
      if (filters.quickFilter === 'fav') {
        const { data: favs } = await supabase.from('favorites').select('photo_id').eq('user_id', userId)
        const ids = (favs ?? []).map((f: { photo_id: string }) => f.photo_id)
        query = query.in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
      }

      const { data } = await query.limit(120)

      // Fetch my downloads/favs for badges
      const [dlRes, favRes] = await Promise.all([
        supabase.from('downloads').select('photo_id').eq('downloaded_by', userId),
        supabase.from('favorites').select('photo_id').eq('user_id', userId),
      ])
      const dlIds = new Set((dlRes.data ?? []).map((d: { photo_id: string }) => d.photo_id))
      const favIds = new Set((favRes.data ?? []).map((f: { photo_id: string }) => f.photo_id))

      let result = (data ?? []).map((p: Record<string, unknown>) => ({
        ...p,
        is_downloaded_by_me: dlIds.has(p.id as string),
        is_favorited: favIds.has(p.id as string),
      })) as Photo[]

      if (filters.quickFilter === 'mine') result = result.filter(p => p.is_downloaded_by_me)
      if (filters.quickFilter === 'new') result = result.filter(p => !p.is_downloaded_by_me)

      setPhotos(result)
    } finally {
      setLoading(false)
    }
  }, [filters, userId])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(fetchPhotos, filters.search ? 400 : 0)
  }, [fetchPhotos, filters.search, filters.category, filters.neighborhood, filters.sort, filters.quickFilter, filters.collectionId])

  const handleFavoriteToggle = (photoId: string, val: boolean) => {
    setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, is_favorited: val } : p))
  }

  const handleDownload = (photoId: string) => {
    setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, is_downloaded_by_me: true } : p))
  }

  const hasActiveFilters = !!(filters.category || filters.neighborhood || (filters.search && filters.search.length > 0))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Page header */}
      <div className="ph">
        <div>
          <div className="ph-title">Library</div>
          <div className="ph-sub">{photos.length} photos in Library</div>
        </div>
        <button type="button" className="btn btn-primary btn-sm btn-with-icon" onClick={openUpload}>
          <PlusIcon size={15} />
          Add Photos
        </button>
      </div>

      {/* Search bar */}
      <SearchBar hasActiveFilters={hasActiveFilters} />

      {/* Quick filter chips */}
      <QuickFilterRow />

      {/* Collections strip */}
      <CollectionsStrip collections={collections} />

      {/* Photo grid */}
      <div style={{ flex: 1 }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-3)', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
            Loading...
          </div>
        ) : photos.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: '13px' }}>
            No photos found
          </div>
        ) : (
          <PhotoGrid
            photos={photos}
            userId={userId}
            onFavoriteToggle={handleFavoriteToggle}
            onDownload={handleDownload}
          />
        )}
      </div>

      {/* Filter drawer */}
      <FilterDrawer />

      {/* Lightbox */}
      <Lightbox photos={photos} userId={userId} onDownload={handleDownload} />

      {/* Upload modal */}
      <UploadModal userId={userId} onSuccess={fetchPhotos} />
    </div>
  )
}
