'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useUIStore } from '@/stores/ui.store'

/**
 * Zustand UI flags (lightbox, filters, etc.) survive client-side route changes.
 * If the lightbox stayed open from Browse, My Photos / Insights render a full-screen
 * overlay with no matching photo — the app looks “bricked”. Reset overlays on navigation.
 */
export default function NavigationUiReset() {
  const pathname = usePathname()
  const prevPath = useRef<string | null>(null)

  useEffect(() => {
    if (prevPath.current !== null && prevPath.current !== pathname) {
      useUIStore.getState().resetNavigationUi()
    }
    prevPath.current = pathname
  }, [pathname])

  return null
}
