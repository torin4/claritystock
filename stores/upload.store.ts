import { create } from 'zustand'
import type { AiTagResult, ExifResult, PhotoFormValues } from '@/lib/types/database.types'

export type UploadStep = 1 | 2 | 3

export interface LibraryDuplicateMatch {
  id: string
  title: string
}

export interface UploadFileState {
  /** Stable key for React lists (survives reorder/remove). */
  uploadId: string
  file: File
  exif: ExifResult | null
  ai: AiTagResult | null
  /** True while this file’s Gemini vision request is in flight */
  aiScanning: boolean
  form: PhotoFormValues
  reviewed: boolean
  published: boolean
  error: string | null
  /** SHA-256 hex of original bytes; null until computed */
  contentHash: string | null
  /** Existing library rows with the same content hash */
  libraryDuplicates: LibraryDuplicateMatch[] | null
}

interface UploadState {
  step: UploadStep
  files: UploadFileState[]
  currentIndex: number
}

interface UploadActions {
  setFiles: (files: File[]) => void
  setStep: (step: UploadStep) => void
  setCurrentIndex: (i: number) => void
  setExif: (i: number, exif: ExifResult) => void
  setAiScanning: (i: number, scanning: boolean) => void
  setAi: (i: number, ai: AiTagResult) => void
  updateForm: (i: number, partial: Partial<PhotoFormValues>) => void
  /** Copy collection + neighborhood + sub-area from the current photo to every other photo (titles, category, tags unchanged). */
  applySharedMetadataFromCurrentToAll: () => void
  /** Every photo uses the current photo’s new-collection name (clears existing collection picks). */
  applyNewCollectionFromCurrentToAllPhotos: () => void
  /** Set every photo to this existing collection (clears new-collection name on all). */
  assignCollectionIdToAll: (collectionId: string) => void
  markReviewed: (i: number) => void
  markPublished: (i: number) => void
  /** Remove one photo from the batch; empty batch returns to step 1. */
  removeFileAt: (index: number) => void
  setError: (i: number, error: string | null) => void
  /** One entry per file, same order as files[] — sets contentHash + libraryDuplicates after hashing */
  setAllFileFingerprints: (
    fingerprints: { contentHash: string; libraryDuplicates: LibraryDuplicateMatch[] }[],
  ) => void
  reset: () => void
}

const defaultForm = (): PhotoFormValues => ({
  title: '',
  category: null,
  collection_id: null,
  new_collection_name: null,
  neighborhood: null,
  subarea: null,
  captured_date: null,
  tags: [],
  notes: null,
})

export const useUploadStore = create<UploadState & UploadActions>((set) => ({
  step: 1,
  files: [],
  currentIndex: 0,

  setFiles: (files) =>
    set({
      files: files.map((file) => ({
        uploadId: crypto.randomUUID(),
        file,
        exif: null,
        ai: null,
        aiScanning: false,
        form: defaultForm(),
        reviewed: false,
        published: false,
        error: null,
        contentHash: null,
        libraryDuplicates: null,
      })),
    }),

  setStep: (step) => set({ step }),
  setCurrentIndex: (i) => set({ currentIndex: i }),

  setExif: (i, exif) =>
    set((s) => {
      const files = [...s.files]
      files[i] = { ...files[i], exif }
      return { files }
    }),

  setAiScanning: (i, scanning) =>
    set((s) => {
      const files = [...s.files]
      if (!files[i]) return {}
      files[i] = { ...files[i], aiScanning: scanning }
      return { files }
    }),

  setAi: (i, ai) =>
    set((s) => {
      const files = [...s.files]
      if (!files[i]) return {}
      const curForm = files[i].form
      const nextTitle = typeof ai.title === 'string' ? ai.title.trim() : ''
      const nextTags = Array.isArray(ai.tags) ? ai.tags.filter(Boolean) : []
      const nextCategory = ai.category
      files[i] = {
        ...files[i],
        ai,
        aiScanning: false,
        form: {
          ...curForm,
          // Only apply AI values when they’re present; don’t overwrite user edits with blanks.
          ...(nextTitle ? { title: curForm.title?.trim() ? curForm.title : nextTitle } : {}),
          ...(nextTags.length ? { tags: (curForm.tags?.length ? curForm.tags : nextTags) } : {}),
          ...(nextCategory ? { category: curForm.category ?? nextCategory } : {}),
        },
      }
      return { files }
    }),

  updateForm: (i, partial) =>
    set((s) => {
      const files = [...s.files]
      files[i] = { ...files[i], form: { ...files[i].form, ...partial } }
      return { files }
    }),

  applySharedMetadataFromCurrentToAll: () =>
    set((s) => {
      const i = s.currentIndex
      const row = s.files[i]
      if (!row || s.files.length < 2) return {}
      const { collection_id, new_collection_name, neighborhood, subarea } = row.form
      return {
        files: s.files.map((f, j) =>
          j === i
            ? f
            : {
                ...f,
                form: {
                  ...f.form,
                  collection_id,
                  new_collection_name,
                  neighborhood,
                  subarea,
                },
              },
        ),
      }
    }),

  applyNewCollectionFromCurrentToAllPhotos: () =>
    set((s) => {
      const i = s.currentIndex
      const row = s.files[i]?.form
      const name = row?.new_collection_name?.trim()
      if (!name || s.files.length < 2) return {}
      return {
        files: s.files.map((f) => ({
          ...f,
          form: {
            ...f.form,
            collection_id: null,
            new_collection_name: name,
          },
        })),
      }
    }),

  assignCollectionIdToAll: (collectionId) =>
    set((s) => ({
      files: s.files.map((f) => ({
        ...f,
        form: {
          ...f.form,
          collection_id: collectionId,
          new_collection_name: null,
        },
      })),
    })),

  markReviewed: (i) =>
    set((s) => {
      const files = [...s.files]
      files[i] = { ...files[i], reviewed: true }
      return { files }
    }),

  markPublished: (i) =>
    set((s) => {
      const files = [...s.files]
      files[i] = { ...files[i], published: true }
      return { files }
    }),

  removeFileAt: (index) =>
    set((s) => {
      if (index < 0 || index >= s.files.length) return {}
      const files = s.files.filter((_, j) => j !== index)
      const n = files.length
      if (n === 0) {
        return { files: [], currentIndex: 0, step: 1 }
      }
      let currentIndex = s.currentIndex
      if (index < currentIndex) currentIndex -= 1
      else if (index === currentIndex) currentIndex = Math.min(index, n - 1)
      return {
        files,
        currentIndex: Math.max(0, Math.min(currentIndex, n - 1)),
        step: s.step,
      }
    }),

  setError: (i, error) =>
    set((s) => {
      const files = [...s.files]
      files[i] = { ...files[i], error }
      return { files }
    }),

  setAllFileFingerprints: (fingerprints) =>
    set((s) => {
      if (fingerprints.length !== s.files.length) return {}
      return {
        files: s.files.map((f, i) => ({
          ...f,
          contentHash: fingerprints[i].contentHash,
          libraryDuplicates: fingerprints[i].libraryDuplicates,
        })),
      }
    }),

  reset: () => set({ step: 1, files: [], currentIndex: 0 }),
}))
