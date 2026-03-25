import { create } from 'zustand'

/**
 * Client override for “hide my photos in Browse” so the grid refetches immediately after
 * Settings saves, without waiting for RSC `router.refresh()` to propagate.
 * Cleared when server prop matches the override.
 */
interface BrowsePrefsState {
  hideOwnPhotosInBrowseOverride: boolean | null
  setHideOwnPhotosInBrowseOverride: (v: boolean | null) => void
}

export const useBrowsePrefsStore = create<BrowsePrefsState>((set) => ({
  hideOwnPhotosInBrowseOverride: null,
  setHideOwnPhotosInBrowseOverride: (v) => set({ hideOwnPhotosInBrowseOverride: v }),
}))
