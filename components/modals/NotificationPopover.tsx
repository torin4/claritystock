'use client'
import { useEffect, useMemo, useRef } from 'react'
import { useUIStore } from '@/stores/ui.store'
import { useNotificationsStore } from '@/stores/notifications.store'
import type { AppNotification } from '@/stores/notifications.store'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function notificationText(n: AppNotification): React.ReactNode {
  if (n.kind === 'download') {
    return n.count === 1 ? (
      <>
        <strong>{n.downloaderName}</strong> downloaded your photo
      </>
    ) : (
      <>
        <strong>{n.downloaderName}</strong> downloaded {n.count} photos
      </>
    )
  }
  const loc = n.needsLocationCount > 0
  const fail = n.failedCount > 0
  return (
    <>
      Advanced upload: <strong>{n.successCount}</strong> published
      {fail ? (
        <>
          , <strong>{n.failedCount}</strong> failed
          {loc ? (
            <>
              , <strong>{n.needsLocationCount}</strong> need updating (location)
            </>
          ) : null}
          {' — Tap to see results.'}
        </>
      ) : loc ? (
        <>
          {' — '}
          <strong>{n.needsLocationCount}</strong> need updating (add location) — Tap to see results.
        </>
      ) : (
        ' — All set ✓'
      )}
    </>
  )
}

export default function NotificationPopover() {
  const { notifPopoverOpen, closeNotif, openBulkReview, openBulkUpdate } = useUIStore()
  const { notifications, markAllRead, markBulkRead } = useNotificationsStore()

  const popoverRef = useRef<HTMLDivElement | null>(null)

  const sorted = useMemo(
    () => [...notifications].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [notifications],
  )

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

  const hasUnread = notifications.some((n) => !n.read)

  const handleRowClick = (n: AppNotification) => {
    if (n.kind === 'bulk_upload') {
      markBulkRead(n.jobId)
      if (n.failedCount > 0) openBulkReview(n.jobId)
      if (n.needsLocationCount > 0) openBulkUpdate(n.jobId)
      closeNotif()
    }
  }

  return (
    <div ref={popoverRef} className="s-notif-popover open">
      <div className="s-notif-pop-hdr">
        <span className="s-notif-pop-title">Notifications</span>
        {hasUnread && (
          <span className="s-notif-mark" onClick={markAllRead}>
            Mark all read
          </span>
        )}
      </div>
      {!hasUnread ? (
        <div className="s-notif-empty">All caught up ✓</div>
      ) : (
        sorted.map((n) => (
          <div
            key={n.id}
            className={`s-notif-item ${n.read ? '' : 'unread'} ${n.kind === 'bulk_upload' ? 's-notif-clickable' : ''}`}
            onClick={() => handleRowClick(n)}
            style={n.kind === 'bulk_upload' ? { cursor: 'pointer' } : undefined}
            role={n.kind === 'bulk_upload' ? 'button' : undefined}
            tabIndex={n.kind === 'bulk_upload' ? 0 : undefined}
            onKeyDown={
              n.kind === 'bulk_upload'
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleRowClick(n)
                    }
                  }
                : undefined
            }
          >
            <div className={`s-notif-dot ${n.read ? 'read' : ''}`} />
            <div className="s-notif-body">
              <div className="s-notif-text">{notificationText(n)}</div>
              <div className="s-notif-time">{timeAgo(n.createdAt)}</div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
