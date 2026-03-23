'use client'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useFilterStore } from '@/stores/filter.store'
import { useUIStore } from '@/stores/ui.store'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { BROWSE_PAGE_SIZE, PHOTO_CARD_SELECT } from '@/lib/queries/photoSelects'
import { useSignedPhotoUrl } from '@/lib/hooks/useSignedPhotoUrl'
import { useInView } from '@/lib/hooks/useInView'
import SearchBar from '@/components/browse/SearchBar'
import QuickFilterRow from '@/components/browse/QuickFilterRow'
import PhotoGrid from '@/components/photos/PhotoGrid'
import FilterDrawer from '@/components/modals/FilterDrawer'
import Lightbox from '@/components/modals/Lightbox'
import UploadModal from '@/components/modals/UploadModal'
import { PlusIcon } from '@/components/icons/PlusIcon'
import { downloadPhotosZip, ZIP_DOWNLOAD_MAX_PHOTOS } from '@/lib/photos/zipDownload'
import type { Photo, Collection } from '@/lib/types/database.types'

interface BrowseClientProps {
  initialPhotos: Photo[]
  collections: Collection[]
  userId: string
}

const DEFAULT_FILTER_KEY = ['', '', '', 'new', 'all', ''].join('\0')

export default function BrowseClient({ initialPhotos, collections, userId }: BrowseClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos)
  const [browseMode, setBrowseMode] = useState<'photos' | 'collections'>('photos')
  const [loading, setLoading] = useState(false)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [zipBusy, setZipBusy] = useState(false)
  /** Avoid flashing "Loading…" on fast refetches (e.g. collection in/out). */
  const [showLoadingUi, setShowLoadingUi] = useState(false)
  const search = useFilterStore((s) => s.search)
  const category = useFilterStore((s) => s.category)
  const neighborhood = useFilterStore((s) => s.neighborhood)
  const sort = useFilterStore((s) => s.sort)
  const quickFilter = useFilterStore((s) => s.quickFilter)
  const collectionId = useFilterStore((s) => s.collectionId)
  const setCollection = useFilterStore((s) => s.setCollection)
  const openUpload = useUIStore((s) => s.openUpload)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const didRunInitialFetch = useRef(false)
  /** Avoid URL→store re-applying ?collection= after we optimistically cleared (router.replace is async). */
  const clearingCollectionFromUrlRef = useRef(false)
  /** Detect browser back removing ?collection= so we can clear the store without fighting tile drill. */
  const prevCollectionParamRef = useRef<string | null>(null)
  const fetchAbortRef = useRef<AbortController | null>(null)

  const filterKey = useMemo(
    () =>
      [
        search,
        category ?? '',
        neighborhood ?? '',
        sort,
        quickFilter,
        collectionId ?? '',
      ].join('\0'),
    [
      search,
      category,
      neighborhood,
      sort,
      quickFilter,
      collectionId,
    ],
  )

  const beginSelection = useCallback((id: string) => {
    setSelectionMode(true)
    setSelectedIds(prev => (prev.includes(id) ? prev : [...prev, id]))
  }, [])

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    )
  }, [])

  const exitSelection = useCallback(() => {
    setSelectionMode(false)
    setSelectedIds([])
  }, [])

  useEffect(() => {
    exitSelection()
  }, [filterKey, exitSelection])

  useEffect(() => {
    if (!selectionMode) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitSelection()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectionMode, exitSelection])

  const handleDownloadZip = async () => {
    if (!selectedIds.length || zipBusy) return
    setZipBusy(true)
    try {
      await downloadPhotosZip(selectedIds)
      setPhotos(prev =>
        prev.map(p => (selectedIds.includes(p.id) ? { ...p, is_downloaded_by_me: true } : p)),
      )
      exitSelection()
    } catch (e) {
      if (e instanceof Error && e.message === 'Cancelled') return
      console.error(e)
      alert(e instanceof Error ? e.message : 'Could not build ZIP')
    } finally {
      setZipBusy(false)
    }
  }

  const fetchPhotos = useCallback(async () => {
    fetchAbortRef.current?.abort()
    const ac = new AbortController()
    fetchAbortRef.current = ac
    setLoading(true)
    try {
      const supabase = getSupabaseBrowserClient()
      let query = supabase
        .from('photos')
        .select(PHOTO_CARD_SELECT)

      if (search) {
        query = query.textSearch('fts', search, { type: 'websearch' })
      }
      if (category) query = query.eq('category', category)
      if (neighborhood) query = query.eq('neighborhood', neighborhood)
      if (collectionId) query = query.eq('collection_id', collectionId)

      if (sort === 'used') {
        query = query.order('downloads_count', { ascending: false })
      } else {
        query = query.order('created_at', { ascending: false })
      }

      if (quickFilter === 'fav') {
        const { data: favs } = await supabase.from('favorites').select('photo_id').eq('user_id', userId)
        const ids = (favs ?? []).map((f: { photo_id: string }) => f.photo_id)
        query = query.in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
      }
      if (quickFilter === 'mine') {
        const { data: downloads } = await supabase.from('downloads').select('photo_id').eq('downloaded_by', userId)
        const ids = (downloads ?? []).map((d: { photo_id: string }) => d.photo_id)
        query = query.in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
      }
      if (quickFilter === 'new') {
        const { data: downloads } = await supabase.from('downloads').select('photo_id').eq('downloaded_by', userId)
        const ids = (downloads ?? []).map((d: { photo_id: string }) => d.photo_id)
        if (ids.length) query = query.not('id', 'in', `(${ids.join(',')})`)
      }

      const { data } = await query.limit(BROWSE_PAGE_SIZE)
      if (ac.signal.aborted) return
      const photoIds = (data ?? []).map((p: { id: string }) => p.id)
      if (!photoIds.length) {
        if (!ac.signal.aborted) setPhotos([])
        return
      }

      const [dlRes, favRes] = await Promise.all([
        quickFilter === 'mine'
          ? Promise.resolve({ data: photoIds.map((photo_id) => ({ photo_id })) })
          : supabase.from('downloads').select('photo_id').eq('downloaded_by', userId).in('photo_id', photoIds),
        quickFilter === 'fav'
          ? Promise.resolve({ data: photoIds.map((photo_id) => ({ photo_id })) })
          : supabase.from('favorites').select('photo_id').eq('user_id', userId).in('photo_id', photoIds),
      ])
      if (ac.signal.aborted) return
      const dlIds = new Set((dlRes.data ?? []).map((d: { photo_id: string }) => d.photo_id))
      const favIds = new Set((favRes.data ?? []).map((f: { photo_id: string }) => f.photo_id))

      let result = (data ?? []).map((p: Record<string, unknown>) => ({
        ...p,
        is_downloaded_by_me: dlIds.has(p.id as string),
        is_favorited: favIds.has(p.id as string),
      })) as Photo[]

      if (ac.signal.aborted) return
      setPhotos(result)
    } finally {
      if (fetchAbortRef.current === ac) {
        setLoading(false)
      }
    }
  }, [search, category, neighborhood, collectionId, sort, quickFilter, userId])

  useEffect(() => {
    if (!didRunInitialFetch.current) {
      didRunInitialFetch.current = true
      if (filterKey === DEFAULT_FILTER_KEY) return
    }
    if (browseMode === 'collections' && !collectionId) {
      fetchAbortRef.current?.abort()
      fetchAbortRef.current = null
      setLoading(false)
      return
    }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(fetchPhotos, search ? 400 : 0)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [fetchPhotos, filterKey, search, browseMode, collectionId])

  useEffect(() => {
    if (browseMode !== 'collections') return
    exitSelection()
  }, [browseMode, exitSelection])

  useEffect(() => {
    if (!loading) {
      setShowLoadingUi(false)
      return
    }
    const t = window.setTimeout(() => setShowLoadingUi(true), 120)
    return () => clearTimeout(t)
  }, [loading])

  useEffect(() => {
    const param = searchParams.get('collection')

    if (clearingCollectionFromUrlRef.current) {
      if (!param) {
        clearingCollectionFromUrlRef.current = false
        prevCollectionParamRef.current = null
      }
      return
    }

    if (param) {
      prevCollectionParamRef.current = param
      if (collectionId !== param) {
        setCollection(param)
        setBrowseMode('collections')
      }
      return
    }

    if (prevCollectionParamRef.current && collectionId) {
      setCollection(null)
    }
    prevCollectionParamRef.current = null
  }, [searchParams, collectionId, setCollection])

  const handleFavoriteToggle = useCallback((photoId: string, val: boolean) => {
    setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, is_favorited: val } : p))
  }, [])

  const handleDownload = useCallback((photoId: string) => {
    setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, is_downloaded_by_me: true } : p))
  }, [])

  const hasActiveFilters = !!(category || neighborhood || (search && search.length > 0))
  const filteredCollections = useMemo(() => {
    const q = search.trim().toLowerCase()
    return collections.filter((c) => {
      if (category && c.category !== category) return false
      if (q && !c.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [collections, category, search])
  const activeCollection = useMemo(
    () => collections.find((c) => c.id === collectionId) ?? null,
    [collections, collectionId],
  )
  const clearCollectionFilter = useCallback(() => {
    clearingCollectionFromUrlRef.current = true
    setCollection(null)
    setBrowseMode('collections')
    const next = new URLSearchParams(searchParams.toString())
    next.delete('collection')
    const href = next.toString() ? `${pathname}?${next.toString()}` : pathname
    router.replace(href, { scroll: false })
  }, [setCollection, searchParams, pathname, router])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Page header */}
      <div className="ph">
        <div>
          <div className="ph-title">Library</div>
          <div className="ph-sub">
            {browseMode === 'collections'
              ? `${filteredCollections.length} collection${filteredCollections.length !== 1 ? 's' : ''} in Library`
              : `${photos.length} photos in Library`}
          </div>
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

      <div className="browse-mode-row">
        <button
          type="button"
          className={`browse-mode-btn ${browseMode === 'photos' ? 'active' : ''}`}
          onClick={() => setBrowseMode('photos')}
        >
          Photos
        </button>
        <button
          type="button"
          className={`browse-mode-btn ${browseMode === 'collections' ? 'active' : ''}`}
          onClick={() => setBrowseMode('collections')}
        >
          Collections
        </button>
      </div>

      {/* Photo grid */}
      <div style={{ flex: 1, paddingBottom: selectionMode ? 88 : undefined }}>
        {browseMode === 'collections' && !collectionId ? (
          filteredCollections.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: '13px' }}>
              No collections found
            </div>
          ) : (
            <div className="coll-grid">
              {filteredCollections.map((c) => (
                <CollectionTile
                  key={c.id}
                  collection={c}
                  photos={c.photos ?? []}
                  active={collectionId === c.id}
                  onClick={() => {
                    setCollection(c.id)
                    setBrowseMode('collections')
                    const next = new URLSearchParams(searchParams.toString())
                    next.set('collection', c.id)
                    const href = next.toString() ? `${pathname}?${next.toString()}` : pathname
                    router.replace(href, { scroll: false })
                  }}
                />
              ))}
            </div>
          )
        ) : loading ? (
          <>
            {collectionId && (
              <div className="browse-coll-hdr" aria-label={`Viewing collection ${activeCollection?.name ?? 'Collection'}`}>
                <button
                  type="button"
                  className="browse-coll-back"
                  onClick={clearCollectionFilter}
                  aria-label="Back to all collections"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M10 3.5L5.5 8L10 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <div className="browse-coll-title">{activeCollection?.name ?? 'Collection'}</div>
              </div>
            )}
            {showLoadingUi ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-3)', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                Loading...
              </div>
            ) : (
              <div style={{ minHeight: 220 }} aria-busy="true" aria-label="Loading photos" />
            )}
          </>
        ) : photos.length === 0 ? (
          <>
            {collectionId && (
              <div className="browse-coll-hdr" aria-label={`Viewing collection ${activeCollection?.name ?? 'Collection'}`}>
                <button
                  type="button"
                  className="browse-coll-back"
                  onClick={clearCollectionFilter}
                  aria-label="Back to all collections"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M10 3.5L5.5 8L10 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <div className="browse-coll-title">{activeCollection?.name ?? 'Collection'}</div>
              </div>
            )}
            <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: '13px' }}>
              No photos found
            </div>
          </>
        ) : (
          <>
            {collectionId && (
              <div className="browse-coll-hdr" aria-label={`Viewing collection ${activeCollection?.name ?? 'Collection'}`}>
                <button
                  type="button"
                  className="browse-coll-back"
                  onClick={clearCollectionFilter}
                  aria-label="Back to all collections"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M10 3.5L5.5 8L10 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <div className="browse-coll-title">{activeCollection?.name ?? 'Collection'}</div>
              </div>
            )}
            <PhotoGrid
              photos={photos}
              userId={userId}
              onFavoriteToggle={handleFavoriteToggle}
              onDownload={handleDownload}
              selectable
              selectionMode={selectionMode}
              selectedIds={selectedIds}
              onBeginSelection={beginSelection}
              onToggleSelected={toggleSelected}
            />
          </>
        )}
      </div>

      {(browseMode === 'photos' || (browseMode === 'collections' && !!collectionId)) && selectionMode && (
        <div className="mp-select-bar">
          <span className="mp-select-bar-count">{selectedIds.length} selected</span>
          <span className="mp-select-bar-hint">
            Long-press or right-click to add · tap to toggle · ZIP up to {ZIP_DOWNLOAD_MAX_PHOTOS} photos
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={exitSelection}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!selectedIds.length || zipBusy}
            title={selectedIds.length > ZIP_DOWNLOAD_MAX_PHOTOS ? `Max ${ZIP_DOWNLOAD_MAX_PHOTOS} photos per ZIP` : undefined}
            onClick={handleDownloadZip}
          >
            {zipBusy ? 'Zipping…' : 'Download ZIP'}
          </button>
        </div>
      )}

      {/* Filter drawer */}
      <FilterDrawer />

      {/* Lightbox */}
      <Lightbox photos={photos} userId={userId} onDownload={handleDownload} />

      {/* Upload modal */}
      <UploadModal userId={userId} onSuccess={fetchPhotos} />
    </div>
  )
}

