export const runtime = 'nodejs'
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Public routes that should NEVER require login.
// Clients use these (booking, skin scan, landing pages, forms).
const PUBLIC_PREFIXES = [
  '/login',
  '/auth',
  '/signup',
  '/book',
  '/skin-scan',
  '/form',
  '/confirm',
  '/api',        // API routes handle their own auth
]

function isPublicPath(pathname: string): boolean {
  // Exact public prefixes
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return true
  }
  // Dynamic landing pages: /[slug] — a single top-level segment with no extra slash.
  // e.g. "/maayanfacebook1992-8c6f359d" is public, but "/dashboard/leads" is not.
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 1 && segments[0] !== 'dashboard') {
    return true
  }
  // The root landing
  if (pathname === '/') return true
  return false
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  // If required env vars are missing, do NOT crash — just let the request through.
  // (A missing env var should never take the whole site down with a 500.)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    console.error('Middleware: missing Supabase env vars — skipping auth check.')
    return response
  }

  // Public paths skip the auth check entirely.
  if (isPublicPath(request.nextUrl.pathname)) {
    return response
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        )
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        )
      },
    },
  })

  let user = null
  try {
    const result = await supabase.auth.getUser()
    user = result.data.user
  } catch (err) {
    // If the auth check itself fails, don't crash the site — send to login.
    console.error('Middleware auth check failed:', err)
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    return NextResponse.redirect(redirectUrl)
  }

  // Protected (non-public) path with no user -> go to login.
  if (!user) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    return NextResponse.redirect(redirectUrl)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}