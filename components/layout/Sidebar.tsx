'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUIStore } from '@/stores/ui.store'
import { useNotificationsStore } from '@/stores/notifications.store'
import { useSignedPhotoUrl } from '@/lib/hooks/useSignedPhotoUrl'
import NotificationPopover from '@/components/modals/NotificationPopover'
import SettingsPanel from '@/components/modals/SettingsPanel'
import BrandTitle from '@/components/layout/BrandTitle'
import UserAvatar from '@/components/layout/UserAvatar'
import type { RecentNavItem } from '@/lib/navigation/recentNav'

// SVG icons as components
function BrowseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  )
}
function MyPhotosIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="1" width="8" height="12" rx="1" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="4" y="1" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  )
}
function InsightsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  )
}
function AdminIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M7 1.5 8.2 4.1l2.8.4-2 2 .5 2.8L7 8.4 4.5 9.3l.5-2.8-2-2 2.8-.4L7 1.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M3 12.5h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}
function BellIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 1.5A3.5 3.5 0 0 0 3.5 5v2.5L2 9h10l-1.5-1.5V5A3.5 3.5 0 0 0 7 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
      <path d="M5.5 9.5a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  )
}

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
}

interface SidebarProps {
  userName: string
  userInitials: string
  /** From `public.users.avatar_url` (Google OAuth). */
  userAvatarUrl: string | null
  userRole: string
  userId: string
  recentItems: RecentNavItem[]
}

function RecentNavThumb({
  thumbnailPath,
  storagePath,
  initialUrl,
}: {
  thumbnailPath: string | null
  storagePath: string | null
  initialUrl?: string | null
}) {
  const path = thumbnailPath ?? storagePath ?? null
  const url = useSignedPhotoUrl(path, { initialUrl: initialUrl ?? null })

  if (!url) {
    return <div style={{ width: '100%', height: '100%', background: 'var(--surface-2)' }} />
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      decoding="async"
      loading="lazy"
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
    />
  )
}

function recentItemHref(item: RecentNavItem): string {
  if (item.kind === 'collection') {
    return `/?collection=${item.id}`
  }
  if (item.collectionId) {
    return `/?collection=${item.collectionId}&photo=${item.id}`
  }
  return `/?photo=${item.id}`
}

export default function Sidebar({
  userName,
  userInitials,
  userAvatarUrl,
  userRole,
  userId,
  recentItems,
}: SidebarProps) {
  const pathname = usePathname()
  const sidebarOpen = useUIStore(s => s.sidebarOpen)
  const openSettings = useUIStore(s => s.openSettings)
  const toggleNotif = useUIStore(s => s.toggleNotif)
  const openUpload = useUIStore(s => s.openUpload)
  const unreadCount = useNotificationsStore(s => s.unreadCount)

  const navItems: NavItem[] = [
    { href: '/', label: 'Browse', icon: <BrowseIcon /> },
  ]
  const mySpaceItems: NavItem[] = [
    { href: '/my-photos', label: 'My Photos', icon: <MyPhotosIcon /> },
    { href: '/insights', label: 'Insights', icon: <InsightsIcon /> },
    ...(userRole === 'admin' ? [{ href: '/admin', label: 'Admin', icon: <AdminIcon /> }] as NavItem[] : []),
  ]

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  const handleNavClick = () => {
    useUIStore.getState().setSidebarOpen(false)
  }

  const sidebarStyle: React.CSSProperties = {
    width: 'var(--sidebar)',
    minWidth: 'var(--sidebar)',
    flexShrink: 0,
    background: 'var(--surface)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
    position: 'relative',
  }

  return (
    <>
      <nav
        id="sidebar"
        className={`sidebar ${sidebarOpen ? 'open' : ''}`}
        style={sidebarStyle}
      >
        {/* Logo */}
        <div style={{
          padding: '20px 16px 18px',
          borderBottom: '1px solid var(--border)',
        }}>
          <BrandTitle size="sidebar" stackWordmark />
        </div>

        {/* Nav */}
        <div
          className="sidebar-nav-scroll"
          style={{
            flex: 1,
            minHeight: 0,
            padding: '8px 6px',
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {/* Library section */}
          <span className="s-section-lbl" style={{ color: 'var(--label-library)' }}>Library</span>
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`ni ${isActive(item.href) ? 'active' : ''}`}
              onClick={handleNavClick}
            >
              <span className="ni-ic" style={{ color: isActive(item.href) ? 'var(--accent)' : undefined }}>{item.icon}</span>
              {item.label}
            </Link>
          ))}

          {/* Add Photos */}
          <button
            className="ni"
            onClick={() => { openUpload(); useUIStore.getState().setSidebarOpen(false) }}
            style={{ color: 'var(--accent)' }}
          >
            <span className="ni-ic">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            </span>
            Add Photos
          </button>

          {/* My Space section */}
          <span className="s-section-lbl" style={{ marginTop: '8px' }}>My Space</span>
          {mySpaceItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`ni ${isActive(item.href) ? 'active' : ''}`}
              onClick={handleNavClick}
            >
              <span className="ni-ic" style={{ color: isActive(item.href) ? 'var(--accent)' : undefined }}>{item.icon}</span>
              {item.label}
            </Link>
          ))}

          {/* Recents: others’ collections + their uploads (mixed by activity) */}
          {recentItems.length > 0 && (
            <>
              <span className="s-section-lbl" style={{ marginTop: '8px' }}>Recents</span>
              {recentItems.map((item) => (
                <Link
                  key={item.kind === 'collection' ? `c-${item.id}` : `p-${item.id}`}
                  href={recentItemHref(item)}
                  className="ni"
                  onClick={handleNavClick}
                  style={{ gap: '8px' }}
                >
                  <div style={{
                    width: '36px',
                    height: '28px',
                    borderRadius: '3px',
                    background: 'var(--surface-2)',
                    flexShrink: 0,
                    overflow: 'hidden',
                  }}>
                    {item.kind === 'collection' ? (
                      <RecentNavThumb
                        thumbnailPath={item.photos?.[0]?.thumbnail_path ?? null}
                        storagePath={item.photos?.[0]?.storage_path ?? null}
                        initialUrl={item.photos?.[0]?.thumbnail_url ?? null}
                      />
                    ) : (
                      <RecentNavThumb
                        thumbnailPath={item.thumbnail_path}
                        storagePath={item.storage_path}
                        initialUrl={item.thumbnail_url ?? null}
                      />
                    )}
                  </div>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px' }}>
                    {item.kind === 'collection' ? item.name : item.title}
                  </span>
                </Link>
              ))}
            </>
          )}
        </div>

        {/* Notification bell */}
        <div style={{ padding: '4px 6px', borderTop: '1px solid var(--border)', position: 'relative' }}>
          <button
            className="s-notif-btn"
            onClick={toggleNotif}
          >
            <BellIcon />
            <span className="s-notif-label">Notifications</span>
            {unreadCount > 0 && (
              <span className="s-notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
            )}
          </button>
          <NotificationPopover />
        </div>

        {/* User profile */}
        <div style={{ padding: '10px 6px' }}>
          <button className="s-user-inner" onClick={openSettings} style={{ width: '100%' }}>
            <UserAvatar avatarUrl={userAvatarUrl} initials={userInitials} size={40} />
            <div>
              <div className="s-name">{userName}</div>
              <div className="s-role">{userRole}</div>
            </div>
          </button>
        </div>
      </nav>

      <SettingsPanel
        userId={userId}
        userName={userName}
        userInitials={userInitials}
        userAvatarUrl={userAvatarUrl}
        userRole={userRole}
      />
    </>
  )
}
