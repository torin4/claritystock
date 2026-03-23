/**
 * Supabase URL + anon key for server / middleware / browser.
 *
 * On Vercel, set **NEXT_PUBLIC_SUPABASE_URL** and **NEXT_PUBLIC_SUPABASE_ANON_KEY**
 * in Project → Settings → Environment Variables for **Production** and **Preview**,
 * then **Redeploy** (so the build and serverless runtime both see them).
 *
 * Optional fallbacks (read at runtime, not inlined): **SUPABASE_URL**, **SUPABASE_ANON_KEY**
 * (same values as the public vars — anon key is safe to expose; this helps if only
 * server env was set without a rebuild).
 */
export function getSupabaseUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim()
  if (!url) {
    throw new Error(
      'Missing Supabase URL. Add NEXT_PUBLIC_SUPABASE_URL in Vercel → Environment Variables (Production + Preview), then Redeploy. See https://supabase.com/dashboard/project/_/settings/api',
    )
  }
  return url
}

export function getSupabaseAnonKey(): string {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim()
  if (!key) {
    throw new Error(
      'Missing Supabase anon key. Add NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel → Environment Variables (Production + Preview), then Redeploy.',
    )
  }
  return key
}
