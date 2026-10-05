// lib/supabase/middleware.ts
// Refreshes the Supabase auth session on every request and keeps the session
// cookies in sync between the browser and the server. This is the mandatory
// piece of the @supabase/ssr integration: without it the access token is never
// refreshed, the browser client loses its session, auth.uid() is NULL in RLS,
// and all writes fail with 401 / 42501.

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { verifiedUserFromSession } from './sessionGate';

// Public routes that must never require login (clients/leads use these).
const PUBLIC_PREFIXES = [
  '/login',
  '/auth',
  '/signup',
  '/book',
  '/skin-scan',
  '/form',
  '/confirm',
  '/demo', // the public demo chooser AND /demo/cosmetics, /demo/nails (lib/demoTenants.ts) - two path segments, so the single-top-level-segment rule below does not already cover it
  '/api',
  '/logo', // her logo with a white background taken out (app/logo/[key]); public pages draw it, so no session
  '/og',// per-tenant link-preview images (app/og/[key]); fetched by WhatsApp / Instagram / Facebook scrapers, which have no session
  '/cesdk-poc', // cesdk-poc: the caption font under public/cesdk-poc; delete with app/cesdk-poc
  '/design-fonts', // the design studio's fonts (public/design-fonts), fetched by the renderer without a session
  '/design-deco', // the studio's line drawings (public/design-deco), fetched by the renderer the same way
  '/design-grain.png', // the studio's film grain
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return true;
  }
  // Dynamic landing pages: a single top-level segment (e.g. "/my-slug"),
  // anything except the dashboard, is public.
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 1 && segments[0] !== 'dashboard') {
    return true;
  }
  // The home app ("/") renders the SPA and runs its own session guard.
  if (pathname === '/') return true;
  return false;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write to the request (for this pass) and to the response (so the
          // refreshed token reaches the browser).
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: do not run any code between createServerClient and this call.
  // It reads the session, which refreshes a token that is about to expire and
  // triggers the cookie writes above.
  // Page-level gate only: the token's signature is verified locally
  // (lib/supabase/sessionGate.ts) instead of a round trip to the Auth server.
  // Every API route and write still calls auth.getUser().
  const user = await verifiedUserFromSession(supabase);

  // Protected pages (everything that is not public) require a session.
  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    const redirectResponse = NextResponse.redirect(url);
    // Preserve the refreshed auth cookies on the redirect response.
    supabaseResponse.cookies.getAll().forEach((c) =>
      redirectResponse.cookies.set(c.name, c.value)
    );
    return redirectResponse;
  }

  // Return the (cookie-refreshed) response so the browser gets the latest token.
  return supabaseResponse;
}
