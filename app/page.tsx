import { redirect } from 'next/navigation'

/**
 * Landing router. Both roles now start on Home (/dashboard) instead of Browse;
 * Browse moved to /browse. Unauthenticated requests are sent to /login by
 * middleware before they reach here.
 */
export default function RootPage() {
  redirect('/dashboard')
}
