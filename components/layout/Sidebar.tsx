'use client'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useUIStore } from '@/stores/ui.store'
import { useNotificationsStore } from '@/stores/notifications.store'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useSignedPhotoUrl } from '@/lib/hooks/useSignedPhotoUrl'
import NotificationPopover from '@/components/modals/NotificationPopover'
import SettingsPanel from '@/components/modals/SettingsPanel'
import BrandTitle from '@/components/layout/BrandTitle'

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

interface Collection {
  id: string
  name: string
  photos?: { storage_path: string | null; thumbnail_path: string | null }[]
}

interface SidebarProps {
  userName: string
  userInitials: string
  userRole: string
  userId: string
}

function RecentCollectionThumb({ collection }: { collection: Collection }) {
  const path = collection.photos?.[0]?.thumbnail_path ?? collection.photos?.[0]?.storage_path ?? null
  const url = useSignedPhotoUrl(path)

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

export default function Sidebar({ userName, userInitials, userRole, userId }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { sidebarOpen, openSettings, toggleNotif, openUpload } = useUIStore()
  const sidebarCollectionsEpoch = useUIStore(s => s.sidebarCollectionsEpoch)
  const unreadCount = useNotificationsStore(s => s.unreadCount)
  const [collections, setCollections] = useState<Collection[]>([])

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    ;(async () => {
      // Global recent collections excluding your own collections.
      const { data } = await supabase
        .from('collections')
        .select('id, name, created_by, photos(storage_path, thumbnail_path)')
        .neq('created_by', userId)
        .order('created_at', { ascending: false })
        .limit(8)
      setCollections((data as Collection[]) ?? [])
    })()
  }, [sidebarCollectionsEpoch, userId])

  const navItems: NavItem[] = [
    { href: '/', label: 'Browse', icon: <BrowseIcon /> },
  ]
  const mySpaceItems: NavItem[] = [
    { href: '/my-photos', label: 'My Photos', icon: <MyPhotosIcon /> },
    { href: '/insights', label: 'Insights', icon: <InsightsIcon /> },
  ]

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

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
        <div style={{ flex: 1, padding: '8px 6px', display: 'flex', flexDirection: 'column', gap: 1, overflowY: 'auto' }}>
          {/* Library section */}
          <span className="s-section-lbl">Library</span>
          {navItems.map(item => (
            <button
              key={item.href}
              className={`ni ${isActive(item.href) ? 'active' : ''}`}
              onClick={() => { router.push(item.href); useUIStore.getState().setSidebarOpen(false) }}
            >
              <span className="ni-ic" style={{ color: isActive(item.href) ? 'var(--accent)' : undefined }}>{item.icon}</span>
              {item.label}
            </button>
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
            <button
              key={item.href}
              className={`ni ${isActive(item.href) ? 'active' : ''}`}
              onClick={() => { router.push(item.href); useUIStore.getState().setSidebarOpen(false) }}
            >
              <span className="ni-ic" style={{ color: isActive(item.href) ? 'var(--accent)' : undefined }}>{item.icon}</span>
              {item.label}
            </button>
          ))}

          {/* Collections section */}
          {collections.length > 0 && (
            <>
              <span className="s-section-lbl" style={{ marginTop: '8px' }}>Recent collections</span>
              {collections.map(c => (
                <button
                  key={c.id}
                  className="ni"
                  onClick={() => {
                    useUIStore.getState().setSidebarOpen(false)
                    router.push(`/?collection=${c.id}`)
                  }}
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
                    <RecentCollectionThumb collection={c} />
                  </div>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px' }}>
                    {c.name}
                  </span>
                </button>
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
        <div style={{ padding: '10px 6px', borderTop: '1px solid var(--border)' }}>
          <button className="s-user-inner" onClick={openSettings} style={{ width: '100%' }}>
            <div className="s-avatar">{userInitials}</div>
            <div>
              <div className="s-name">{userName}</div>
              <div className="s-role">{userRole}</div>
            </div>
          </button>
        </div>
      </nav>

      <SettingsPanel userId={userId} userName={userName} userInitials={userInitials} userRole={userRole} />
    </>
  )
}
