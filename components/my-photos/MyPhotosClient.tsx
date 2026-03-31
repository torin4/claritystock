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
import {
  deleteCollection,
  getOrCreateCollectionByName,
  mergeCollections,
  renameCollection,
} from '@/lib/actions/collections.actions'
import { deletePhotos, updatePhotosCollectionIds, updatePhotosCategoryNeighborhood } from '@/lib/actions/photos.actions'
import { downloadPhotosZip, ZIP_DOWNLOAD_MAX_PHOTOS } from '@/lib/photos/zipDownload'
import { removeMyDownloads } from '@/lib/actions/downloads.actions'
import { MY_LIBRARY_PAGE_SIZE, PHOTO_MY_LIBRARY_CARD_SELECT } from '@/lib/queries/photoSelects'
import { getMyDownloadedPhotos } from '@/lib/queries/photos.queries'
import { useInView } from '@/lib/hooks/useInView'
import type { Photo, Collection, User, Category } from '@/lib/types/database.types'
import LocationField from '@/components/neighborhoods/LocationField'
import { getNeighborhoodCanonicalLabels } from '@/lib/actions/neighborhoods.actions'
import { sortCollectionsByName } from '@/lib/utils/sortCollectionsByName'
import { buildPhotosSearchOrClause } from '@/lib/photos/photoTextSearch'

const COLL_LONG_PRESS_MS = 520
const COLL_MOVE_CANCEL_PX = 12
/** Max rows loaded in “add existing photos” (unassigned-only picker). */
const ORPHAN_PICK_LIMIT = 200

type CollectionSort = 'name-asc' | 'name-desc' | 'newest' | 'oldest'

type PhotoLibrarySort = 'newest' | 'oldest' | 'title-asc' | 'title-desc'

