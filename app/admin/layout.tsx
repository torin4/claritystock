import Link from 'next/link'
import { redirect } from 'next/navigation'
import AdminSubnav from '@/components/admin/AdminSubnav'
import { isAdminRole } from '@/lib/auth/roles'
import { getServerProfile, getServerUser } from '@/lib/supabase/request-context'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser()
  const profile = await getServerProfile()
  if (!user) redirect('/login')
  if (!isAdminRole(profile?.role)) {
    return (
      <div style={{ padding: '24px 20px', maxWidth: 480 }}>
        <div className="ph-title" style={{ marginBottom: 8 }}>Admin</div>
        <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 16 }}>
          Your account doesn’t have the admin role. Ask a teammate to set{' '}
          <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>role = &apos;admin&apos;</code>{' '}
          on your row in <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>public.users</code> in Supabase.
        </p>
        <Link href="/" className="ni active" style={{ width: 'auto', display: 'inline-flex' }}>
          Back to Browse
        </Link>
      </div>
    )
  }
  return (
    <>
      <AdminSubnav />
      {children}
    </>
  )
}
