'use client'

import type { CSSProperties } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const linkStyle = (active: boolean): CSSProperties => ({
  fontSize: 13,
  fontWeight: active ? 600 : 400,
  color: active ? 'var(--text)' : 'var(--text-2)',
  textDecoration: 'none',
  borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
  paddingBottom: 6,
  marginBottom: -1,
})

export default function AdminSubnav() {
  const pathname = usePathname()
  const analytics = pathname === '/admin'
  const libraries = pathname.startsWith('/admin/libraries')

  return (
    <div
      style={{
        display: 'flex',
        gap: 20,
        padding: '12px 20px 0',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <Link href="/admin" style={linkStyle(analytics)}>
        Analytics
      </Link>
      <Link href="/admin/libraries" style={linkStyle(libraries)}>
        Photo libraries
      </Link>
    </div>
  )
}
