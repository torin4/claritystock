'use client'
import { useUIStore } from '@/stores/ui.store'

export default function SidebarOverlay() {
  const { sidebarOpen, setSidebarOpen } = useUIStore()
  return (
    <div
      className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
      onClick={() => setSidebarOpen(false)}
    />
  )
}
