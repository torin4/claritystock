import { create } from 'zustand'

type ModalName = 'lightbox' | 'upload' | 'edit' | 'filter' | 'settings' | 'sidebar' | 'notif'

interface UIState {
  lightboxOpen: boolean
  lightboxPhotoId: string | null
  uploadModalOpen: boolean
  editModalPhotoId: string | null
  filterDrawerOpen: boolean
  settingsPanelOpen: boolean
  sidebarOpen: boolean
  notifPopoverOpen: boolean
  /** Increment to tell Sidebar to refetch “Recent collections”. */
  sidebarCollectionsEpoch: number
}

interface UIActions {
  openLightbox: (photoId: string) => void
  closeLightbox: () => void
  openUpload: () => void
  closeUpload: () => void
  openEdit: (photoId: string) => void
  closeEdit: () => void
  openFilter: () => void
  closeFilter: () => void
  openSettings: () => void
  closeSettings: () => void
  setSidebarOpen: (open: boolean) => void
  toggleNotif: () => void
  closeNotif: () => void
  closeAll: () => void
  bumpSidebarCollections: () => void
  /** Single update: close overlays that should not survive a client route change. */
  resetNavigationUi: () => void
}

const defaultState: UIState = {
  lightboxOpen: false,
  lightboxPhotoId: null,
  uploadModalOpen: false,
  editModalPhotoId: null,
  filterDrawerOpen: false,
  settingsPanelOpen: false,
  sidebarOpen: false,
  notifPopoverOpen: false,
  sidebarCollectionsEpoch: 0,
}

export const useUIStore = create<UIState & UIActions>((set) => ({
  ...defaultState,

  openLightbox: (photoId) =>
    set(() => ({
      ...defaultState,
      lightboxOpen: true,
      lightboxPhotoId: photoId,
    })),
  closeLightbox: () => set({ lightboxOpen: false, lightboxPhotoId: null }),

  openUpload: () => set((s) => ({ uploadModalOpen: true, lightboxOpen: false, editModalPhotoId: null, notifPopoverOpen: false })),
  closeUpload: () => set({ uploadModalOpen: false }),

  openEdit: (photoId) =>
    set(() => ({
      ...defaultState,
      editModalPhotoId: photoId,
    })),
  closeEdit: () => set({ editModalPhotoId: null }),

  openFilter: () => set((s) => ({ filterDrawerOpen: true, notifPopoverOpen: false })),
  closeFilter: () => set({ filterDrawerOpen: false }),

  openSettings: () =>
    set(() => ({
      ...defaultState,
      settingsPanelOpen: true,
    })),
  closeSettings: () => set({ settingsPanelOpen: false }),

  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  toggleNotif: () => set((s) => ({ notifPopoverOpen: !s.notifPopoverOpen })),
  closeNotif: () => set({ notifPopoverOpen: false }),

  closeAll: () => set(defaultState),

  bumpSidebarCollections: () =>
    set((s) => ({ sidebarCollectionsEpoch: s.sidebarCollectionsEpoch + 1 })),

  resetNavigationUi: () =>
    set({
      lightboxOpen: false,
      lightboxPhotoId: null,
      filterDrawerOpen: false,
      notifPopoverOpen: false,
      settingsPanelOpen: false,
      editModalPhotoId: null,
      sidebarOpen: false,
    }),
}))
