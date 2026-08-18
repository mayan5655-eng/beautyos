import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

/**
 * Diagnostic: what base URL is this deployment actually using?
 *
 * Vercel masks env vars in its UI, and NEXT_PUBLIC_APP_URL is read only by
 * server routes here, so it never reaches the browser bundle and cannot be
 * found by searching page source. Without this there is no way to tell a
 * correctly-configured production from one still pointing at localhost - and a
 * wrong value defeats every `||` fallback in the codebase, because those only
 * fire when the variable is UNSET.
 *
 * Deliberately narrow:
 *   - requires a logged-in session, so it is not a public fingerprinting probe
 *   - returns the HOST, never the raw string, so this stays safe to reuse if it
 *     is ever pointed at a value that is genuinely secret
 *   - read-only, touches no tenant data, so it needs no tenant scoping
 */
export async function GET(request: NextRequest) {
  const session = await createServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'לא מחובר' }, { status: 401 });
  }

  const raw = process.env.NEXT_PUBLIC_APP_URL;
  const configured = !!raw;

  let host: string | null = null;
  let protocol: string | null = null;
  let malformed = false;
  if (raw) {
    try {
      const u = new URL(raw);
      host = u.host;          // hostname:port - no scheme, no path, no query
      protocol = u.protocol;
    } catch {
      malformed = true;       // set, but not a parseable URL
    }
  }

  const requestHost = new URL(request.url).host;

  return NextResponse.json({
    configured,
    malformed,
    host,
    protocol,
    isLocalhost: !!host && /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|$)/.test(host),
    requestHost,
    matchesRequest: host === requestHost,
  });
}
