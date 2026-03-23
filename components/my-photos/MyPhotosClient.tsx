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
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { deleteCollection, renameCollection } from '@/lib/actions/collections.actions'
import { deletePhotos, updatePhotosCollectionIds } from '@/lib/actions/photos.actions'
import { downloadPhotosZip, ZIP_DOWNLOAD_MAX_PHOTOS } from '@/lib/photos/zipDownload'
import { removeMyDownloads } from '@/lib/actions/downloads.actions'
import { PHOTO_MY_LIBRARY_CARD_SELECT } from '@/lib/queries/photoSelects'
import { getMyDownloadedPhotos } from '@/lib/queries/photos.queries'
import { useInView } from '@/lib/hooks/useInView'
import type { Photo, Collection, User } from '@/lib/types/database.types'

type CollectionSummary = Collection

type LibraryPhotographer = Pick<User, 'id' | 'name' | 'initials' | 'avatar_url'>

interface Props {
  initialPhotos: Photo[]
  collections: CollectionSummary[]
  userId: string
  /** Merged onto each library photo (avoids per-row photographer join). */
  libraryPhotographer: LibraryPhotographer | null
}

export default function MyPhotosClient({
  initialPhotos,
  collections,
  userId,
  libraryPhotographer,
}: Props) {
  const router = useRouter()
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos)
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
  const downloadsLoadedRef = useRef(false)
  const { openUpload, openEdit } = useUIStore()

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
  }, [drillColl?.id, tab, exitSelection])

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
      const mark = (p: Photo) =>
        selectedIds.includes(p.id) ? { ...p, is_downloaded_by_me: true as const } : p
      setPhotos(prev => prev.map(mark))
      setDownloadedPhotos(prev => prev.map(mark))
      exitSelection()
      router.refresh()
    } catch (e) {
      if (e instanceof Error && e.message === 'Cancelled') return
      console.error(e)
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
      console.error(e)
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

  const handleBulkAddToCollection = async () => {
    if (!selectedIds.length || !bulkAssignCollId || bulkCollBusy) return
    setBulkCollBusy(true)
    try {
      const { updated } = await updatePhotosCollectionIds(selectedIds, bulkAssignCollId)
      if (updated < selectedIds.length) {
        alert(
          `Updated ${updated} of ${selectedIds.length} photo(s). You can only assign photos you uploaded.`,
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
      console.error(e)
      alert(e instanceof Error ? e.message : 'Could not update collection')
    } finally {
      setBulkCollBusy(false)
    }
  }

  const handleBulkRemoveFromCollection = async () => {
    const ids = drillColl ? selectedIdsInDrillCollection : selectedIdsWithCollection
    if (!ids.length || bulkCollBusy) return
    const msg = drillColl
      ? `Remove ${ids.length} photo${ids.length === 1 ? '' : 's'} from “${drillColl.name}”? They stay in your library.`
      : `Remove ${ids.length} photo${ids.length === 1 ? '' : 's'} from their collection(s)? They stay in your library.`
    if (!confirm(msg)) return
    setBulkCollBusy(true)
    try {
      await updatePhotosCollectionIds(ids, null)
      setPhotos(prev =>
        prev.map(p => (ids.includes(p.id) ? { ...p, collection_id: null } : p)),
      )
      useUIStore.getState().bumpSidebarCollections()
      exitSelection()
      await refresh()
      router.refresh()
    } catch (e) {
      console.error(e)
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
        'None of the selected photos are yours to remove from the library. You can only delete photos you uploaded.',
      )
      return
    }
    if (ownedIds.length < selectedIds.length) {
      if (
        !confirm(
          `Only ${ownedIds.length} selected photo${ownedIds.length === 1 ? '' : 's'} ${ownedIds.length === 1 ? 'is' : 'are'} yours and will be removed from the library. Continue?`,
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
      console.error(e)
      alert(e instanceof Error ? e.message : 'Could not delete photos')
    } finally {
      setBulkDeleting(false)
    }
  }

  useEffect(() => {
    setPhotos(initialPhotos)
  }, [initialPhotos])

  useEffect(() => {
    setLocalCollections(collections)
  }, [collections])

  useEffect(() => {
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
        console.error(err)
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
  }, [tab, userId])

  const mergeLibraryRows = useCallback(
    (rows: Photo[]) =>
      libraryPhotographer
        ? rows.map(p => ({ ...p, photographer: libraryPhotographer }))
        : rows,
    [libraryPhotographer],
  )

  const refresh = async () => {
    const supabase = getSupabaseBrowserClient()
    const { data } = await supabase
      .from('photos')
      .select(PHOTO_MY_LIBRARY_CARD_SELECT)
      .eq('photographer_id', userId)
      .order('created_at', { ascending: false })
    setPhotos(mergeLibraryRows((data as Photo[]) ?? []) as Photo[])
  }

  const filteredPhotos = useMemo(() => {
    const src = drillColl
      ? photos.filter(p => p.collection_id === drillColl.id)
      : photos
    if (!search) return src
    const q = search.toLowerCase()
    return src.filter(p =>
      p.title.toLowerCase().includes(q) ||
      (p.neighborhood ?? '').toLowerCase().includes(q)
    )
  }, [photos, drillColl, search])

  const filteredDownloadedPhotos = useMemo(() => {
    if (!search) return downloadedPhotos
    const q = search.toLowerCase()
    return downloadedPhotos.filter(
      p =>
        p.title.toLowerCase().includes(q) ||
        (p.neighborhood ?? '').toLowerCase().includes(q) ||
        (p.photographer?.name ?? '').toLowerCase().includes(q),
    )
  }, [downloadedPhotos, search])

  const lightboxPhotos = useMemo(() => {
    if (!drillColl && tab === 'downloads') return filteredDownloadedPhotos
    return filteredPhotos
  }, [drillColl, tab, filteredDownloadedPhotos, filteredPhotos])

  const photosByCollection = useMemo(() => {
    const grouped = new Map<string, Photo[]>()
    for (const photo of photos) {
      if (!photo.collection_id) continue
      const existing = grouped.get(photo.collection_id)
      if (existing) existing.push(photo)
      else grouped.set(photo.collection_id, [photo])
    }
    return grouped
  }, [photos])

  const totalDownloads = photos.reduce((sum, p) => sum + (p.downloads_count ?? 0), 0)

  const noopFavoriteToggle = useCallback(() => {}, [])

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
      `Delete “${drillColl.name}”? Photos stay in your library; they’ll just be removed from this collection.`,
    )) return
    setDeletingColl(true)
    try {
      await deleteCollection(drillColl.id)
      useUIStore.getState().bumpSidebarCollections()
      setDrillColl(null)
      setTab('collections')
      await refresh()
      router.refresh()
    } catch (e) {
      console.error(e)
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
      console.error(e)
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
          <div className="ph-title">My Photos</div>
          <div className="ph-sub">
            {!drillColl && tab === 'downloads' ? (
              downloadsStatus === 'loading'
                ? 'Loading downloads…'
                : `${downloadedPhotos.length} photo${downloadedPhotos.length !== 1 ? 's' : ''} you've downloaded`
            ) : (
              <>
                {photos.length} in Library · {totalDownloads} uses by the team
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
          <button type="button" className="btn btn-primary btn-sm btn-with-icon" onClick={() => openUpload()}>
            <PlusIcon size={15} />
            {drillColl ? 'Add to collection' : 'Add Photos'}
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
          <button
            className={`my-tab ${tab === 'downloads' ? 'active' : ''}`}
            onClick={() => setTab('downloads')}
          >My downloads</button>
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
              No collections yet. Create one with <strong style={{ color: 'var(--text-2)' }}>+ Create collection</strong>, or add one when you add photos.
            </div>
          ) : (
            <div className="coll-grid">
              {localCollections.map(coll => (
                <CollectionTile
                  key={coll.id}
                  collection={coll}
                  photos={photosByCollection.get(coll.id) ?? []}
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
                    {filteredPhotos.length} photo{filteredPhotos.length !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
              <div className="drill-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm btn-with-icon"
                  onClick={() => openUpload()}
                >
                  <PlusIcon size={14} />
                  Add photos
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
                placeholder="Search your photos…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginLeft: 'auto' }}>
              {filteredPhotos.length} photos
            </span>
          </div>

          {/* Grid or empty states */}
          {filteredPhotos.length === 0 ? (
            drillColl ? (
              search.trim() ? (
                <div className="mp-empty-block">
                  <h3 className="mp-empty-title">No matches in this collection</h3>
                  <p className="mp-empty-sub">
                    Nothing matches “{search.trim()}” in “{drillColl.name}”. Try a different search or clear it to see all photos here.
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
                    <button type="button" className="btn btn-primary btn-sm btn-with-icon" onClick={() => openUpload()}>
                      <PlusIcon size={15} />
                      Add photos to this collection
                    </button>
                  </div>
                </div>
              )
            ) : (
              search.trim() ? (
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
                  <h3 className="mp-empty-title">No photos in your library yet</h3>
                  <p className="mp-empty-sub">Upload photos to see them here and organize them into collections.</p>
                  <div className="mp-empty-actions">
                    <button type="button" className="btn btn-primary btn-sm btn-with-icon" onClick={() => openUpload()}>
                      <PlusIcon size={15} />
                      Add Photos
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
          <span className="mp-select-bar-hint">
            {tab === 'downloads'
              ? `Remove from downloads only clears your list (Library unchanged; Browse checkmark clears) · ZIP up to ${ZIP_DOWNLOAD_MAX_PHOTOS}`
              : `Long-press or right-click to add · tap to toggle · ZIP up to ${ZIP_DOWNLOAD_MAX_PHOTOS} · choose a collection to assign`}
          </span>
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

function MosaicCell({ photo }: { photo: Photo | undefined }) {
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
  onClick,
}: {
  collection: Collection
  photos: Photo[]
  onClick: () => void
}) {
  const topPhotos = photos.slice(0, 3)
  const single = photos.length === 1

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
        <div className="coll-count">{photos.length} photo{photos.length !== 1 ? 's' : ''}</div>
      </div>
    </div>
  )
}
