import { create } from 'zustand'

type ModalName = 'lightbox' | 'upload' | 'edit' | 'filter' | 'settings' | 'sidebar' | 'notif'

interface UIState {
  lightboxOpen: boolean
  lightboxPhotoId: string | null
  uploadModalOpen: boolean
  /** When set, UploadModal shows the bulk category/location update UI for this job. */
  bulkUpdateJobId: string | null
  bulkUploadModalOpen: boolean
  /** When set, BulkUploadReviewModal shows this job. */
  bulkReviewJobId: string | null
  editModalPhotoId: string | null
  filterDrawerOpen: boolean
  settingsPanelOpen: boolean
  sidebarOpen: boolean
  notifPopoverOpen: boolean
  /** Increment to tell Sidebar to refetch “Recent collections”. */
  sidebarCollectionsEpoch: number
  /** Bulk ZIP import running in the background (persists when modal is closed). */
  bulkUploadProgress: { total: number; completed: number; label: string; inFlight?: boolean } | null
}

interface UIActions {
  openLightbox: (photoId: string) => void
  closeLightbox: () => void
  openUpload: () => void
  closeUpload: () => void
  openBulkUpdate: (jobId: string) => void
  closeBulkUpdate: () => void
  openBulkUpload: () => void
  closeBulkUpload: () => void
  openBulkReview: (jobId: string) => void
  closeBulkReview: () => void
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
  setBulkUploadProgress: (p: UIState['bulkUploadProgress']) => void
}

const defaultState: UIState = {
  lightboxOpen: false,
  lightboxPhotoId: null,
  uploadModalOpen: false,
  bulkUpdateJobId: null,
  bulkUploadModalOpen: false,
  bulkReviewJobId: null,
  editModalPhotoId: null,
  filterDrawerOpen: false,
  settingsPanelOpen: false,
  sidebarOpen: false,
  notifPopoverOpen: false,
  sidebarCollectionsEpoch: 0,
  bulkUploadProgress: null,
}

export const useUIStore = create<UIState & UIActions>((set) => ({
  ...defaultState,

  openLightbox: (photoId) =>
    set((s) => ({
      ...defaultState,
      bulkUploadProgress: s.bulkUploadProgress,
      lightboxOpen: true,
      lightboxPhotoId: photoId,
    })),
  closeLightbox: () => set({ lightboxOpen: false, lightboxPhotoId: null }),

  openUpload: () =>
    set((s) => ({
      uploadModalOpen: true,
      bulkUpdateJobId: null,
      bulkUploadModalOpen: false,
      lightboxOpen: false,
      editModalPhotoId: null,
      notifPopoverOpen: false,
    })),
  closeUpload: () => set({ uploadModalOpen: false, bulkUpdateJobId: null }),

  openBulkUpdate: (jobId) =>
    set((s) => ({
      ...s,
      uploadModalOpen: true,
      bulkUpdateJobId: jobId,
      bulkUploadModalOpen: false,
      lightboxOpen: false,
      lightboxPhotoId: null,
      editModalPhotoId: null,
      filterDrawerOpen: false,
      settingsPanelOpen: false,
      sidebarOpen: false,
      notifPopoverOpen: false,
    })),
  closeBulkUpdate: () => set({ bulkUpdateJobId: null, uploadModalOpen: false }),

  openBulkUpload: () =>
    set((s) => ({
      bulkUploadModalOpen: true,
      uploadModalOpen: false,
      lightboxOpen: false,
      editModalPhotoId: null,
      notifPopoverOpen: false,
    })),
  closeBulkUpload: () => set({ bulkUploadModalOpen: false }),

  openBulkReview: (jobId) =>
    set({
      bulkReviewJobId: jobId,
      notifPopoverOpen: false,
      uploadModalOpen: false,
      bulkUploadModalOpen: false,
    }),
  closeBulkReview: () => set({ bulkReviewJobId: null }),

  openEdit: (photoId) =>
    set((s) => ({
      ...defaultState,
      bulkUploadProgress: s.bulkUploadProgress,
      /** Keep bulk review open so “Add location” can return to the list after editing. */
      bulkReviewJobId: s.bulkReviewJobId,
      editModalPhotoId: photoId,
    })),
  closeEdit: () => set({ editModalPhotoId: null }),

  openFilter: () => set((s) => ({ filterDrawerOpen: true, notifPopoverOpen: false })),
  closeFilter: () => set({ filterDrawerOpen: false }),

  openSettings: () =>
    set((s) => ({
      ...defaultState,
      bulkUploadProgress: s.bulkUploadProgress,
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
      uploadModalOpen: false,
      bulkUpdateJobId: null,
      filterDrawerOpen: false,
      notifPopoverOpen: false,
      settingsPanelOpen: false,
      editModalPhotoId: null,
      sidebarOpen: false,
      bulkUploadModalOpen: false,
      bulkReviewJobId: null,
    }),

  setBulkUploadProgress: (p) => set({ bulkUploadProgress: p }),
}))
