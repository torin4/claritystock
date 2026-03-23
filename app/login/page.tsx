import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/supabase/request-context'
import LoginCard from '@/components/login/LoginCard'

export default async function LoginPage() {
  const user = await getServerUser()
  if (user) redirect('/')
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <LoginCard />
    </div>
  )
}
