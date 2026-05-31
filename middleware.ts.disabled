export const runtime = 'nodejs'
import { NextResponse, type NextRequest } from 'next/server'

// Public routes that should NEVER require login (clients use these).
const PUBLIC_PREFIXES = [
  '/login',
  '/auth',
  '/signup',
  '/book',
  '/skin-scan',
  '/form',
  '/confirm',
  '/api',
]

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return true
  }
  // Dynamic landing pages: a single top-level segment (e.g. "/my-slug"),
  // anything except the dashboard, is public.
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 1 && segments[0] !== 'dashboard') {
    return true
  }
  if (pathname === '/') return true
  return false
}

export async function middleware(request: NextRequest) {
  // Wrap EVERYTHING in try/catch so the middleware can never crash the site.
  try {
    const pathname = request.nextUrl.pathname

    // Public paths: let them straight through, no auth check at all.
    if (isPublicPath(pathname)) {
      return NextResponse.next()
    }

    // For protected paths (/dashboard/*), check for a Supabase auth cookie.
    // We do a lightweight cookie check instead of a full network call,
    // which is far more reliable inside the Vercel runtime.
    const hasAuthCookie = request.cookies
      .getAll()
      .some((c) => c.name.includes('-auth-token') || c.name.startsWith('sb-'))

    if (!hasAuthCookie) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }

    return NextResponse.next()
  } catch (err) {
    // If anything goes wrong, never 500 — just let the request continue.
    console.error('Middleware error (ignored):', err)
    return NextResponse.next()
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
