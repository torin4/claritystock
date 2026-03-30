import { create } from 'zustand'
import type { AiTagResult, ExifResult, PhotoFormValues } from '@/lib/types/database.types'

export type UploadStep = 1 | 2 | 3

export interface LibraryDuplicateMatch {
  id: string
  title: string
}

export interface UploadFileState {
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
  markReviewed: (i: number) => void
  markPublished: (i: number) => void
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
