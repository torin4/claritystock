import type { Metadata } from 'next'
import './globals.css'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/layout/Sidebar'
import MobileTopBar from '@/components/layout/MobileTopBar'
import SidebarOverlay from '@/components/layout/SidebarOverlay'
import NotificationProvider from '@/components/providers/NotificationProvider'

export const metadata: Metadata = {
  title: 'Clarity Stock',
  description: 'Internal photo library for Clarity Northwest Photography',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let profile = null
  if (user) {
    const { data } = await supabase
      .from('users')
      .select('name, initials, role, avatar_url')
      .eq('id', user.id)
      .single()
    profile = data
  }

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
