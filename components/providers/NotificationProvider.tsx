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

    return () => { supabase.removeChannel(channel) }
  }, [userId, addNotification])

  return null
}
