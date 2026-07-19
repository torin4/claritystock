import { redirect } from 'next/navigation'

/**
 * Insights has been absorbed into Home (/dashboard). Keep this route as a
 * permanent redirect so old bookmarks and links still land in the right place.
 */
export default function InsightsPage() {
  redirect('/dashboard')
}
