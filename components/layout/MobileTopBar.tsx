'use client'
import { useUIStore } from '@/stores/ui.store'
import BrandTitle from '@/components/layout/BrandTitle'

export default function MobileTopBar() {
  const setSidebarOpen = useUIStore(s => s.setSidebarOpen)

  return (
    <div className="mobile-bar">
      <div style={{ width: '36px' }} /> {/* spacer */}
      <BrandTitle size="mobile" priority />
      <button className="hamburger" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
        <span />
        <span />
        <span />
      </button>
    </div>
  )
}
