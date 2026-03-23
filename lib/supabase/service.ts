import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getSupabaseUrl } from '@/lib/supabase/env'

export function createServiceClient() {
  return createSupabaseClient(
    getSupabaseUrl(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
