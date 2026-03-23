import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseAnonKey, getSupabaseUrl } from '@/lib/supabase/env'

const PUBLIC_PATHS = ['/login', '/auth/callback', '/error']

export async function middleware(request: NextRequest) {
  let supabaseUrl: string
  let supabaseAnonKey: string
  try {
    supabaseUrl = getSupabaseUrl()
    supabaseAnonKey = getSupabaseAnonKey()
  } catch (e) {
    console.error('[middleware]', e)
    return new NextResponse('Application configuration error', { status: 500 })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      /**
       * Do not call `request.cookies.set` — request cookies are read-only on the
       * Edge runtime (Vercel). That throws and becomes MIDDLEWARE_INVOCATION_FAILED.
       * @see https://github.com/supabase/supabase/issues/26400
       */
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options as never),
        )
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname
  const isPublic = PUBLIC_PATHS.some(p => path.startsWith(p))

  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && path === '/login') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
