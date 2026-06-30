// proxy.ts (Next.js 16 — replaces the deprecated `middleware` convention)
// Runs the Supabase session refresh on every (non-asset) request.
// See lib/supabase/middleware.ts for the logic and the public-route list.

import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from './lib/supabase/middleware';

export async function proxy(request: NextRequest) {
  try {
    return await updateSession(request);
  } catch (err) {
    // Never let auth refresh crash the whole site.
    console.error('Proxy error (ignored):', err);
    return NextResponse.next({ request });
  }
}

export const config = {
  matcher: [
    // Match everything except Next.js internals and static asset files.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
