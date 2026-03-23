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
import { deleteCollection } from '@/lib/actions/collections.actions'
import { deletePhotos } from '@/lib/actions/photos.actions'
import { downloadPhotosZip, ZIP_DOWNLOAD_MAX_PHOTOS } from '@/lib/photos/zipDownload'
import { removeMyDownloads } from '@/lib/actions/downloads.actions'
import { useInView } from '@/lib/hooks/useInView'
import type { Photo, Collection } from '@/lib/types/database.types'

interface CollectionWithPhotos extends Collection {
  photos: Photo[]
}

interface Props {
  initialPhotos: Photo[]
  initialDownloadedPhotos: Photo[]
  collections: CollectionWithPhotos[]
  userId: string
}

export default function MyPhotosClient({
  initialPhotos,
  initialDownloadedPhotos,
  collections,
  userId,
}: Props) {
  const router = useRouter()
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos)
  const [downloadedPhotos, setDownloadedPhotos] = useState<Photo[]>(initialDownloadedPhotos)
  const [localCollections, setLocalCollections] = useState(collections)
  const [tab, setTab] = useState<'collections' | 'photos' | 'downloads'>('collections')
  const [search, setSearch] = useState('')
  const [drillColl, setDrillColl] = useState<CollectionWithPhotos | null>(null)
  const [deletingColl, setDeletingColl] = useState(false)
  const [createCollOpen, setCreateCollOpen] = useState(false)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [zipBusy, setZipBusy] = useState(false)
  const [removeDownloadsBusy, setRemoveDownloadsBusy] = useState(false)
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
    setDownloadedPhotos(initialDownloadedPhotos)
  }, [initialDownloadedPhotos])

  useEffect(() => {
    setLocalCollections(collections)
  }, [collections])

  const refresh = async () => {
    const supabase = getSupabaseBrowserClient()
    const { data } = await supabase
      .from('photos')
      .select('*, collection:collections!collection_id(id, name, category)')
      .eq('photographer_id', userId)
      .order('created_at', { ascending: false })
    setPhotos((data as Photo[]) ?? [])
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

  const totalDownloads = photos.reduce((sum, p) => sum + (p.downloads_count ?? 0), 0)

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Page header */}
      <div className="ph">
        <div>
          {drillColl && (
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-3)', cursor: 'pointer', marginBottom: 6 }}
              onClick={() => setDrillColl(null)}
            >
              ← All collections
            </div>
          )}
          <div className="ph-title">{drillColl ? drillColl.name : 'My Photos'}</div>
          <div className="ph-sub">
            {!drillColl && tab === 'downloads' ? (
              `${downloadedPhotos.length} photo${downloadedPhotos.length !== 1 ? 's' : ''} you've downloaded`
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
            className={`my-tab ${tab === 'collections' ? 'active' : ''}`}
            onClick={() => setTab('collections')}
          >Collections</button>
          <button
            className={`my-tab ${tab === 'photos' ? 'active' : ''}`}
            onClick={() => setTab('photos')}
          >All photos</button>
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
                  photos={photos.filter(p => p.collection_id === coll.id)}
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
            <div className="drill-hdr">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                <button className="drill-back" onClick={() => { setDrillColl(null); setTab('collections') }}>
                  ← All collections
                </button>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{drillColl.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                    {filteredPhotos.length} photos
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
                  className="btn-del-sm"
                  disabled={deletingColl}
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
              onFavoriteToggle={() => {}}
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
              {filteredDownloadedPhotos.length} photos
            </span>
          </div>

          {filteredDownloadedPhotos.length === 0 ? (
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
              : `Long-press or right-click to add · tap to toggle · ZIP up to ${ZIP_DOWNLOAD_MAX_PHOTOS} photos`}
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={exitSelection}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!selectedIds.length || zipBusy || bulkDeleting || removeDownloadsBusy}
            title={selectedIds.length > ZIP_DOWNLOAD_MAX_PHOTOS ? `Max ${ZIP_DOWNLOAD_MAX_PHOTOS} photos per ZIP` : undefined}
            onClick={handleDownloadZip}
          >
            {zipBusy ? 'Zipping…' : 'Download ZIP'}
          </button>
          <button
            type="button"
            className={tab === 'downloads' ? 'btn-remove-downloads' : 'btn-del-sm'}
            disabled={!selectedIds.length || bulkDeleting || zipBusy || removeDownloadsBusy}
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
