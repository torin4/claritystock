'use client'
import { useEffect, useRef } from 'react'
import { useUIStore } from '@/stores/ui.store'
import { useNotificationsStore } from '@/stores/notifications.store'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function NotificationPopover() {
  const { notifPopoverOpen, closeNotif } = useUIStore()
  const { notifications, markAllRead } = useNotificationsStore()

  const popoverRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!notifPopoverOpen) return

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return

      // Ignore clicks inside the popover.
      if (popoverRef.current && popoverRef.current.contains(target)) return

      // Ignore the toggle button.
      if (target.closest('.s-notif-btn')) return

      closeNotif()
    }

    document.addEventListener('pointerdown', onPointerDown, { capture: true })
    return () => document.removeEventListener('pointerdown', onPointerDown, { capture: true })
  }, [notifPopoverOpen, closeNotif])

  if (!notifPopoverOpen) return null

  const hasUnread = notifications.some(n => !n.read)

  return (
    <div ref={popoverRef} className="s-notif-popover open">
      <div className="s-notif-pop-hdr">
        <span className="s-notif-pop-title">Notifications</span>
        {hasUnread && (
          <span className="s-notif-mark" onClick={markAllRead}>Mark all read</span>
        )}
      </div>
      {!hasUnread ? (
        <div className="s-notif-empty">All caught up ✓</div>
      ) : (
        notifications.map(n => (
          <div key={n.id} className={`s-notif-item ${n.read ? '' : 'unread'}`}>
            <div className={`s-notif-dot ${n.read ? 'read' : ''}`} />
            <div className="s-notif-body">
              <div className="s-notif-text">
                {n.count === 1 ? (
                  <>
                    <strong>{n.downloaderName}</strong> downloaded your photo
                  </>
                ) : (
                  <>
                    <strong>{n.downloaderName}</strong> downloaded {n.count} photos
                  </>
                )}
              </div>
              <div className="s-notif-time">{timeAgo(n.createdAt)}</div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
