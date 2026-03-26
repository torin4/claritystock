'use client'
import { useEffect } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useNotificationsStore } from '@/stores/notifications.store'
import { useUIStore } from '@/stores/ui.store'

const BULK_SEEN_KEY = (uid: string) => `claritystock:lastSeenBulkCompletedAt:${uid}`

function rememberBulkCompletedAt(userId: string, completedAt: string) {
  const key = BULK_SEEN_KEY(userId)
  try {
    const prev = window.localStorage.getItem(key)
    if (!prev || new Date(completedAt).getTime() > new Date(prev).getTime()) {
      window.localStorage.setItem(key, completedAt)
    }
  } catch {
    // ignore
  }
}

export default function NotificationProvider({ userId }: { userId: string }) {
  const addDownloadNotification = useNotificationsStore((s) => s.addDownloadNotification)
  const addBulkUploadNotification = useNotificationsStore((s) => s.addBulkUploadNotification)
  const setUserId = useNotificationsStore((s) => s.setUserId)

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()

    let stopped = false
    const seen = new Set<string>()
    const seenBulkJobs = new Set<string>()
    const latestSeenAtKey = `claritystock:lastSeenAt:${userId}`
    setUserId(userId)

    try {
      const bulkKey = BULK_SEEN_KEY(userId)
      if (!window.localStorage.getItem(bulkKey)) {
        window.localStorage.setItem(bulkKey, new Date().toISOString())
      }
    } catch {
      // ignore
    }

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
          addDownloadNotification({
            downloaderId: r.downloaded_by,
            downloaderName: r.downloader?.name ?? 'A team member',
            createdAt: r.created_at,
          })
        }
      } catch (e) {
      }
    }

    async function fetchRecentBulkJobs() {
      if (stopped) return
      try {
        let since: string | null = null
        try {
          since = window.localStorage.getItem(BULK_SEEN_KEY(userId))
        } catch {
          since = null
        }
        if (!since) return

        const q = supabase
          .from('bulk_upload_jobs')
          .select('id, completed_at, summary, status')
          .eq('photographer_id', userId)
          .eq('status', 'completed')
          .gt('completed_at', since)
          .order('completed_at', { ascending: true })

        const { data, error } = await q
        if (error || !data?.length) return

        for (const row of data) {
          const jid = row.id as string
          if (seenBulkJobs.has(jid)) continue
          seenBulkJobs.add(jid)
          const summary = (row.summary ?? {}) as {
            success_count?: number
            failed_count?: number
            needs_location_count?: number
          }
          const completedAt = row.completed_at as string
          addBulkUploadNotification({
            jobId: jid,
            createdAt: completedAt,
            successCount: summary.success_count ?? 0,
            failedCount: summary.failed_count ?? 0,
            needsLocationCount: summary.needs_location_count ?? 0,
          })
          rememberBulkCompletedAt(userId, completedAt)
        }
      } catch {
        // ignore
      }
    }

    function notifyBulkJobCompleted(row: {
      id: string
      completed_at: string | null
      summary: unknown
    }) {
      if (!row.completed_at) return
      if (seenBulkJobs.has(row.id)) return
      seenBulkJobs.add(row.id)
      const summary = (row.summary ?? {}) as {
        success_count?: number
        failed_count?: number
        needs_location_count?: number
      }
      addBulkUploadNotification({
        jobId: row.id,
        createdAt: row.completed_at,
        successCount: summary.success_count ?? 0,
        failedCount: summary.failed_count ?? 0,
        needsLocationCount: summary.needs_location_count ?? 0,
      })
      const ui = useUIStore.getState()
      if ((summary.failed_count ?? 0) > 0) ui.openBulkReview(row.id)
      if ((summary.needs_location_count ?? 0) > 0) ui.openBulkUpdate(row.id)
      rememberBulkCompletedAt(userId, row.completed_at)
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

          addDownloadNotification({
            downloaderId: payload.new.downloaded_by,
            downloaderName: downloader?.name ?? 'A team member',
            createdAt: payload.new.created_at,
          })
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bulk_upload_jobs', filter: `photographer_id=eq.${userId}` },
        (payload) => {
          const next = payload.new as {
            status?: string
            id?: string
            photographer_id?: string
            completed_at?: string | null
            summary?: unknown
          }
          if (next.photographer_id && next.photographer_id !== userId) return
          if (next.status !== 'completed' || !next.id || !next.completed_at) return
          notifyBulkJobCompleted({
            id: next.id,
            completed_at: next.completed_at,
            summary: next.summary,
          })
        },
      )
      .subscribe()

    // Poll fallback: makes notifications work even when Realtime isn't delivering events.
    fetchRecentDownloads()
    fetchRecentBulkJobs()
    const interval = window.setInterval(() => {
      void fetchRecentDownloads()
      void fetchRecentBulkJobs()
    }, 15000)

    return () => {
      stopped = true
      window.clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [userId, addDownloadNotification, addBulkUploadNotification, setUserId])

  return null
}
