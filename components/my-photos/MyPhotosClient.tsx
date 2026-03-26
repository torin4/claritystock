'use client'
import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useUIStore } from '@/stores/ui.store'
import { useSignedPhotoUrl } from '@/lib/hooks/useSignedPhotoUrl'
import PhotoGrid from '@/components/photos/PhotoGrid'
import EditModal from '@/components/modals/EditModal'
import Lightbox from '@/components/modals/Lightbox'
import UploadModal from '@/components/modals/UploadModal'
import CreateCollectionModal from '@/components/my-photos/CreateCollectionModal'
import { PlusIcon } from '@/components/icons/PlusIcon'
import { PhotoAddIcon } from '@/components/icons/PhotoAddIcon'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { devError } from '@/lib/utils/devLog'
import { deleteCollection, renameCollection } from '@/lib/actions/collections.actions'
import { deletePhotos, updatePhotosCollectionIds, updatePhotosCategoryNeighborhood } from '@/lib/actions/photos.actions'
import { downloadPhotosZip, ZIP_DOWNLOAD_MAX_PHOTOS } from '@/lib/photos/zipDownload'
import { removeMyDownloads } from '@/lib/actions/downloads.actions'
import { MY_LIBRARY_PAGE_SIZE, PHOTO_MY_LIBRARY_CARD_SELECT } from '@/lib/queries/photoSelects'
import { getMyDownloadedPhotos } from '@/lib/queries/photos.queries'
import { useInView } from '@/lib/hooks/useInView'
import type { Photo, Collection, User, Category } from '@/lib/types/database.types'
import LocationField from '@/components/neighborhoods/LocationField'
import { getNeighborhoodCanonicalLabels } from '@/lib/actions/neighborhoods.actions'

type CollectionSummary = Collection

type LibraryPhotographer = Pick<User, 'id' | 'name' | 'initials' | 'avatar_url'>

interface Props {
  initialPhotos: Photo[]
  initialTotalPhotos: number
  collections: CollectionSummary[]
  userId: string
  pageSize: number
  /** Merged onto each library photo (avoids per-row photographer join). */
  libraryPhotographer: LibraryPhotographer | null
  /** Admin: view/edit another user’s library; hides “My downloads” and uses proxy collection actions. */
  adminMode?: boolean
}

