// lib/planGuard.ts
// Server-side plan check for API routes.
//
// WHERE THIS SITS IN THE ENFORCEMENT STORY:
//   * The RESTRICTIVE RLS policies in trial-gate-policies.sql are the real
//     enforcement. They cover every page and every client automatically,
//     including the browser talking straight to PostgREST, which is why hiding
//     buttons alone was never going to be enough.
//   * This guard is the second layer. It exists so a blocked tenant gets a
//     clean, explainable 402 instead of an opaque row-level-security error, and
//     so route handlers that spend real money (the Anthropic calls) or send real
//     WhatsApp messages stop BEFORE doing the expensive part.
//
// ONLY apply this to routes that MUTATE or SPEND. Read endpoints must stay open:
// a tenant on hold keeps read access to her calendar and client list by design,
// so guarding a GET would contradict the whole model.
//
// It calls public.is_tenant_active(), the exact same predicate the RLS policies
// evaluate, so the two layers can never disagree about who is blocked.

import { NextResponse } from 'next/server'
import type { createClient } from '@/lib/supabase/server'
import { API_BLOCKED_MESSAGE_HE } from '@/lib/planCopy'

type ServerSupabase = Awaited<ReturnType<typeof createClient>>

/**
 * 402 Payment Required. Deliberately distinct from 401 (not logged in) and 403
 * (not allowed), so the UI can tell "your plan is on hold" apart from an auth
 * problem and render the hold explanation instead of bouncing her to /login.
 */
export const PLAN_BLOCKED_HTTP_STATUS = 402

/** Machine-readable marker for the client, alongside the Hebrew message. */
export const PLAN_BLOCKED_CODE = 'PLAN_INACTIVE'

/**
 * Short Hebrew line for the API layer, re-exported from lib/planCopy so the
 * wording matches every other surface.
 */
export const PLAN_BLOCKED_MESSAGE_HE = API_BLOCKED_MESSAGE_HE

export type PlanGuardResult = { ok: true } | { ok: false; response: NextResponse }

/**
 * Reject the request when this tenant's plan is definitively on hold.
 *
 * FAILS OPEN, matching public.is_tenant_active() and lib/planState. If the RPC
 * errors, or is missing because trial-state.sql has not been run, or returns
 * anything other than a hard `false`, the request proceeds. A billing check must
 * never be the reason a paying user cannot work.
 *
 * Usage, immediately after the route resolves its tenant:
 *
 *   const guard = await requireActiveTenant(supabase)
 *   if (!guard.ok) return guard.response
 */
export async function requireActiveTenant(supabase: ServerSupabase): Promise<PlanGuardResult> {
  try {
    const { data, error } = await supabase.rpc('is_tenant_active')

    // Fail open on any error at all, including "function does not exist".
    if (error) {
      console.warn('[planGuard] is_tenant_active failed, allowing request:', error.message)
      return { ok: true }
    }

    // Strict === false. null/undefined mean "could not determine", so allow.
    if (data === false) {
      return {
        ok: false,
        // `success: false` is included because the two .js routes here answer in
        // that shape, and their callers branch on it. Harmless extra field for
        // the routes that only read `error`.
        response: NextResponse.json(
          { success: false, error: PLAN_BLOCKED_MESSAGE_HE, code: PLAN_BLOCKED_CODE },
          { status: PLAN_BLOCKED_HTTP_STATUS }
        ),
      }
    }

    return { ok: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn('[planGuard] is_tenant_active threw, allowing request:', message)
    return { ok: true }
  }
}