function MosaicCell({
  photo,
}: {
  photo: { storage_path: string | null; thumbnail_path: string | null } | undefined
}) {
  const cellRef = useRef<HTMLDivElement>(null)
  const inView = useInView(cellRef, { rootMargin: '120px' })
  const path = photo?.thumbnail_path ?? photo?.storage_path ?? null
  const url = useSignedPhotoUrl(path, { enabled: inView })
  return (
    <div ref={cellRef} className="coll-mosaic-cell">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', background: 'var(--surface-2)' }} />
      )}
    </div>
  )
}

function CollectionTile({
  collection,
  photos,
  active,
  onClick,
}: {
  collection: Collection
  photos: Array<{ storage_path: string | null; thumbnail_path: string | null }>
  active?: boolean
  onClick: () => void
}) {
  const topPhotos = photos.slice(0, 3)
  const single = photos.length === 1

  return (
    <div className={`coll-tile${active ? ' active' : ''}`} onClick={onClick}>
      <div className={`coll-mosaic${single ? ' coll-mosaic--single' : ''}`}>
        {single ? (
          <MosaicCell photo={topPhotos[0]} />
        ) : (
          [0, 1, 2].map(i => (
            <MosaicCell key={i} photo={topPhotos[i]} />
          ))
        )}
      </div>
      <div className="coll-ov">
        <div className="coll-name">{collection.name}</div>
        <div className="coll-count">{collection.photo_count ?? 0} photo{(collection.photo_count ?? 0) !== 1 ? 's' : ''}</div>
      </div>
    </div>
  )
}
