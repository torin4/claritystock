import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LoginCard from '@/components/login/LoginCard'

export default async function LoginPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/')
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <LoginCard />
    </div>
  )
}
