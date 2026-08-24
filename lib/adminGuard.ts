// lib/adminGuard.ts
// Platform-admin gate for the Phase 4 panel. This is the ONLY thing standing
// between a logged-in tenant and every other tenant's billing state, so it is
// deliberately the most conservative code in the project.
//
// ===========================================================================
// THIS FAILS CLOSED. lib/planGuard.ts FAILS OPEN. That is not an inconsistency.
// ===========================================================================
// planGuard is a BILLING gate: wrongly blocking a paying user costs her access
// to her own calendar mid-workday, so on any doubt it lets the request through.
// This file is a SECURITY boundary: wrongly allowing someone hands them control
// of every business on the platform. On any doubt at all -- no session, RPC
// error, missing table, unreadable row -- it DENIES.
//
// ===========================================================================
// WHY THE SERVICE-ROLE KEY IS REQUIRED HERE
// ===========================================================================
// public.platform_admins has RLS enabled and ZERO policies (trial-state.sql
// section 5), which is a deny-all for both `anon` and `authenticated`. That is
// on purpose: a tenant cannot read it, enumerate it, or even discover it
// exists. The consequence is that the session client literally cannot check
// membership, so the check must run on the service-role key, which bypasses
// RLS entirely.
//
// The identity being checked ALWAYS comes from the session cookie via
// auth.getUser(). It is never taken from a request body, a header, a query
// param or anything else the caller controls. That is the same lesson as
// app/api/send-receipt: service-role plus caller-supplied identity is how you
// build a hole, not a gate.
//
// ===========================================================================
// SERVER ONLY
// ===========================================================================
// Never import this from a client component. SUPABASE_SERVICE_ROLE_KEY has no
// NEXT_PUBLIC_ prefix, so Next.js will not inline it into the browser bundle;
// a client import would get `undefined` and fail loudly rather than leak the
// key. Do not "fix" such a failure by renaming the variable.

import { createClient as createServiceRoleClient } from '@supabase/supabase-js'
import { createClient as createSessionClient } from '@/lib/supabase/server'

/**
 * Service-role Supabase client. Bypasses RLS and column privileges entirely,
 * which is what lets the panel read platform_admins and write the plan columns
 * on public.tenants that `authenticated` was revoked from in gate.sql.
 *
 * Created per call rather than at module scope so that importing this module
 * never has the side effect of constructing a privileged client.
 */
export function createAdminClient() {
  return createServiceRoleClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

export type AdminCheck =
  | { ok: true; userId: string }
  | { ok: false; reason: 'no-session' | 'not-admin' | 'error' }

/**
 * True only for a user whose id appears in public.platform_admins.
 *
 * Call this at the top of EVERY admin page and EVERY admin route handler. Do
 * not rely on the page having gated the route: a route handler is directly
 * reachable over HTTP and never sees the page's check.
 */
export async function requirePlatformAdmin(): Promise<AdminCheck> {
  try {
    // 1. Identity from the session cookie. Never from caller-supplied input.
    const session = await createSessionClient()
    const {
      data: { user },
    } = await session.auth.getUser()
    if (!user) return { ok: false, reason: 'no-session' }

    // 2. Allowlist lookup on the service-role key, since platform_admins is
    //    deny-all to `authenticated`.
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle()

    // Any error at all is a denial. A missing table, a permissions problem or a
    // network blip must never read as "yes, admin".
    if (error) {
      console.error('[adminGuard] platform_admins lookup failed, DENYING:', error.message)
      return { ok: false, reason: 'error' }
    }
    if (!data) return { ok: false, reason: 'not-admin' }

    return { ok: true, userId: user.id }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[adminGuard] threw, DENYING:', message)
    return { ok: false, reason: 'error' }
  }
}
