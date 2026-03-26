import { create } from 'zustand'

/** Download aggregation (existing behavior). */
export interface DownloadNotification {
  kind: 'download'
  id: string
  downloaderId: string
  downloaderName: string
  createdAt: string
  count: number
  read: boolean
}

/** Bulk ZIP job finished — tap to review failures. */
export interface BulkUploadNotification {
  kind: 'bulk_upload'
  id: string
  jobId: string
  createdAt: string
  successCount: number
  failedCount: number
  read: boolean
}

export type AppNotification = DownloadNotification | BulkUploadNotification

interface NotificationsState {
  notifications: AppNotification[]
  unreadCount: number
  userId: string | null
}

interface NotificationsActions {
  addDownloadNotification: (event: {
    downloaderId: string
    downloaderName: string
    createdAt: string
  }) => void
  addBulkUploadNotification: (event: {
    jobId: string
    createdAt: string
    successCount: number
    failedCount: number
  }) => void
  markBulkRead: (jobId: string) => void
  setUserId: (userId: string) => void
  markAllRead: () => void
  clearAll: () => void
}

export const useNotificationsStore = create<NotificationsState & NotificationsActions>((set) => ({
  notifications: [],
  unreadCount: 0,
  userId: null,

  addDownloadNotification: (event) =>
    set((s) => {
      const existingIndex = s.notifications.findIndex(
        (n) => n.kind === 'download' && n.downloaderId === event.downloaderId,
      )
      const existing =
        existingIndex >= 0 ? (s.notifications[existingIndex] as DownloadNotification) : null

      if (existing) {
        const wasRead = existing.read
        const updated: DownloadNotification = {
          ...existing,
          downloaderName: event.downloaderName,
          createdAt: event.createdAt,
          count: existing.count + 1,
          read: false,
        }

        const next = [...s.notifications]
        next.splice(existingIndex, 1, updated)

        next.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

        return {
          notifications: next.slice(0, 50),
          unreadCount: wasRead ? s.unreadCount + 1 : s.unreadCount,
        }
      }

      const created: DownloadNotification = {
        kind: 'download',
        id: event.downloaderId,
        downloaderId: event.downloaderId,
        downloaderName: event.downloaderName,
        createdAt: event.createdAt,
        count: 1,
        read: false,
      }

      return {
        notifications: [created, ...s.notifications].slice(0, 50),
        unreadCount: s.unreadCount + 1,
      }
    }),

  addBulkUploadNotification: (event) =>
    set((s) => {
      const n: BulkUploadNotification = {
        kind: 'bulk_upload',
        id: `bulk:${event.jobId}`,
        jobId: event.jobId,
        createdAt: event.createdAt,
        successCount: event.successCount,
        failedCount: event.failedCount,
        read: false,
      }
      const existingIdx = s.notifications.findIndex(
        (x) => x.kind === 'bulk_upload' && x.jobId === event.jobId,
      )
      if (existingIdx >= 0) {
        const prev = s.notifications[existingIdx] as BulkUploadNotification
        const sameCounts =
          prev.successCount === n.successCount && prev.failedCount === n.failedCount
        if (sameCounts) return s
        const next = [...s.notifications]
        next[existingIdx] = {
          ...prev,
          successCount: n.successCount,
          failedCount: n.failedCount,
          createdAt: n.createdAt,
        }
        next.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        return { notifications: next.slice(0, 50) }
      }
      const filtered = s.notifications.filter(
        (x) => !(x.kind === 'bulk_upload' && x.jobId === event.jobId),
      )
      return {
        notifications: [n, ...filtered].slice(0, 50),
        unreadCount: s.unreadCount + 1,
      }
    }),

  markBulkRead: (jobId) =>
    set((s) => {
      let dec = 0
      const next = s.notifications.map((n) => {
        if (n.kind === 'bulk_upload' && n.jobId === jobId && !n.read) {
          dec = 1
          return { ...n, read: true }
        }
        return n
      })
      return {
        notifications: next,
        unreadCount: Math.max(0, s.unreadCount - dec),
      }
    }),

  setUserId: (userId) => set({ userId }),

  markAllRead: () =>
    set((s) => {
      const uid = s.userId
      if (uid) {
        const maxCreatedAt = s.notifications.reduce<string | null>((acc, n) => {
          if (!acc) return n.createdAt
          return new Date(n.createdAt).getTime() > new Date(acc).getTime() ? n.createdAt : acc
        }, null)

        const key = `claritystock:lastSeenAt:${uid}`
        try {
          window.localStorage.setItem(key, maxCreatedAt ?? new Date().toISOString())
        } catch {
          // ignore
        }

        try {
          window.localStorage.setItem(`claritystock:lastSeenBulkCompletedAt:${uid}`, new Date().toISOString())
        } catch {
          // ignore
        }
      }

      return { notifications: [], unreadCount: 0 }
    }),

  clearAll: () => set({ notifications: [], unreadCount: 0 }),
}))
