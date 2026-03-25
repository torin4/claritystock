import { create } from 'zustand'
import type { Notification } from '@/lib/types/database.types'

interface NotificationsState {
  notifications: Notification[]
  unreadCount: number
}

interface NotificationsActions {
  addNotification: (n: {
    downloaderId: string
    downloaderName: string
    createdAt: string
  }) => void
  markAllRead: () => void
  clearAll: () => void
}

export const useNotificationsStore = create<NotificationsState & NotificationsActions>((set) => ({
  notifications: [],
  unreadCount: 0,

  addNotification: (event) =>
    set((s) => {
      const existingIndex = s.notifications.findIndex((n) => n.downloaderId === event.downloaderId)
      const existing = existingIndex >= 0 ? s.notifications[existingIndex] : null

      if (existing) {
        const wasRead = existing.read
        const updated: Notification = {
          ...existing,
          downloaderName: event.downloaderName,
          createdAt: event.createdAt,
          count: existing.count + 1,
          read: false,
        }

        const next = [...s.notifications]
        next.splice(existingIndex, 1, updated)

        // Keep newest-on-top ordering.
        next.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

        return {
          notifications: next.slice(0, 50),
          unreadCount: wasRead ? s.unreadCount + 1 : s.unreadCount,
        }
      }

      const created: Notification = {
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

  markAllRead: () =>
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),

  clearAll: () => set({ notifications: [], unreadCount: 0 }),
}))
