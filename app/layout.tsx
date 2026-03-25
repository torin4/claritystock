import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/layout/Sidebar'
import MobileTopBar from '@/components/layout/MobileTopBar'
import SidebarOverlay from '@/components/layout/SidebarOverlay'
import NavigationUiReset from '@/components/layout/NavigationUiReset'
import NotificationProvider from '@/components/providers/NotificationProvider'
import { mergeRecentNavItems } from '@/lib/navigation/recentNav'
import { attachSignedCollectionPreviewUrls, attachSignedThumbnailUrls } from '@/lib/photos/serverSignedUrls'
import { getCollections } from '@/lib/queries/collections.queries'
import { getRecentSidebarPhotos } from '@/lib/queries/sidebarRecents.queries'
import { createClient } from '@/lib/supabase/server'
import { getServerProfile, getServerUser } from '@/lib/supabase/request-context'

const SIDEBAR_RECENTS_POOL = 12
const SIDEBAR_RECENTS_LIMIT = 8

export const metadata: Metadata = {
  title: 'Clarity Stock',
  description: 'Internal photo library for Clarity Northwest Photography',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser()
  const [profile, recentItems] = await Promise.all([
    getServerProfile(),
    user
      ? (async () => {
          const supabase = createClient()
          const [collections, photoRows] = await Promise.all([
            getCollections(supabase, { excludeCreatedBy: user.id, limit: SIDEBAR_RECENTS_POOL }),
            getRecentSidebarPhotos(supabase, {
              excludePhotographerId: user.id,
              limit: SIDEBAR_RECENTS_POOL,
            }),
          ])
          const [signedCols, signedPhotos] = await Promise.all([
            attachSignedCollectionPreviewUrls(collections, {
              limitCollections: SIDEBAR_RECENTS_POOL,
              photosPerCollection: 1,
            }),
            attachSignedThumbnailUrls(photoRows, { limit: SIDEBAR_RECENTS_POOL }),
          ])
          return mergeRecentNavItems(signedCols, signedPhotos, SIDEBAR_RECENTS_LIMIT)
        })()
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
                userAvatarUrl={profile?.avatar_url ?? null}
                userRole={profile?.role ?? 'photographer'}
                userId={user.id}
                hideOwnPhotosInBrowse={profile?.hide_own_photos_in_browse === true}
                recentItems={recentItems}
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
