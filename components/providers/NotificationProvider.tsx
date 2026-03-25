'use client'
import { useEffect } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useNotificationsStore } from '@/stores/notifications.store'
import type { Notification } from '@/lib/types/database.types'

export default function NotificationProvider({ userId }: { userId: string }) {
  const addNotification = useNotificationsStore(s => s.addNotification)

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()

    let stopped = false
    const seen = new Set<string>()
    const latestSeenAtKey = `claritystock:lastSeenAt:${userId}`
    let latestSeenAt: string | null = null

    try {
      latestSeenAt = window.localStorage.getItem(latestSeenAtKey)
    } catch {
      // localStorage might be blocked (private mode). Notifications will still work, just less "sticky".
    }

    const persistLatestSeenAt = (ts: string) => {
      latestSeenAt = ts
      try {
        window.localStorage.setItem(latestSeenAtKey, ts)
      } catch {
        // ignore
      }
    }

    const updateLatestSeenAtMax = (ts: string) => {
      if (!latestSeenAt) return persistLatestSeenAt(ts)
      const a = new Date(latestSeenAt).getTime()
      const b = new Date(ts).getTime()
      if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return
      persistLatestSeenAt(ts)
    }

    async function fetchRecentDownloads() {
      if (stopped) return
      try {
        const q = supabase
          .from('downloads')
          .select('id, photo_id, downloaded_by, created_at, photos!inner(id, photographer_id), downloader:users!downloaded_by(name)')
          .eq('photos.photographer_id', userId)
          .order('created_at', { ascending: false })
          .limit(10)

        const { data, error } = latestSeenAt
          ? await q.gt('created_at', latestSeenAt)
          : await q

        if (error) {
          return
        }

        const rows = (data ?? []) as Array<{
          id: string
          photo_id: string
          downloaded_by: string
          created_at: string
          downloader?: { name: string | null } | null
        }>

        // Oldest -> newest so the UI feels natural.
        const ascending = [...rows].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

        for (const r of ascending) {
          if (seen.has(r.id)) continue
          seen.add(r.id)
          addNotification({
            id: r.id,
            photoId: r.photo_id,
            photoThumbUrl: null,
            downloaderName: r.downloader?.name ?? 'A team member',
            createdAt: r.created_at,
            read: false,
          } satisfies Notification)
        }

        if (rows.length) {
          persistLatestSeenAt(rows[0].created_at)
        }
      } catch (e) {
      }
    }

    const channel = supabase
      .channel('downloads-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'downloads' },
        async (payload) => {
          // Check if the photo belongs to current user
          const { data: photo } = await supabase
            .from('photos')
            .select('id, title, storage_path, photographer_id')
            .eq('id', payload.new.photo_id)
            .eq('photographer_id', userId)
            .single()

          if (!photo) return // not our photo

          const { data: downloader } = await supabase
            .from('users')
            .select('name')
            .eq('id', payload.new.downloaded_by)
            .single()

          const n: Notification = {
            id: payload.new.id,
            photoId: photo.id,
            photoThumbUrl: null, // would need storage URL
            downloaderName: downloader?.name ?? 'A team member',
            createdAt: payload.new.created_at,
            read: false,
          }

          // Prevent already-notified items from reappearing after a hard refresh.
          updateLatestSeenAtMax(payload.new.created_at)
          addNotification(n)
        }
      )
      .subscribe()

    // Poll fallback: makes notifications work even when Realtime isn't delivering events.
    fetchRecentDownloads()
    const interval = window.setInterval(fetchRecentDownloads, 15000)

    return () => {
      stopped = true
      window.clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [userId, addNotification])

  return null
}
