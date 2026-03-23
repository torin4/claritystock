import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/layout/Sidebar'
import MobileTopBar from '@/components/layout/MobileTopBar'
import SidebarOverlay from '@/components/layout/SidebarOverlay'
import NotificationProvider from '@/components/providers/NotificationProvider'
import { getServerProfile, getServerUser } from '@/lib/supabase/request-context'

export const metadata: Metadata = {
  title: 'Clarity Stock',
  description: 'Internal photo library for Clarity Northwest Photography',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, profile] = await Promise.all([getServerUser(), getServerProfile()])

  return (
    <html lang="en">
      <body>
        {user && profile && (
          <>
            <NotificationProvider userId={user.id} />
            <MobileTopBar />
            <SidebarOverlay />
            <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
              <Sidebar
                userName={profile.name ?? ''}
                userInitials={profile.initials ?? ''}
                userRole={profile.role ?? 'photographer'}
                userId={user.id}
              />
              <main style={{
                flex: 1,
                overflowY: 'auto',
                height: '100vh',
                minWidth: 0,
              }}>
                {children}
              </main>
            </div>
          </>
        )}
        {!user && children}
      </body>
    </html>
  )
}
