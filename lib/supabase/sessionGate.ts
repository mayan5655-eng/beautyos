// lib/supabase/sessionGate.ts
//
// "Is there a signed-in user on this request?" for the three PAGE-LEVEL gates:
// the proxy (lib/supabase/middleware.ts), app/dashboard/layout.tsx and
// app/page.tsx. Verifies the access token's signature locally (ES256, against
// the project's cached public key) instead of asking the Auth server with
// auth.getUser() on every request - which cost a network round trip, twice in
// series, before the first byte of /dashboard.
//
// What it does NOT replace: every API route, the admin guard and every write
// still call auth.getUser(). That asks the Auth server and sees a revoked
// session at once; this does not. See test-session-gate.ts for the contract.
//
// What the swap gives up, exactly: a session that was revoked server-side (user
// deleted or banned, signed out everywhere) still passes THESE gates until its
// access token expires - the token's own lifetime, 1 hour by Supabase default.
// That is already how the data layer behaves: the browser talks to PostgREST
// with the same token and RLS accepts it until it expires, and no API route
// trusts this function. So the gate can show a revoked user the app shell for up
// to that long; it cannot show them data or let them act.
//
// Fails closed everywhere: no session, expired, bad signature, key server
// unreachable, or any error at all returns null.

import type { SupabaseClient } from '@supabase/supabase-js';

export type VerifiedUser = { id: string; email?: string };

export async function verifiedUserFromSession(supabase: SupabaseClient): Promise<VerifiedUser | null> {
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims) return null;
    const { sub, role, email } = data.claims as { sub?: unknown; role?: unknown; email?: unknown };
    // A validly signed token is not necessarily a signed-in USER. The project's
    // anon key and service-role key are both real JWTs; they have no subject
    // (or a different role), and getUser() would never have returned a user for
    // them. Insist on both.
    if (typeof sub !== 'string' || !sub) return null;
    if (role !== 'authenticated') return null;
    return { id: sub, ...(typeof email === 'string' ? { email } : {}) };
  } catch {
    return null;
  }
}
