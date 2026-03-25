'use client'
import { useEffect } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useNotificationsStore } from '@/stores/notifications.store'

export default function NotificationProvider({ userId }: { userId: string }) {
  const addNotification = useNotificationsStore(s => s.addNotification)
  const setUserId = useNotificationsStore(s => s.setUserId)

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()

    let stopped = false
    const seen = new Set<string>()
    const latestSeenAtKey = `claritystock:lastSeenAt:${userId}`
    setUserId(userId)

    async function fetchRecentDownloads() {
      if (stopped) return
      try {
        let latestSeenAt: string | null = null
        try {
          latestSeenAt = window.localStorage.getItem(latestSeenAtKey)
        } catch {
          // ignore
        }

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
            downloaderId: r.downloaded_by,
            downloaderName: r.downloader?.name ?? 'A team member',
            createdAt: r.created_at,
          })
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

          addNotification({
            downloaderId: payload.new.downloaded_by,
            downloaderName: downloader?.name ?? 'A team member',
            createdAt: payload.new.created_at,
          })
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
  }, [userId, addNotification, setUserId])

  return null
}