export default function MyPhotosClient({
  initialPhotos,
  initialTotalPhotos,
  collections,
  userId,
  pageSize,
  libraryPhotographer,
  adminMode = false,
}: Props) {
  const router = useRouter()
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos)
  const [photoTotal, setPhotoTotal] = useState(initialTotalPhotos)
  const [photosStatus, setPhotosStatus] = useState<'idle' | 'loading' | 'ready'>('ready')
  const [loadingMorePhotos, setLoadingMorePhotos] = useState(false)
  const [downloadedPhotos, setDownloadedPhotos] = useState<Photo[]>([])
  /** Fetched only when the My downloads tab is opened (keeps Collections / All photos fast). */
  const [downloadsStatus, setDownloadsStatus] = useState<'idle' | 'loading' | 'done'>('idle')
  const [localCollections, setLocalCollections] = useState(collections)
  const [tab, setTab] = useState<'collections' | 'photos' | 'downloads'>('photos')
  const [search, setSearch] = useState('')
  const [drillColl, setDrillColl] = useState<CollectionSummary | null>(null)
  const [deletingColl, setDeletingColl] = useState(false)
  const [renamingColl, setRenamingColl] = useState(false)
  const [createCollOpen, setCreateCollOpen] = useState(false)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [zipBusy, setZipBusy] = useState(false)
  const [removeDownloadsBusy, setRemoveDownloadsBusy] = useState(false)
  const [bulkCollBusy, setBulkCollBusy] = useState(false)
  const [bulkAssignCollId, setBulkAssignCollId] = useState('')
  const [bulkEditCategory, setBulkEditCategory] = useState<'' | Category>('')
  const [bulkEditNeighborhood, setBulkEditNeighborhood] = useState('')
  const [bulkEditBusy, setBulkEditBusy] = useState(false)
  const [bulkEditError, setBulkEditError] = useState<string | null>(null)
  const [locationLabels, setLocationLabels] = useState<string[]>([])
  const downloadsLoadedRef = useRef(false)
  const photosRequestSeqRef = useRef(0)
  const { openUpload, openEdit } = useUIStore()
  const libraryPageSize = pageSize || MY_LIBRARY_PAGE_SIZE
  const searchTerm = search.trim()
  const defaultPhotosViewActive = tab === 'photos' && !drillColl && !searchTerm
  const hasMorePhotos = photos.length < photoTotal

  useEffect(() => {
    if (!selectionMode || locationLabels.length) return
    getNeighborhoodCanonicalLabels().then(setLocationLabels).catch(() => {})
  }, [selectionMode, locationLabels.length])

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
    setBulkEditCategory('')
    setBulkEditNeighborhood('')
    setBulkEditError(null)
  }, [])

  useEffect(() => {
    exitSelection()
  }, [drillColl?.id, searchTerm, tab, exitSelection])

  useEffect(() => {
    if (adminMode && tab === 'downloads') setTab('photos')
  }, [adminMode, tab])

  useEffect(() => {
    if (!selectionMode) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitSelection()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectionMode, exitSelection])

  const handleBulkEditApply = async () => {
    if (!selectedIds.length) return
    const applyCat = bulkEditCategory !== ''
    const applyNeigh = bulkEditNeighborhood.trim().length > 0
    if (!applyCat && !applyNeigh) { setBulkEditError('Choose a category or enter a neighborhood.'); return }
    setBulkEditBusy(true)
    setBulkEditError(null)
    try {
      await updatePhotosCategoryNeighborhood(selectedIds, {
        ...(applyCat ? { category: bulkEditCategory } : {}),
        ...(applyNeigh ? { neighborhood: bulkEditNeighborhood.trim() } : {}),
        photographerId: userId,
      })
      setBulkEditCategory('')
      setBulkEditNeighborhood('')
      await refresh()
      router.refresh()
    } catch (e) {
      setBulkEditError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBulkEditBusy(false)
    }
  }

  const handleDownloadZip = async () => {
    if (!selectedIds.length || zipBusy) return
    setZipBusy(true)
    try {
      await downloadPhotosZip(selectedIds)
      const mark = (p: Photo) =>
        selectedIds.includes(p.id) ? { ...p, is_downloaded_by_me: true as const } : p
      setPhotos(prev => prev.map(mark))
      setDownloadedPhotos(prev => prev.map(mark))
      exitSelection()
      router.refresh()
    } catch (e) {
      if (e instanceof Error && e.message === 'Cancelled') return
      devError(e)
      alert(e instanceof Error ? e.message : 'Could not build ZIP')
    } finally {
      setZipBusy(false)
    }
  }

  const handleRemoveFromDownloads = async () => {
    if (!selectedIds.length || removeDownloadsBusy) return
    const ids = [...selectedIds]
    if (
      !confirm(
        `Remove ${ids.length} photo${ids.length === 1 ? '' : 's'} from My downloads? They stay in the Library for everyone. Browse will no longer show the downloaded checkmark for you.`,
      )
    ) {
      return
    }
    setRemoveDownloadsBusy(true)
    try {
      await removeMyDownloads(ids)
      exitSelection()
      setPhotos(prev =>
        prev.map(p => (ids.includes(p.id) ? { ...p, is_downloaded_by_me: false } : p)),
      )
      setDownloadedPhotos(prev => prev.filter(p => !ids.includes(p.id)))
      router.refresh()
    } catch (e) {
      devError(e)
      alert(
        e instanceof Error
          ? e.message
          : 'Could not remove downloads. Run latest DB migration (remove_my_downloads).',
      )
    } finally {
      setRemoveDownloadsBusy(false)
    }
  }

  const selectedIdsWithCollection = useMemo(() => {
    if (!selectedIds.length) return [] as string[]
    return selectedIds.filter(id => {
      const p = photos.find(x => x.id === id)
      return !!p?.collection_id
    })
  }, [selectedIds, photos])

  const selectedIdsInDrillCollection = useMemo(() => {
    if (!drillColl || !selectedIds.length) return [] as string[]
    return selectedIds.filter(id => {
      const p = photos.find(x => x.id === id)
      return p?.collection_id === drillColl.id
    })
  }, [selectedIds, photos, drillColl])

  useEffect(() => {
    if (!selectionMode) setBulkAssignCollId('')
  }, [selectionMode])

  useEffect(() => {
    if (tab === 'photos' || drillColl) return
    photosRequestSeqRef.current += 1
    setPhotosStatus('ready')
    setLoadingMorePhotos(false)
  }, [drillColl, tab])

  const handleBulkAddToCollection = async () => {
    if (!selectedIds.length || !bulkAssignCollId || bulkCollBusy) return
    setBulkCollBusy(true)
    try {
      const collOpts = adminMode ? { photographerId: userId } : undefined
      const { updated } = await updatePhotosCollectionIds(selectedIds, bulkAssignCollId, collOpts)
      if (updated < selectedIds.length) {
        alert(
          `Updated ${updated} of ${selectedIds.length} photo(s). ${
            adminMode ? 'Some photos could not be updated.' : 'You can only assign photos you uploaded.'
          }`,
        )
      }
      setPhotos(prev =>
        prev.map(p =>
          selectedIds.includes(p.id) && p.photographer_id === userId
            ? { ...p, collection_id: bulkAssignCollId }
            : p,
        ),
      )
      useUIStore.getState().bumpSidebarCollections()
      exitSelection()
      await refresh()
      router.refresh()
    } catch (e) {
      devError(e)
      alert(e instanceof Error ? e.message : 'Could not update collection')
    } finally {
      setBulkCollBusy(false)
    }
  }

  const handleBulkRemoveFromCollection = async () => {
    const ids = drillColl ? selectedIdsInDrillCollection : selectedIdsWithCollection
    if (!ids.length || bulkCollBusy) return
    const msg = drillColl
      ? `Remove ${ids.length} photo${ids.length === 1 ? '' : 's'} from “${drillColl.name}”? They stay in ${adminMode ? 'this photographer’s' : 'your'} library.`
      : `Remove ${ids.length} photo${ids.length === 1 ? '' : 's'} from their collection(s)? They stay in ${adminMode ? 'this photographer’s' : 'your'} library.`
    if (!confirm(msg)) return
    setBulkCollBusy(true)
    try {
      await updatePhotosCollectionIds(ids, null, adminMode ? { photographerId: userId } : undefined)
      setPhotos(prev =>
        prev.map(p => (ids.includes(p.id) ? { ...p, collection_id: null } : p)),
      )
      useUIStore.getState().bumpSidebarCollections()
      exitSelection()
      await refresh()
      router.refresh()
    } catch (e) {
      devError(e)
      alert(e instanceof Error ? e.message : 'Could not remove from collection')
    } finally {
      setBulkCollBusy(false)
    }
  }

  const handleBulkDelete = async () => {
    if (!selectedIds.length) return
    if (tab === 'downloads') {
      await handleRemoveFromDownloads()
      return
    }
    const sourceList =
      drillColl || tab === 'photos'
        ? filteredPhotos
        : photos
    const ownedIds = selectedIds.filter(sid => {
      const p = sourceList.find(x => x.id === sid)
      return p?.photographer_id === userId
    })
    if (!ownedIds.length) {
      alert(
        adminMode
          ? 'None of the selected photos belong to this photographer.'
          : 'None of the selected photos are yours to remove from the library. You can only delete photos you uploaded.',
      )
      return
    }
    if (ownedIds.length < selectedIds.length) {
      if (
        !confirm(
          adminMode
            ? `Only ${ownedIds.length} selected photo${ownedIds.length === 1 ? '' : 's'} belong to this photographer and will be removed from the library. Continue?`
            : `Only ${ownedIds.length} selected photo${ownedIds.length === 1 ? '' : 's'} ${ownedIds.length === 1 ? 'is' : 'are'} yours and will be removed from the library. Continue?`,
        )
      ) {
        return
      }
    } else {
      if (
        !confirm(
          `Remove ${ownedIds.length} photo${ownedIds.length === 1 ? '' : 's'} from the library? This cannot be undone.`,
        )
      ) {
        return
      }
    }
    setBulkDeleting(true)
    try {
      await deletePhotos(ownedIds)
      useUIStore.getState().bumpSidebarCollections()
      exitSelection()
      setDownloadedPhotos(prev => prev.filter(p => !ownedIds.includes(p.id)))
      setPhotos(prev => prev.filter(p => !ownedIds.includes(p.id)))
      await refresh()
      router.refresh()
    } catch (e) {
      devError(e)
      alert(e instanceof Error ? e.message : 'Could not delete photos')
    } finally {
      setBulkDeleting(false)
    }
  }

  useEffect(() => {
    setLocalCollections(collections)
  }, [collections])

  useEffect(() => {
    if (adminMode) return
    if (tab !== 'downloads') return
    if (downloadsLoadedRef.current) return

    downloadsLoadedRef.current = true
    let cancelled = false
    setDownloadsStatus('loading')

    const supabase = getSupabaseBrowserClient()
    getMyDownloadedPhotos(supabase, userId)
      .then(data => {
        if (cancelled) return
        setDownloadedPhotos(data)
      })
      .catch(err => {
        devError(err)
      })
      .finally(() => {
        if (cancelled) {
          setDownloadsStatus('idle')
          downloadsLoadedRef.current = false
        } else {
          setDownloadsStatus('done')
        }
      })

    return () => {
      cancelled = true
    }
  }, [tab, userId, adminMode])

  const mergeLibraryRows = useCallback(
    (rows: Photo[]) =>
      libraryPhotographer
        ? rows.map(p => ({ ...p, photographer: libraryPhotographer }))
        : rows,
    [libraryPhotographer],
  )

  const fetchPhotosPage = useCallback(async (opts?: { offset?: number; append?: boolean }) => {
    const offset = opts?.offset ?? 0
    const append = opts?.append === true
    const requestId = ++photosRequestSeqRef.current

    if (append) {
      setLoadingMorePhotos(true)
    } else {
      setPhotosStatus('loading')
    }

    try {
      const supabase = getSupabaseBrowserClient()
      let query = supabase
        .from('photos')
        .select(PHOTO_MY_LIBRARY_CARD_SELECT, { count: 'exact' })
        .eq('photographer_id', userId)

      if (drillColl?.id) {
        query = query.eq('collection_id', drillColl.id)
      }
      if (searchTerm) {
        query = query.textSearch('fts', searchTerm, { type: 'websearch' })
      }

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + libraryPageSize - 1)

      if (error) throw error
      if (requestId !== photosRequestSeqRef.current) return

      const nextPhotos = mergeLibraryRows((data as Photo[]) ?? []) as Photo[]
      setPhotoTotal(count ?? nextPhotos.length)
      setPhotos((prev) => (append ? [...prev, ...nextPhotos] : nextPhotos))
    } catch (e) {
      if (requestId !== photosRequestSeqRef.current) return
      devError(e)
      alert(e instanceof Error ? e.message : append ? 'Could not load more photos' : 'Could not load photos')
    } finally {
      if (requestId !== photosRequestSeqRef.current) return
      setPhotosStatus('ready')
      setLoadingMorePhotos(false)
    }
  }, [drillColl?.id, libraryPageSize, mergeLibraryRows, searchTerm, userId])

  const refresh = async () => {
    await fetchPhotosPage({ offset: 0 })
  }

  const loadMorePhotos = async () => {
    if (loadingMorePhotos || !hasMorePhotos) return
    await fetchPhotosPage({ offset: photos.length, append: true })
  }

  const filteredPhotos = photos

  const filteredDownloadedPhotos = useMemo(() => {
    if (!searchTerm) return downloadedPhotos
    const q = searchTerm.toLowerCase()
    return downloadedPhotos.filter(
      p =>
        p.title.toLowerCase().includes(q) ||
        (p.neighborhood ?? '').toLowerCase().includes(q) ||
        (p.photographer?.name ?? '').toLowerCase().includes(q),
    )
  }, [downloadedPhotos, searchTerm])

  const lightboxPhotos = useMemo(() => {
    if (!drillColl && tab === 'downloads') return filteredDownloadedPhotos
    return filteredPhotos
  }, [drillColl, tab, filteredDownloadedPhotos, filteredPhotos])

  /** IDs currently shown in the grid (for “select all” — paginated library = loaded rows only). */
  const visiblePhotoIdsForSelection = useMemo(() => {
    if (!drillColl && tab === 'downloads') {
      return filteredDownloadedPhotos.map(p => p.id)
    }
    if (tab === 'photos' || drillColl) {
      return filteredPhotos.map(p => p.id)
    }
    return [] as string[]
  }, [drillColl, tab, filteredDownloadedPhotos, filteredPhotos])

  const selectAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      const vis = visiblePhotoIdsForSelection
      if (!vis.length) return prev
      const every = vis.every(id => prev.includes(id))
      if (every) return prev.filter(id => !vis.includes(id))
      return Array.from(new Set([...prev, ...vis]))
    })
  }, [visiblePhotoIdsForSelection])

  const allVisibleSelected = useMemo(
    () =>
      visiblePhotoIdsForSelection.length > 0 &&
      visiblePhotoIdsForSelection.every(id => selectedIds.includes(id)),
    [visiblePhotoIdsForSelection, selectedIds],
  )

  const selectAllVisibleTitle =
    hasMorePhotos && (tab === 'photos' || drillColl)
      ? 'Selects every photo currently shown. Use “Load more” if you need additional pages in your library first.'
      : undefined

  useEffect(() => {
    if (!defaultPhotosViewActive) return
    photosRequestSeqRef.current += 1
    setPhotos(initialPhotos)
    setPhotoTotal(initialTotalPhotos)
    setPhotosStatus('ready')
    setLoadingMorePhotos(false)
  }, [defaultPhotosViewActive, initialPhotos, initialTotalPhotos])

  useEffect(() => {
    if (tab !== 'photos' && !drillColl) return
    if (defaultPhotosViewActive) return

    const debounceMs = searchTerm ? 250 : 0
    const timeout = window.setTimeout(() => {
      void fetchPhotosPage({ offset: 0 })
    }, debounceMs)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [defaultPhotosViewActive, drillColl, fetchPhotosPage, searchTerm, tab])

  const collectionPhotoCounts = useMemo(
    () => new Map(localCollections.map((collection) => [collection.id, collection.photo_count ?? 0])),
    [localCollections],
  )

  const activePhotoCount = drillColl ? (collectionPhotoCounts.get(drillColl.id) ?? 0) : photoTotal

  const noopFavoriteToggle = useCallback(() => {}, [])

  const pageTitle = adminMode
    ? (libraryPhotographer?.name ? `${libraryPhotographer.name}'s library` : 'Photographer library')
    : 'My Photos'

  const handleFavoriteToggleDownloads = useCallback((photoId: string, val: boolean) => {
    setDownloadedPhotos(prev => prev.map(p => (p.id === photoId ? { ...p, is_favorited: val } : p)))
  }, [])

  const handleDownloadRecorded = useCallback((photoId: string) => {
    setPhotos(prev => prev.map(p => (p.id === photoId ? { ...p, is_downloaded_by_me: true } : p)))
    setDownloadedPhotos(prev => {
      const exists = prev.some(p => p.id === photoId)
      if (exists) {
        return prev.map(p => (p.id === photoId ? { ...p, is_downloaded_by_me: true } : p))
      }
      return prev
    })
    router.refresh()
  }, [router])

  const handleDeleteCollection = async () => {
    if (!drillColl) return
    if (!confirm(
      adminMode
        ? `Delete “${drillColl.name}”? Photos stay in this photographer’s library; they’ll just be removed from this collection.`
        : `Delete “${drillColl.name}”? Photos stay in your library; they’ll just be removed from this collection.`,
    )) return
    setDeletingColl(true)
    try {
      await deleteCollection(drillColl.id)
      useUIStore.getState().bumpSidebarCollections()
      setLocalCollections(prev => prev.filter(c => c.id !== drillColl.id))
      setDrillColl(null)
      setTab('collections')
      router.refresh()
    } catch (e) {
      devError(e)
      alert(e instanceof Error ? e.message : 'Could not delete collection')
    } finally {
      setDeletingColl(false)
    }
  }

  const handleRenameCollection = async () => {
    if (!drillColl || renamingColl) return
    const next = prompt('Rename collection', drillColl.name)
    if (next == null) return
    const trimmed = next.trim()
    if (!trimmed) {
      alert('Collection name is required')
      return
    }
    if (trimmed === drillColl.name) return

    setRenamingColl(true)
    try {
      await renameCollection(drillColl.id, trimmed)
      setDrillColl(prev => (prev ? { ...prev, name: trimmed } : prev))
      setLocalCollections(prev =>
        prev.map(c => (c.id === drillColl.id ? { ...c, name: trimmed } : c)),
      )
      useUIStore.getState().bumpSidebarCollections()
      router.refresh()
    } catch (e) {
      devError(e)
      alert(e instanceof Error ? e.message : 'Could not rename collection')
    } finally {
      setRenamingColl(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Page header */}
      <div className="ph">
        <div>
          <div className="ph-title">{pageTitle}</div>
          <div className="ph-sub">
            {!drillColl && tab === 'downloads' ? (
              downloadsStatus === 'loading'
                ? 'Loading downloads…'
                : `${downloadedPhotos.length} photo${downloadedPhotos.length !== 1 ? 's' : ''} you've downloaded`
            ) : (
              <>
                {photoTotal} in Library
                {drillColl && (
                  <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                    Adds go to “{drillColl.name}”
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        {(!drillColl && tab === 'downloads') ? null : (
          <button
            type="button"
            className="btn btn-primary btn-sm btn-with-icon ph-header-upload-btn"
            onClick={() => openUpload()}
            title={drillColl ? 'Add to collection' : 'Add photos'}
          >
            <span className="flex md:hidden items-center justify-center">
              <PhotoAddIcon size={18} />
              <span className="sr-only">{drillColl ? 'Add to collection' : 'Add photos'}</span>
            </span>
            <span className="hidden md:inline-flex items-center gap-1.5">
              <PlusIcon size={15} />
              {drillColl ? 'Add to collection' : 'Add Photos'}
            </span>
          </button>
        )}
      </div>

      {/* Tabs — only show when not drilling into a collection */}
      {!drillColl && (
        <div className="my-tabs">
          <button
            className={`my-tab ${tab === 'photos' ? 'active' : ''}`}
            onClick={() => setTab('photos')}
          >All photos</button>
          <button
            className={`my-tab ${tab === 'collections' ? 'active' : ''}`}
            onClick={() => setTab('collections')}
          >Collections</button>
          {!adminMode && (
            <button
              className={`my-tab ${tab === 'downloads' ? 'active' : ''}`}
              onClick={() => setTab('downloads')}
            >My downloads</button>
          )}
        </div>
      )}

      {/* Collections view */}
      {tab === 'collections' && !drillColl && (
        <div>
          <div className="mp-toolbar" style={{ justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
              {localCollections.length} collection{localCollections.length !== 1 ? 's' : ''}
            </span>
            <button
              type="button"
              className="coll-create-text"
              onClick={() => setCreateCollOpen(true)}
            >
              + Create collection
            </button>
          </div>
          {localCollections.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              No collections yet. Create one with <strong style={{ color: 'var(--text-2)' }}>+ Create collection</strong>, or add one when you add photos{adminMode ? ' for this photographer' : ''}.
            </div>
          ) : (
            <div className="coll-grid">
              {localCollections.map(coll => (
                <CollectionTile
                  key={coll.id}
                  collection={coll}
                  onClick={() => { setDrillColl(coll); setTab('photos') }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Photos view */}
      {(tab === 'photos' || drillColl) && (
        <div style={{ paddingBottom: selectionMode ? 88 : undefined }}>
          {/* Drill header */}
          {drillColl && (
            <div
              className="browse-coll-hdr my-photos-coll-hdr"
              aria-label={`Collection ${drillColl.name}`}
            >
              <div className="browse-coll-lead">
                <button
                  type="button"
                  className="browse-coll-back"
                  onClick={() => { setDrillColl(null); setTab('collections') }}
                  aria-label="Back to all collections"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M10 3.5L5.5 8L10 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <div style={{ minWidth: 0 }}>
                  <div className="browse-coll-title">{drillColl.name}</div>
                  <div className="browse-coll-sub">
                    {searchTerm
                      ? `${photoTotal} match${photoTotal === 1 ? '' : 'es'}`
                      : `${activePhotoCount} photo${activePhotoCount !== 1 ? 's' : ''}`}
                  </div>
                </div>
              </div>
              <div className="drill-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm btn-with-icon ph-header-upload-btn"
                  onClick={() => openUpload()}
                  title="Add photos"
                >
                  <span className="flex md:hidden items-center justify-center">
                    <PhotoAddIcon size={18} />
                    <span className="sr-only">Add photos</span>
                  </span>
                  <span className="hidden md:inline-flex items-center gap-1.5">
                    <PlusIcon size={15} />
                    Add photos
                  </span>
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={renamingColl || deletingColl}
                  onClick={handleRenameCollection}
                >
                  {renamingColl ? 'Renaming…' : 'Rename'}
                </button>
                <button
                  type="button"
                  className="btn-del-sm"
                  disabled={deletingColl || renamingColl}
                  onClick={handleDeleteCollection}
                >
                  {deletingColl ? 'Deleting…' : 'Delete collection'}
                </button>
              </div>
            </div>
          )}

          {/* Toolbar */}
          <div className="mp-toolbar">
            <div className="si-wrap" style={{ maxWidth: 280 }}>
              <span className="si-icon">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </span>
              <input
                className="si"
                placeholder={adminMode ? 'Search photos…' : 'Search your photos…'}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginLeft: 'auto' }}>
              {photosStatus === 'loading' ? '…' : `${photoTotal} photos`}
            </span>
          </div>

          {/* Grid or empty states */}
          {photosStatus === 'loading' ? (
            <div className="mp-empty-block" style={{ paddingTop: 48 }}>
              <p className="mp-empty-sub" style={{ margin: 0 }}>Loading photos…</p>
            </div>
          ) : filteredPhotos.length === 0 ? (
            drillColl ? (
              searchTerm ? (
                <div className="mp-empty-block">
                  <h3 className="mp-empty-title">No matches in this collection</h3>
                  <p className="mp-empty-sub">
                    Nothing matches “{searchTerm}” in “{drillColl.name}”. Try a different search or clear it to see all photos here.
                  </p>
                  <div className="mp-empty-actions">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSearch('')}>
                      Clear search
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mp-empty-block">
                  <h3 className="mp-empty-title">This collection is empty</h3>
                  <p className="mp-empty-sub">
                    Add photos here — they’ll be saved to <strong style={{ color: 'var(--text-2)' }}>{drillColl.name}</strong> automatically. You can still change the collection for each photo before publishing.
                  </p>
                  <div className="mp-empty-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm btn-with-icon ph-header-upload-btn"
                      onClick={() => openUpload()}
                      title="Add photos to this collection"
                    >
                      <span className="flex md:hidden items-center justify-center">
                        <PhotoAddIcon size={18} />
                        <span className="sr-only">Add photos to this collection</span>
                      </span>
                      <span className="hidden md:inline-flex items-center gap-1.5">
                        <PlusIcon size={15} />
                        Add photos to this collection
                      </span>
                    </button>
                  </div>
                </div>
              )
            ) : (
              searchTerm ? (
                <div className="mp-empty-block">
                  <h3 className="mp-empty-title">No photos match your search</h3>
                  <p className="mp-empty-sub">Try another term or clear the search box.</p>
                  <div className="mp-empty-actions">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSearch('')}>
                      Clear search
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mp-empty-block">
                  <h3 className="mp-empty-title">{adminMode ? 'No photos in this library yet' : 'No photos in your library yet'}</h3>
                  <p className="mp-empty-sub">{adminMode ? 'Upload photos for this photographer to see them here.' : 'Upload photos to see them here and organize them into collections.'}</p>
                  <div className="mp-empty-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm btn-with-icon ph-header-upload-btn"
                      onClick={() => openUpload()}
                      title="Add photos"
                    >
                      <span className="flex md:hidden items-center justify-center">
                        <PhotoAddIcon size={18} />
                        <span className="sr-only">Add photos</span>
                      </span>
                      <span className="hidden md:inline-flex items-center gap-1.5">
                        <PlusIcon size={15} />
                        Add Photos
                      </span>
                    </button>
                  </div>
                </div>
              )
            )
          ) : (
            <PhotoGrid
              photos={filteredPhotos}
              userId={userId}
              onFavoriteToggle={noopFavoriteToggle}
              onDownload={handleDownloadRecorded}
              showEdit
              onEdit={openEdit}
              selectable
              selectionMode={selectionMode}
              selectedIds={selectedIds}
              onBeginSelection={beginSelection}
              onToggleSelected={toggleSelected}
            />
          )}

          {photosStatus !== 'loading' && filteredPhotos.length > 0 && hasMorePhotos && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 20px 20px' }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={loadingMorePhotos}
                onClick={() => void loadMorePhotos()}
              >
                {loadingMorePhotos ? 'Loading…' : `Load ${Math.min(libraryPageSize, photoTotal - photos.length)} more`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* My downloads tab */}
      {tab === 'downloads' && !drillColl && (
        <div style={{ paddingBottom: selectionMode ? 88 : undefined }}>
          <div className="mp-toolbar">
            <div className="si-wrap" style={{ maxWidth: 280 }}>
              <span className="si-icon">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </span>
              <input
                className="si"
                placeholder="Search downloads…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginLeft: 'auto' }}>
              {downloadsStatus === 'loading' ? '…' : `${filteredDownloadedPhotos.length} photos`}
            </span>
          </div>

          {downloadsStatus === 'loading' ? (
            <div className="mp-empty-block" style={{ paddingTop: 48 }}>
              <p className="mp-empty-sub" style={{ margin: 0 }}>Loading your downloads…</p>
            </div>
          ) : filteredDownloadedPhotos.length === 0 ? (
            downloadedPhotos.length === 0 ? (
              <div className="mp-empty-block">
                <h3 className="mp-empty-title">No downloads yet</h3>
                <p className="mp-empty-sub">
                  When you download photos from the Library, they&apos;ll show up here for quick access.
                </p>
              </div>
            ) : (
              <div className="mp-empty-block">
                <h3 className="mp-empty-title">No matches</h3>
                <p className="mp-empty-sub">Try another search or clear the box.</p>
                <div className="mp-empty-actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSearch('')}>
                    Clear search
                  </button>
                </div>
              </div>
            )
          ) : (
            <PhotoGrid
              photos={filteredDownloadedPhotos}
              userId={userId}
              onFavoriteToggle={handleFavoriteToggleDownloads}
              onDownload={handleDownloadRecorded}
              showEdit
              canEditPhoto={p => p.photographer_id === userId}
              onEdit={openEdit}
              selectable
              selectionMode={selectionMode}
              selectedIds={selectedIds}
              onBeginSelection={beginSelection}
              onToggleSelected={toggleSelected}
            />
          )}
        </div>
      )}

      <Lightbox photos={lightboxPhotos} userId={userId} onDownload={handleDownloadRecorded} />
      <EditModal
        userId={userId}
        onSuccess={async () => {
          await refresh()
          router.refresh()
        }}
      />
      <UploadModal
        userId={userId}
        onSuccess={async () => {
          await refresh()
          router.refresh()
        }}
        defaultCollectionId={drillColl?.id ?? null}
      />
      <CreateCollectionModal
        open={createCollOpen}
        onClose={() => setCreateCollOpen(false)}
        ownedByUserId={adminMode ? userId : undefined}
        onCreated={() => {
          useUIStore.getState().bumpSidebarCollections()
          router.refresh()
        }}
      />

      {selectionMode && (
        <div className="mp-select-bar">
          <span className="mp-select-bar-count">
            {selectedIds.length} selected
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={!visiblePhotoIdsForSelection.length}
            title={selectAllVisibleTitle}
            onClick={selectAllVisible}
          >
            {allVisibleSelected ? 'Deselect visible' : 'Select all'}
          </button>
          {tab !== 'downloads' && (tab === 'photos' || drillColl) && (
            <>
              <select
                className="ui mp-select-bar-coll"
                value={bulkAssignCollId}
                onChange={e => setBulkAssignCollId(e.target.value)}
                disabled={bulkCollBusy}
                aria-label="Collection to add selected photos to"
              >
                <option value="">Add to collection…</option>
                {localCollections.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={!selectedIds.length || !bulkAssignCollId || bulkCollBusy || zipBusy || bulkDeleting}
                onClick={() => void handleBulkAddToCollection()}
              >
                {bulkCollBusy ? 'Saving…' : 'Add to collection'}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={
                  !selectedIds.length ||
                  bulkCollBusy ||
                  zipBusy ||
                  bulkDeleting ||
                  (drillColl ? !selectedIdsInDrillCollection.length : !selectedIdsWithCollection.length)
                }
                onClick={() => void handleBulkRemoveFromCollection()}
              >
                Remove from collection
              </button>
            </>
          )}
          {tab !== 'downloads' && (
            <div className="mp-select-bar-edit">
              <select
                className="ui"
                style={{ fontSize: 12, padding: '4px 6px' }}
                value={bulkEditCategory}
                onChange={e => { setBulkEditCategory(e.target.value as '' | Category); setBulkEditError(null) }}
                disabled={bulkEditBusy}
                aria-label="Bulk category"
              >
                <option value="">Category…</option>
                <option value="neighborhood">Neighborhood</option>
                <option value="city">City</option>
                <option value="condo">Condo</option>
              </select>
              <LocationField
                value={bulkEditNeighborhood}
                onChange={v => { setBulkEditNeighborhood(v); setBulkEditError(null) }}
                labels={locationLabels}
                placeholder="Location…"
                className="ui"
                disabled={bulkEditBusy}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={bulkEditBusy || !selectedIds.length || (bulkEditCategory === '' && bulkEditNeighborhood.trim() === '')}
                onClick={() => void handleBulkEditApply()}
              >
                {bulkEditBusy ? 'Saving…' : 'Apply'}
              </button>
              {bulkEditError && (
                <span style={{ fontSize: 11, color: 'var(--cm-bad, #c44)' }}>{bulkEditError}</span>
              )}
            </div>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={exitSelection}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!selectedIds.length || zipBusy || bulkDeleting || removeDownloadsBusy || bulkCollBusy}
            title={selectedIds.length > ZIP_DOWNLOAD_MAX_PHOTOS ? `Max ${ZIP_DOWNLOAD_MAX_PHOTOS} photos per ZIP` : undefined}
            onClick={handleDownloadZip}
          >
            {zipBusy ? 'Zipping…' : 'Download ZIP'}
          </button>
          <button
            type="button"
            className={tab === 'downloads' ? 'btn-remove-downloads' : 'btn-del-sm'}
            disabled={!selectedIds.length || bulkDeleting || zipBusy || removeDownloadsBusy || bulkCollBusy}
            onClick={tab === 'downloads' ? handleRemoveFromDownloads : handleBulkDelete}
          >
            {tab === 'downloads'
              ? (removeDownloadsBusy ? 'Removing…' : 'Remove from downloads')
              : (bulkDeleting ? 'Deleting…' : 'Delete')}
          </button>
        </div>
      )}
    </div>
  )
}

function MosaicCell({
  photo,
}: {
  photo: { storage_path: string | null; thumbnail_path: string | null; thumbnail_url?: string | null } | undefined
}) {
  const cellRef = useRef<HTMLDivElement>(null)
  const inView = useInView(cellRef, { rootMargin: '120px' })
  const path = photo?.thumbnail_path ?? photo?.storage_path ?? null
  const url = useSignedPhotoUrl(path, { enabled: inView, initialUrl: photo?.thumbnail_url ?? null })
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
  onClick,
}: {
  collection: Collection
  onClick: () => void
}) {
  const topPhotos = (collection.photos ?? []).slice(0, 3)
  const single = (collection.photo_count ?? topPhotos.length) === 1

  return (
    <div className="coll-tile" onClick={onClick}>
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
        <div className="coll-count">
          {collection.photo_count ?? 0} photo{(collection.photo_count ?? 0) !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  )
}