type PhotoLibraryScope = 'all' | 'orphans'

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
  const [collSelectionMode, setCollSelectionMode] = useState(false)
  const [selectedCollIds, setSelectedCollIds] = useState<string[]>([])
  const [deletingColls, setDeletingColls] = useState(false)
  const [createCollOpen, setCreateCollOpen] = useState(false)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [zipBusy, setZipBusy] = useState(false)
  const [removeDownloadsBusy, setRemoveDownloadsBusy] = useState(false)
  const [bulkCollBusy, setBulkCollBusy] = useState(false)
  const [bulkAssignCollId, setBulkAssignCollId] = useState('')
  const [bulkNewCollName, setBulkNewCollName] = useState('')
  const [bulkExistingCollNotice, setBulkExistingCollNotice] = useState<string | null>(null)
  const [bulkEditCategory, setBulkEditCategory] = useState<'' | Category>('')
  /** When set, category matches this collection’s stored type (neighborhood / city / condo). */
  const [bulkCategoryFromCollId, setBulkCategoryFromCollId] = useState('')
  const [bulkEditNeighborhood, setBulkEditNeighborhood] = useState('')
  const [bulkEditSubarea, setBulkEditSubarea] = useState('')
  const [bulkEditBusy, setBulkEditBusy] = useState(false)
  const [bulkEditError, setBulkEditError] = useState<string | null>(null)
  const [locationLabels, setLocationLabels] = useState<string[]>([])
  const [orphanPickerOpen, setOrphanPickerOpen] = useState(false)
  const [orphanPhotos, setOrphanPhotos] = useState<Photo[]>([])
  const [orphanLoading, setOrphanLoading] = useState(false)
  const [orphanSelectedIds, setOrphanSelectedIds] = useState<string[]>([])
  const [orphanAdding, setOrphanAdding] = useState(false)
  const [mergeModalOpen, setMergeModalOpen] = useState(false)
  const [mergeCollName, setMergeCollName] = useState('')
  const [mergeCollBusy, setMergeCollBusy] = useState(false)
  const [collectionSort, setCollectionSort] = useState<CollectionSort>('newest')
  const [photoLibrarySort, setPhotoLibrarySort] = useState<PhotoLibrarySort>('newest')
  const [photoLibraryScope, setPhotoLibraryScope] = useState<PhotoLibraryScope>('all')
  const [collectionSearch, setCollectionSearch] = useState('')
  /** Collection IDs that have at least one library photo matching the collection search (FTS: title, location, tags, etc.). */
  const [collectionSearchPhotoCollIds, setCollectionSearchPhotoCollIds] = useState<string[]>([])
  const downloadsLoadedRef = useRef(false)
  const photosRequestSeqRef = useRef(0)
  const { openUpload, openEdit } = useUIStore()
  const libraryPageSize = pageSize || MY_LIBRARY_PAGE_SIZE
  const searchTerm = search.trim()
  const collectionSearchTerm = collectionSearch.trim()
  const defaultPhotosViewActive =
    tab === 'photos' &&
    !drillColl &&
    !searchTerm &&
    photoLibrarySort === 'newest' &&
    photoLibraryScope === 'all'
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
    setBulkCategoryFromCollId('')
    setBulkEditNeighborhood('')
    setBulkEditSubarea('')
    setBulkEditError(null)
  }, [])

  const beginCollectionSelection = useCallback((id: string) => {
    setCollSelectionMode(true)
    setSelectedCollIds(prev => prev.includes(id) ? prev : [...prev, id])
  }, [])

  const toggleCollectionSelected = useCallback((id: string) => {
    setSelectedCollIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    )
  }, [])

  const exitCollectionSelection = useCallback(() => {
    setCollSelectionMode(false)
    setSelectedCollIds([])
    setMergeModalOpen(false)
    setMergeCollName('')
  }, [])

  useEffect(() => {
    exitSelection()
  }, [drillColl?.id, searchTerm, tab, exitSelection])

  useEffect(() => {
    if (adminMode && tab === 'downloads') setTab('photos')
  }, [adminMode, tab])

  useEffect(() => {
    if (tab !== 'collections') setCollectionSearch('')
  }, [tab])

  useEffect(() => {
    if (!selectionMode) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitSelection()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectionMode, exitSelection])

  useEffect(() => {
    if (!collSelectionMode) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitCollectionSelection()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [collSelectionMode, exitCollectionSelection])

  useEffect(() => {
    if (!mergeModalOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !mergeCollBusy) {
        setMergeModalOpen(false)
        setMergeCollName('')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mergeModalOpen, mergeCollBusy])

  const handleBulkEditApply = async () => {
    if (!selectedIds.length) return
    const applyCat = bulkEditCategory !== ''
    const applyNeigh = bulkEditNeighborhood.trim().length > 0
    const applySub = bulkEditSubarea.trim().length > 0
    if (!applyCat && !applyNeigh && !applySub) {
      setBulkEditError('Choose a category, neighborhood, and/or sub-area.')
      return
    }
    setBulkEditBusy(true)
    setBulkEditError(null)
    try {
      await updatePhotosCategoryNeighborhood(selectedIds, {
        ...(applyCat ? { category: bulkEditCategory } : {}),
        ...(applyNeigh ? { neighborhood: bulkEditNeighborhood.trim() } : {}),
        ...(applySub ? { subarea: bulkEditSubarea.trim() } : {}),
        photographerId: userId,
      })
      setBulkEditCategory('')
      setBulkCategoryFromCollId('')
      setBulkEditNeighborhood('')
      setBulkEditSubarea('')
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
    if (!selectionMode) {
      setBulkAssignCollId('')
      setBulkNewCollName('')
      setBulkExistingCollNotice(null)
    }
  }, [selectionMode])

  useEffect(() => {
    if (bulkAssignCollId !== '__new__') return
    const name = bulkNewCollName.trim()
    if (!name) return
    const hit = localCollections.find((c) => c.name.trim().toLowerCase() === name.toLowerCase())
    if (!hit) return
    setBulkExistingCollNotice(`A collection named "${hit.name}" already exists — photos will be added there.`)
    setBulkAssignCollId(hit.id)
    setBulkNewCollName('')
  }, [bulkAssignCollId, bulkNewCollName, localCollections])

  useEffect(() => {
    if (tab === 'photos' || drillColl) return
    photosRequestSeqRef.current += 1
    setPhotosStatus('ready')
    setLoadingMorePhotos(false)
  }, [drillColl, tab])

  const handleBulkAddToCollection = async () => {
    if (!selectedIds.length || bulkCollBusy) return
    let targetCollId = bulkAssignCollId
    if (bulkAssignCollId === '__new__') {
      const name = bulkNewCollName.trim()
      if (!name) {
        alert('Enter a name for the new collection.')
        return
      }
    } else if (!targetCollId) {
      return
    }

    setBulkCollBusy(true)
    try {
      if (bulkAssignCollId === '__new__') {
        const { id } = await getOrCreateCollectionByName({
          name: bulkNewCollName.trim(),
          ownerId: adminMode ? userId : undefined,
        })
        targetCollId = id
      }

      const collOpts = adminMode ? { photographerId: userId } : undefined
      const { updated } = await updatePhotosCollectionIds(selectedIds, targetCollId, collOpts)
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
            ? { ...p, collection_id: targetCollId }
            : p,
        ),
      )
      useUIStore.getState().bumpSidebarCollections()
      setBulkAssignCollId('')
      setBulkNewCollName('')
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

  const openOrphanPicker = useCallback(async () => {
    if (!drillColl) return
    setOrphanPickerOpen(true)
    setOrphanLoading(true)
    setOrphanSelectedIds([])
    try {
      const supabase = getSupabaseBrowserClient()
      const { data, error } = await supabase
        .from('photos')
        .select(PHOTO_MY_LIBRARY_CARD_SELECT)
        .eq('photographer_id', userId)
        .is('collection_id', null)
        .order('created_at', { ascending: false })
        .limit(ORPHAN_PICK_LIMIT)
      if (error) throw error
      setOrphanPhotos(mergeLibraryRows((data as Photo[]) ?? []) as Photo[])
    } catch (e) {
      devError(e)
      setOrphanPhotos([])
      alert(e instanceof Error ? e.message : 'Could not load photos')
    } finally {
      setOrphanLoading(false)
    }
  }, [drillColl, mergeLibraryRows, userId])

  const closeOrphanPicker = useCallback(() => {
    if (orphanAdding) return
    setOrphanPickerOpen(false)
    setOrphanSelectedIds([])
    setOrphanPhotos([])
  }, [orphanAdding])

  const toggleOrphanSelected = useCallback((id: string) => {
    setOrphanSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    )
  }, [])

  const toggleAllOrphansVisible = useCallback(() => {
    setOrphanSelectedIds(prev => {
      const allIds = orphanPhotos.map(p => p.id)
      if (!allIds.length) return prev
      const every = allIds.every(id => prev.includes(id))
      if (every) return prev.filter(id => !allIds.includes(id))
      return Array.from(new Set([...prev, ...allIds]))
    })
  }, [orphanPhotos])

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
      } else if (photoLibraryScope === 'orphans') {
        query = query.is('collection_id', null)
      }
      {
        const searchOr = buildPhotosSearchOrClause(searchTerm)
        if (searchOr) query = query.or(searchOr)
      }

      if (photoLibrarySort === 'oldest') {
        query = query.order('created_at', { ascending: true })
      } else if (photoLibrarySort === 'title-asc') {
        query = query.order('title', { ascending: true })
      } else if (photoLibrarySort === 'title-desc') {
        query = query.order('title', { ascending: false })
      } else {
        query = query.order('created_at', { ascending: false })
      }

      const { data, count, error } = await query.range(offset, offset + libraryPageSize - 1)

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
  }, [drillColl?.id, libraryPageSize, mergeLibraryRows, photoLibraryScope, photoLibrarySort, searchTerm, userId])

  const refresh = async () => {
    await fetchPhotosPage({ offset: 0 })
  }

  const handleAddOrphansToCollection = useCallback(async () => {
    if (!drillColl || !orphanSelectedIds.length || orphanAdding) return
    setOrphanAdding(true)
    const ids = orphanSelectedIds.slice()
    const count = ids.length
    try {
      const collOpts = adminMode ? { photographerId: userId } : undefined
      await updatePhotosCollectionIds(ids, drillColl.id, collOpts)
      setLocalCollections(prev =>
        prev.map(c =>
          c.id === drillColl.id
            ? { ...c, photo_count: (c.photo_count ?? 0) + count }
            : c,
        ),
      )
      useUIStore.getState().bumpSidebarCollections()
      setOrphanPickerOpen(false)
      setOrphanSelectedIds([])
      setOrphanPhotos([])
      await fetchPhotosPage({ offset: 0 })
      router.refresh()
    } catch (e) {
      devError(e)
      alert(e instanceof Error ? e.message : 'Could not add photos')
    } finally {
      setOrphanAdding(false)
    }
  }, [
    adminMode,
    drillColl,
    fetchPhotosPage,
    orphanAdding,
    orphanSelectedIds,
    router,
    userId,
  ])

  useEffect(() => {
    if (!orphanPickerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeOrphanPicker()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [orphanPickerOpen, closeOrphanPicker])

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
        (p.subarea ?? '').toLowerCase().includes(q) ||
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
  }, [defaultPhotosViewActive, drillColl, fetchPhotosPage, photoLibraryScope, photoLibrarySort, searchTerm, tab])

  const collectionPhotoCounts = useMemo(
    () => new Map(localCollections.map((collection) => [collection.id, collection.photo_count ?? 0])),
    [localCollections],
  )

  const collectionsForSelect = useMemo(
    () => sortCollectionsByName(localCollections),
    [localCollections],
  )

  const sortedCollectionsForGrid = useMemo(() => {
    const list = [...localCollections]
    switch (collectionSort) {
      case 'name-asc':
        return list.sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }),
        )
      case 'name-desc':
        return list.sort((a, b) =>
          b.name.localeCompare(a.name, undefined, { sensitivity: 'base', numeric: true }),
        )
      case 'oldest':
        return list.sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        )
      case 'newest':
      default:
        return list.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
    }
  }, [localCollections, collectionSort])

  useEffect(() => {
    if (tab !== 'collections' || !collectionSearchTerm) {
      setCollectionSearchPhotoCollIds([])
      return
    }
    let cancelled = false
    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          const supabase = getSupabaseBrowserClient()
          const searchOr = buildPhotosSearchOrClause(collectionSearchTerm)
          let collSearch = supabase
            .from('photos')
            .select('collection_id')
            .eq('photographer_id', userId)
            .not('collection_id', 'is', null)
            .limit(5000)
          collSearch = searchOr ? collSearch.or(searchOr) : collSearch
          const { data, error } = await collSearch
          if (error) throw error
          if (cancelled) return
          const ids = Array.from(
            new Set(
              (data ?? [])
                .map((row: { collection_id: string | null }) => row.collection_id)
                .filter((id): id is string => Boolean(id)),
            ),
          )
          setCollectionSearchPhotoCollIds(ids)
        } catch (e) {
          devError(e)
          if (!cancelled) setCollectionSearchPhotoCollIds([])
        }
      })()
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [collectionSearchTerm, tab, userId])

  const filteredCollectionsForGrid = useMemo(() => {
    if (!collectionSearchTerm) return sortedCollectionsForGrid
    const q = collectionSearchTerm.toLowerCase()
    const nameHits = new Set(
      sortedCollectionsForGrid.filter(c => c.name.toLowerCase().includes(q)).map(c => c.id),
    )
    const union = new Set<string>([...Array.from(nameHits), ...collectionSearchPhotoCollIds])
    return sortedCollectionsForGrid.filter(c => union.has(c.id))
  }, [collectionSearchPhotoCollIds, collectionSearchTerm, sortedCollectionsForGrid])

  const mergeDefaultName = useMemo(() => {
    const sel = localCollections.filter(c => selectedCollIds.includes(c.id))
    if (sel.length < 2) return ''
    const [first] = sortCollectionsByName(sel)
    return first?.name ?? ''
  }, [localCollections, selectedCollIds])

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

  const handleDeleteSelectedCollections = async () => {
    if (!selectedCollIds.length) return
    const count = selectedCollIds.length
    if (!confirm(
      adminMode
        ? `Delete ${count} collection${count !== 1 ? 's' : ''}? Photos stay in this photographer's library.`
        : `Delete ${count} collection${count !== 1 ? 's' : ''}? Photos stay in your library.`,
    )) return
    setDeletingColls(true)
    try {
      await Promise.all(selectedCollIds.map(id => deleteCollection(id)))
      useUIStore.getState().bumpSidebarCollections()
      setLocalCollections(prev => prev.filter(c => !selectedCollIds.includes(c.id)))
      exitCollectionSelection()
      router.refresh()
    } catch (e) {
      devError(e)
      alert(e instanceof Error ? e.message : 'Could not delete collections')
    } finally {
      setDeletingColls(false)
    }
  }

  const handleMergeSelectedCollections = async () => {
    const name = mergeCollName.trim()
    const collectionIds = [...selectedCollIds]
    if (!name || collectionIds.length < 2 || mergeCollBusy) return
    setMergeCollBusy(true)
    try {
      const totalPhotos = collectionIds.reduce(
        (acc, id) => acc + (localCollections.find(c => c.id === id)?.photo_count ?? 0),
        0,
      )
      const { mergedCollectionId } = await mergeCollections({
        collectionIds,
        mergedName: name,
        ...(adminMode ? { photographerId: userId } : {}),
      })
      useUIStore.getState().bumpSidebarCollections()
      setLocalCollections(prev =>
        prev
          .filter(c => !collectionIds.includes(c.id) || c.id === mergedCollectionId)
          .map(c =>
            c.id === mergedCollectionId
              ? { ...c, name, photo_count: totalPhotos }
              : c,
          ),
      )
      if (drillColl && collectionIds.includes(drillColl.id)) {
        if (drillColl.id === mergedCollectionId) {
          setDrillColl({ ...drillColl, name, photo_count: totalPhotos })
        } else {
          setDrillColl(null)
          setTab('collections')
        }
      }
      setMergeModalOpen(false)
      setMergeCollName('')
      exitCollectionSelection()
      router.refresh()
    } catch (e) {
      devError(e)
      alert(e instanceof Error ? e.message : 'Could not merge collections')
    } finally {
      setMergeCollBusy(false)
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
        <div style={{ paddingBottom: collSelectionMode ? 88 : undefined }}>
          <div
            className="mp-toolbar"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 12,
              width: '100%',
            }}
          >
            <span
              style={{
                fontSize: 11,
                color: 'var(--text-3)',
                fontFamily: 'var(--font-mono)',
                flexShrink: 0,
              }}
            >
              {collectionSearchTerm
                ? `${filteredCollectionsForGrid.length} of ${localCollections.length} shown`
                : `${localCollections.length} collection${localCollections.length !== 1 ? 's' : ''}`}
            </span>
            {localCollections.length > 0 ? (
              <div className="si-wrap" style={{ flex: '1 1 220px', minWidth: 160, maxWidth: 480 }}>
                <span className="si-icon">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </span>
                <input
                  className="si"
                  placeholder="Search by name or location…"
                  value={collectionSearch}
                  onChange={e => setCollectionSearch(e.target.value)}
                  disabled={collSelectionMode}
                  aria-label="Search collections by name"
                />
              </div>
            ) : null}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginLeft: 'auto',
                flexWrap: 'nowrap',
                flexShrink: 0,
              }}
            >
              {localCollections.length > 0 ? (
                <>
                  <label htmlFor="mp-coll-sort" className="sr-only">
                    Sort collections
                  </label>
                  <select
                    id="mp-coll-sort"
                    className="ui"
                    style={{ fontSize: 12, padding: '4px 8px', minWidth: 140, maxWidth: 200, flexShrink: 0 }}
                    value={collectionSort}
                    onChange={(e) => setCollectionSort(e.target.value as CollectionSort)}
                    aria-label="Sort collections"
                    disabled={collSelectionMode}
                  >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="name-asc">Name A–Z</option>
                    <option value="name-desc">Name Z–A</option>
                  </select>
                </>
              ) : null}
              {!collSelectionMode && (
                <button
                  type="button"
                  className="coll-create-text"
                  onClick={() => setCreateCollOpen(true)}
                >
                  + Create collection
                </button>
              )}
            </div>
          </div>
          {localCollections.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              No collections yet. Create one with <strong style={{ color: 'var(--text-2)' }}>+ Create collection</strong>, or add one when you add photos{adminMode ? ' for this photographer' : ''}.
            </div>
          ) : filteredCollectionsForGrid.length === 0 ? (
            <div className="mp-empty-block">
              <h3 className="mp-empty-title">No collections match your search</h3>
              <p className="mp-empty-sub">
                Nothing matches “{collectionSearchTerm}”. Try another term or clear the search.
              </p>
              <div className="mp-empty-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCollectionSearch('')}>
                  Clear search
                </button>
              </div>
            </div>
          ) : (
            <div className="coll-grid">
              {filteredCollectionsForGrid.map(coll => (
                <CollectionTile
                  key={coll.id}
                  collection={coll}
                  onClick={() => { setDrillColl(coll); setTab('photos') }}
                  selectable
                  selectionMode={collSelectionMode}
                  selected={selectedCollIds.includes(coll.id)}
                  onBeginSelection={beginCollectionSelection}
                  onToggleSelected={toggleCollectionSelected}
                />
              ))}
            </div>
          )}
          {collSelectionMode && (
            <div className="mp-select-bar">
              <span className="mp-select-bar-count">{selectedCollIds.length} selected</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={!filteredCollectionsForGrid.length}
                title={
                  collectionSearchTerm
                    ? 'Selects every collection currently shown. Change or clear search to include others.'
                    : undefined
                }
                onClick={() => {
                  const visibleIds = filteredCollectionsForGrid.map(c => c.id)
                  const allVisibleSelected =
                    visibleIds.length > 0 && visibleIds.every(id => selectedCollIds.includes(id))
                  setSelectedCollIds(prev => {
                    if (allVisibleSelected) {
                      return prev.filter(id => !visibleIds.includes(id))
                    }
                    return Array.from(new Set([...prev, ...visibleIds]))
                  })
                }}
              >
                {collectionSearchTerm
                  ? (filteredCollectionsForGrid.length > 0 &&
                      filteredCollectionsForGrid.every(c => selectedCollIds.includes(c.id))
                      ? 'Deselect visible'
                      : 'Select visible')
                  : (localCollections.every(c => selectedCollIds.includes(c.id)) ? 'Deselect all' : 'Select all')}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={exitCollectionSelection}>
                Done
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={selectedCollIds.length < 2 || deletingColls || mergeCollBusy}
                onClick={() => {
                  setMergeCollName(mergeDefaultName)
                  setMergeModalOpen(true)
                }}
              >
                Merge…
              </button>
              <button
                type="button"
                className="btn-del-sm"
                disabled={!selectedCollIds.length || deletingColls}
                onClick={() => void handleDeleteSelectedCollections()}
              >
                {deletingColls ? 'Deleting…' : 'Delete'}
              </button>
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
          <div
            className="mp-toolbar"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 12,
              width: '100%',
            }}
          >
            <div className="si-wrap" style={{ flex: '1 1 240px', minWidth: 0, maxWidth: 520 }}>
              <span className="si-icon">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </span>
              <input
                className="si"
                placeholder={
                  adminMode
                    ? 'Search photos (title, location)…'
                    : 'Search your photos (title, location)…'
                }
                value={search}
                onChange={e => setSearch(e.target.value)}
                disabled={selectionMode}
                aria-label={adminMode ? 'Search photos' : 'Search your photos'}
              />
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginLeft: 'auto',
                flexWrap: 'nowrap',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {!drillColl && tab === 'photos' && (
                  <>
                    <label htmlFor="mp-photo-scope" className="sr-only">
                      Library filter
                    </label>
                    <select
                      id="mp-photo-scope"
                      className="ui"
                      style={{ fontSize: 12, padding: '4px 8px', minWidth: 120, maxWidth: 220, flexShrink: 0 }}
                      value={photoLibraryScope}
                      onChange={(e) => setPhotoLibraryScope(e.target.value as PhotoLibraryScope)}
                      aria-label="Filter photos by collection assignment"
                      disabled={selectionMode}
                    >
                      <option value="all">All photos</option>
                      <option value="orphans">No collection</option>
                    </select>
                  </>
                )}
                <label htmlFor="mp-photo-sort" className="sr-only">
                  Sort photos
                </label>
                <select
                  id="mp-photo-sort"
                  className="ui"
                  style={{ fontSize: 12, padding: '4px 8px', minWidth: 140, maxWidth: 200, flexShrink: 0 }}
                  value={photoLibrarySort}
                  onChange={(e) => setPhotoLibrarySort(e.target.value as PhotoLibrarySort)}
                  aria-label="Sort photos"
                  disabled={selectionMode}
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="title-asc">Title A–Z</option>
                  <option value="title-desc">Title Z–A</option>
                </select>
              </div>
              <span
                className="mp-toolbar-count"
                style={{
                  fontSize: 11,
                  color: 'var(--text-3)',
                  fontFamily: 'var(--font-mono)',
                  whiteSpace: 'nowrap',
                }}
              >
                {photosStatus === 'loading'
                  ? '…'
                  : !drillColl && photoLibraryScope === 'orphans'
                    ? `${photoTotal} without a collection`
                    : `${photoTotal} photos`}
              </span>
            </div>
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
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => void openOrphanPicker()}
                      disabled={orphanLoading}
                      title="Pick photos that are not in any collection yet"
                    >
                      {orphanLoading ? 'Loading…' : 'Add existing photos'}
                    </button>
                  </div>
                </div>
              )
            ) : (
              searchTerm ? (
                <div className="mp-empty-block">
                  <h3 className="mp-empty-title">No photos match your search</h3>
                  <p className="mp-empty-sub">
                    {photoLibraryScope === 'orphans'
                      ? 'Nothing matches in photos that are not in a collection. Try another term, show all photos, or clear the search.'
                      : 'Try another term or clear the search box.'}
                  </p>
                  <div className="mp-empty-actions">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSearch('')}>
                      Clear search
                    </button>
                    {photoLibraryScope === 'orphans' && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setPhotoLibraryScope('all')}
                      >
                        Show all photos
                      </button>
                    )}
                  </div>
                </div>
              ) : photoLibraryScope === 'orphans' ? (
                <div className="mp-empty-block">
                  <h3 className="mp-empty-title">No photos without a collection</h3>
                  <p className="mp-empty-sub">
                    {adminMode
                      ? 'Every photo in this library is assigned to a collection, or there are no photos yet.'
                      : 'Every photo is in a collection. Upload new photos or remove some from a collection to see them here.'}
                  </p>
                  <div className="mp-empty-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setPhotoLibraryScope('all')}
                    >
                      Show all photos
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

      {mergeModalOpen && (
        <div
          className="modal-overlay open"
          onClick={e => {
            if (e.target === e.currentTarget && !mergeCollBusy) {
              setMergeModalOpen(false)
              setMergeCollName('')
            }
          }}
          role="presentation"
        >
          <div
            className="modal"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-labelledby="merge-coll-title"
            aria-modal="true"
          >
            <div className="modal-body">
              <div className="modal-hdr">
                <div id="merge-coll-title" style={{ fontFamily: 'var(--font-head)', fontSize: 16, fontWeight: 600 }}>
                  Merge {selectedCollIds.length} collections
                </div>
                <button
                  type="button"
                  className="modal-close"
                  disabled={mergeCollBusy}
                  aria-label="Close"
                  onClick={() => {
                    setMergeModalOpen(false)
                    setMergeCollName('')
                  }}
                >
                  ✕
                </button>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5, margin: '0 0 14px' }}>
                All photos from the selected collections move into one collection. Other collection names are removed
                (empty collections are deleted automatically).
              </p>
              <div className="modal-field">
                <div className="modal-lbl">Name for merged collection</div>
                <input
                  className="ui"
                  value={mergeCollName}
                  onChange={e => setMergeCollName(e.target.value)}
                  placeholder="Collection name"
                  disabled={mergeCollBusy}
                  autoFocus
                  aria-label="Merged collection name"
                />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={mergeCollBusy}
                  onClick={() => {
                    setMergeModalOpen(false)
                    setMergeCollName('')
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={mergeCollBusy || !mergeCollName.trim()}
                  onClick={() => void handleMergeSelectedCollections()}
                >
                  {mergeCollBusy ? 'Merging…' : 'Merge collections'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {drillColl && orphanPickerOpen && (
        <div
          className="modal-overlay open"
          onClick={e => { if (e.target === e.currentTarget) closeOrphanPicker() }}
          role="presentation"
        >
          <div
            className="modal"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-labelledby="orphan-pick-title"
            style={{ maxWidth: 520, width: 'calc(100vw - 32px)', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
          >
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: 0 }}>
              <div className="modal-hdr" style={{ padding: '14px 16px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
                <div id="orphan-pick-title" style={{ fontFamily: 'var(--font-head)', fontSize: 16, fontWeight: 600 }}>
                  Add existing photos to “{drillColl.name}”
                </div>
                <button
                  type="button"
                  className="modal-close"
                  onClick={closeOrphanPicker}
                  disabled={orphanAdding}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0, padding: '10px 16px 0' }}>
                Only photos not in any collection are listed. Select the ones you want here.
              </p>
              {orphanPhotos.length >= ORPHAN_PICK_LIMIT && (
                <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, padding: '6px 16px 0', fontFamily: 'var(--font-mono)' }}>
                  Showing the {ORPHAN_PICK_LIMIT} most recent unassigned photos.
                </p>
              )}
              <div style={{ padding: '12px 16px', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={!orphanPhotos.length || orphanLoading || orphanAdding}
                  onClick={toggleAllOrphansVisible}
                >
                  {orphanPhotos.length > 0 && orphanPhotos.every(p => orphanSelectedIds.includes(p.id))
                    ? 'Deselect all'
                    : 'Select all'}
                </button>
                <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 'auto' }}>
                  {orphanSelectedIds.length} selected
                </span>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 8px 8px' }}>
                {orphanLoading ? (
                  <p className="mp-empty-sub" style={{ padding: '24px 8px', textAlign: 'center', margin: 0 }}>
                    Loading photos…
                  </p>
                ) : orphanPhotos.length === 0 ? (
                  <p className="mp-empty-sub" style={{ padding: '24px 8px', textAlign: 'center', margin: 0 }}>
                    No unassigned photos in this library. Upload new photos or remove some from other collections first.
                  </p>
                ) : (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {orphanPhotos.map(p => (
                      <li key={p.id} style={{ marginBottom: 4 }}>
                        <OrphanPickerRow
                          photo={p}
                          selected={orphanSelectedIds.includes(p.id)}
                          onToggle={() => toggleOrphanSelected(p.id)}
                          disabled={orphanAdding}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0 }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={closeOrphanPicker}
                  disabled={orphanAdding}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={!orphanSelectedIds.length || orphanAdding}
                  onClick={() => void handleAddOrphansToCollection()}
                >
                  {orphanAdding
                    ? 'Adding…'
                    : `Add ${orphanSelectedIds.length} photo${orphanSelectedIds.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                onChange={(e) => {
                  setBulkExistingCollNotice(null)
                  setBulkAssignCollId(e.target.value)
                  if (e.target.value !== '__new__') setBulkNewCollName('')
                }}
                disabled={bulkCollBusy}
                aria-label="Collection to add selected photos to"
              >
                <option value="">Add to collection…</option>
                <option value="__new__">+ Create new collection…</option>
                {collectionsForSelect.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {bulkAssignCollId === '__new__' && (
                <input
                  className="ui"
                  style={{ fontSize: 12, padding: '4px 8px', minWidth: 140, maxWidth: 200 }}
                  value={bulkNewCollName}
                  onChange={(e) => setBulkNewCollName(e.target.value)}
                  placeholder="New collection name"
                  disabled={bulkCollBusy}
                  aria-label="New collection name"
                />
              )}
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={
                  !selectedIds.length ||
                  bulkCollBusy ||
                  zipBusy ||
                  bulkDeleting ||
                  !bulkAssignCollId ||
                  (bulkAssignCollId === '__new__' && !bulkNewCollName.trim())
                }
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
              {bulkExistingCollNotice ? (
                <div
                  className="upload-dup-hint upload-dup-hint--pending"
                  role="status"
                  style={{ flexBasis: '100%', width: '100%', marginTop: 6, fontSize: 11 }}
                >
                  {bulkExistingCollNotice}
                </div>
              ) : null}
            </>
          )}
          {tab !== 'downloads' && (
            <div className="mp-select-bar-edit">
              <select
                className="ui"
                style={{ fontSize: 12, padding: '4px 6px' }}
                value={bulkEditCategory}
                onChange={e => {
                  setBulkEditCategory(e.target.value as '' | Category)
                  setBulkCategoryFromCollId('')
                  setBulkEditError(null)
                }}
                disabled={bulkEditBusy}
                aria-label="Bulk category"
              >
                <option value="">Category…</option>
                <option value="neighborhood">Neighborhood</option>
                <option value="city">City</option>
                <option value="condo">Condo</option>
              </select>
              {collectionsForSelect.length > 0 && (
                <select
                  className="ui mp-select-bar-cat-coll"
                  value={bulkCategoryFromCollId}
                  onChange={(e) => {
                    const id = e.target.value
                    setBulkCategoryFromCollId(id)
                    setBulkEditError(null)
                    if (id) {
                      const c = collectionsForSelect.find((x) => x.id === id)
                      const cat = c?.category ?? null
                      setBulkEditCategory((cat ?? 'neighborhood') as Category)
                    }
                  }}
                  disabled={bulkEditBusy}
                  aria-label="Set category from an existing collection’s type"
                  title="Use the neighborhood / city / condo type saved on that collection"
                >
                  <option value="">From collection…</option>
                  {collectionsForSelect.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.category
                        ? ` (${categoryShortLabel(c.category)})`
                        : ' (neighborhood default)'}
                    </option>
                  ))}
                </select>
              )}
              <LocationField
                value={bulkEditNeighborhood}
                onChange={v => { setBulkEditNeighborhood(v); setBulkEditError(null) }}
                labels={locationLabels}
                placeholder="Location…"
                className="ui"
                disabled={bulkEditBusy}
              />
              <input
                className="ui"
                style={{ fontSize: 12, padding: '4px 6px', minWidth: 100 }}
                value={bulkEditSubarea}
                onChange={e => { setBulkEditSubarea(e.target.value); setBulkEditError(null) }}
                placeholder="Sub-area…"
                disabled={bulkEditBusy}
                aria-label="Bulk sub-area"
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={
                  bulkEditBusy ||
                  !selectedIds.length ||
                  (bulkEditCategory === '' && bulkEditNeighborhood.trim() === '' && bulkEditSubarea.trim() === '')
                }
                onClick={() => void handleBulkEditApply()}
              >
                {bulkEditBusy ? 'Saving…' : 'Apply'}
              </button>
              {bulkEditError && (
                <span style={{ fontSize: 11, color: 'var(--cm-bad, #c44)' }}>{bulkEditError}</span>
              )}
            </div>
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={exitSelection}>
            Done
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

function categoryShortLabel(c: Category): string {
  switch (c) {
    case 'neighborhood':
      return 'Neighborhood'
    case 'city':
      return 'City'
    case 'condo':
      return 'Condo'
    default:
      return String(c)
  }
}

function OrphanPickerRow({
  photo,
  selected,
  onToggle,
  disabled,
}: {
  photo: Photo
  selected: boolean
  onToggle: () => void
  disabled?: boolean
}) {
  const path = photo.thumbnail_path ?? photo.storage_path ?? null
  const url = useSignedPhotoUrl(path, { enabled: !!path, initialUrl: photo.thumbnail_url ?? null })
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        borderRadius: 8,
        cursor: disabled ? 'default' : 'pointer',
        background: selected ? 'var(--surface-2)' : 'transparent',
      }}
    >
      <input type="checkbox" checked={selected} onChange={onToggle} disabled={disabled} />
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 6,
          overflow: 'hidden',
          flexShrink: 0,
          background: 'var(--surface-2)',
        }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : null}
      </div>
      <span
        style={{
          fontSize: 13,
          color: 'var(--text-1)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
          flex: 1,
        }}
      >
        {photo.title?.trim() || 'Untitled'}
      </span>
    </label>
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
  selectable,
  selectionMode,
  selected,
  onBeginSelection,
  onToggleSelected,
}: {
  collection: Collection
  onClick: () => void
  selectable?: boolean
  selectionMode?: boolean
  selected?: boolean
  onBeginSelection?: (id: string) => void
  onToggleSelected?: (id: string) => void
}) {
  const topPhotos = (collection.photos ?? []).slice(0, 3)
  const single = (collection.photo_count ?? topPhotos.length) === 1
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pointerStart = useRef<{ x: number; y: number } | null>(null)
  const suppressNextClick = useRef(false)

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    pointerStart.current = null
  }, [])

  useEffect(() => () => clearLongPress(), [clearLongPress])

  function handlePointerDown(e: React.PointerEvent) {
    if (!selectable || selectionMode) return
    if (e.button !== 0) return
    suppressNextClick.current = false
    pointerStart.current = { x: e.clientX, y: e.clientY }
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null
      suppressNextClick.current = true
      onBeginSelection?.(collection.id)
      try {
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(12)
      } catch { /* ignore */ }
    }, COLL_LONG_PRESS_MS)
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!pointerStart.current || !longPressTimer.current) return
    const dx = e.clientX - pointerStart.current.x
    const dy = e.clientY - pointerStart.current.y
    if (dx * dx + dy * dy > COLL_MOVE_CANCEL_PX * COLL_MOVE_CANCEL_PX) clearLongPress()
  }

  function handlePointerEnd() { clearLongPress() }

  function handleContextMenu(e: React.MouseEvent) {
    if (!selectable) return
    e.preventDefault()
    suppressNextClick.current = true
    onBeginSelection?.(collection.id)
  }

  function handleTileClick() {
    if (suppressNextClick.current) {
      suppressNextClick.current = false
      return
    }
    if (selectionMode) {
      onToggleSelected?.(collection.id)
      return
    }
    onClick()
  }

  return (
    <div
      className={`coll-tile${selectionMode ? ' coll-tile-selecting' : ''}${selected ? ' selected' : ''}`}
      style={selectable && !selectionMode ? { touchAction: 'manipulation' } : undefined}
      onClick={handleTileClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onPointerLeave={handlePointerEnd}
      onContextMenu={handleContextMenu}
    >
      <div className={`coll-mosaic${single ? ' coll-mosaic--single' : ''}`}>
        {single ? (
          <MosaicCell photo={topPhotos[0]} />
        ) : (
          [0, 1, 2].map(i => (
            <MosaicCell key={i} photo={topPhotos[i]} />
          ))
        )}
      </div>
      {selectionMode && (
        <div className="ptile-sel-check" aria-hidden>
          {selected ? (
            <svg className="ptile-sel-check-svg" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : null}
        </div>
      )}
      <div className="coll-ov">
        <div className="coll-name">{collection.name}</div>
        <div className="coll-count">
          {collection.photo_count ?? 0} photo{(collection.photo_count ?? 0) !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  )
}
