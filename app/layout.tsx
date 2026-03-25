import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/layout/Sidebar'
import MobileTopBar from '@/components/layout/MobileTopBar'
import SidebarOverlay from '@/components/layout/SidebarOverlay'
import NavigationUiReset from '@/components/layout/NavigationUiReset'
import NotificationProvider from '@/components/providers/NotificationProvider'
import { attachSignedCollectionPreviewUrls } from '@/lib/photos/serverSignedUrls'
import { getCollections } from '@/lib/queries/collections.queries'
import { createClient } from '@/lib/supabase/server'
import { getServerProfile, getServerUser } from '@/lib/supabase/request-context'

export const metadata: Metadata = {
  title: 'Clarity Stock',
  description: 'Internal photo library for Clarity Northwest Photography',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser()
  const [profile, recentCollections] = await Promise.all([
    getServerProfile(),
    user
      ? getCollections(createClient(), { excludeCreatedBy: user.id, limit: 8 })
          .then((collections) => attachSignedCollectionPreviewUrls(collections, {
            limitCollections: 8,
            photosPerCollection: 1,
          }))
      : Promise.resolve([]),
  ])

  return (
    <html lang="en">
      <body>
        <NavigationUiReset />
        {user ? (
          <>
            <NotificationProvider userId={user.id} />
            <MobileTopBar />
            <SidebarOverlay />
            <div className="app-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
              <Sidebar
                userName={profile?.name ?? ''}
                userInitials={profile?.initials ?? ''}
                userRole={profile?.role ?? 'photographer'}
                userId={user.id}
                recentCollections={recentCollections}
              />
              <main
                style={{
                  flex: 1,
                  minHeight: 0,
                  minWidth: 0,
                  overflowY: 'auto',
                }}
              >
                {children}
              </main>
            </div>
          </>
        ) : (
          children
        )}
      </body>
    </html>
  )
}
