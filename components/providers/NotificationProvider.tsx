'use client'
import { useEffect } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useNotificationsStore } from '@/stores/notifications.store'
import type { Notification } from '@/lib/types/database.types'

export default function NotificationProvider({ userId }: { userId: string }) {
  const addNotification = useNotificationsStore(s => s.addNotification)

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    // eslint-disable-next-line no-console
    console.log('[notifications] provider mounted', { userId })

    let stopped = false
    const seen = new Set<string>()
    let latestSeenAt: string | null = null

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
          // eslint-disable-next-line no-console
          console.warn('[notifications] poll error', error)
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
          latestSeenAt = rows[0].created_at
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[notifications] poll exception', e)
      }
    }

    const channel = supabase
      .channel('downloads-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'downloads' },
        async (payload) => {
          // eslint-disable-next-line no-console
          console.log('[notifications] downloads INSERT', payload)

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
          addNotification(n)
        }
      )
      .subscribe((status, err) => {
        // eslint-disable-next-line no-console
        console.log('[notifications] subscribe status', status, err ?? null)
      })

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
