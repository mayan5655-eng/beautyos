// lib/skinScanQuota.ts
//
// The monthly skin-scan ceiling, counted from ai_usage.
//
// ── Why this is the real defence ───────────────────────────────────────────
// /api/skin-scan is public, calls Claude with an image and max_tokens 3000, and
// costs roughly $0.0135 a call. Unlimited, a trivial script at one request per
// second is about $1,150 a day. The signed token stops someone naming a tenant
// they have no link for; it does NOT stop someone who HAS a link, because the
// link is public by design. This ceiling is what actually bounds the money.
//
// ── Counted from spend, not from attempts ──────────────────────────────────
// The count is of ai_usage rows, which exist only when a call was actually made
// and paid for. A refusal - rate limited, over quota, bad signature - writes no
// row and therefore does not consume the ceiling. That matters in both
// directions: she is never locked out by an attacker's refused attempts, and
// the number she sees is money actually spent, not traffic.
//
// ── Shared on purpose ──────────────────────────────────────────────────────
// The public route enforces this and her own status endpoint displays it. If
// they computed the month boundary differently she would be told she has room
// while the route refuses her clients, which is the worst possible failure for
// a lead-capture funnel.

import { createClient } from '@supabase/supabase-js';

/** Rows in ai_usage carry this call_site for the scanner. */
export const SKIN_SCAN_CALL_SITE = 'skin-scan';

/** Default ceiling. Override with SKIN_SCAN_MONTHLY_LIMIT. */
export const DEFAULT_MONTHLY_LIMIT = 200;

export function monthlyLimit(): number {
  const raw = Number(process.env.SKIN_SCAN_MONTHLY_LIMIT);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_MONTHLY_LIMIT;
  return Math.floor(raw);
}

/**
 * The instant that "this month" started, in Israel time, as a UTC ISO string.
 *
 * created_at is timestamptz, so the comparison needs an instant, not a wall
 * clock. The offset is taken as of `now`; if Israel changed DST between the 1st
 * and today the boundary is off by an hour, which can include or exclude a
 * single hour of rows at the very start of the month. For a cost ceiling that
 * is immaterial, and the alternative is a timezone dependency for one query.
 */
export function monthStartIso(now: Date = new Date()): string {
  const il = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const utc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
  const offsetMs = il.getTime() - utc.getTime();
  return new Date(Date.UTC(il.getFullYear(), il.getMonth(), 1, 0, 0, 0) - offsetMs).toISOString();
}

export interface QuotaStatus {
  used: number;
  limit: number;
  remaining: number;
  exceeded: boolean;
  /** True when the count could not be read - see the fail-open note below. */
  unknown: boolean;
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/**
 * How many scans this tenant has spent this month, and whether that is over.
 *
 * ── Fails OPEN, deliberately ──────────────────────────────────────────────
 * If ai_usage cannot be read, this reports used=0 / unknown=true and the caller
 * lets the scan through. The alternative - failing closed - means one bad
 * database moment silently switches off every cosmetician's lead capture, which
 * is a far worse outcome than a handful of uncounted scans. The metering table
 * is a cost guard, not an auth boundary; a guard that takes the product down
 * when it wobbles is not a guard.
 *
 * The `unknown` flag is returned rather than hidden so the caller can log it.
 */
/**
 * Just the slice of the supabase chain this module uses. Narrow on purpose:
 * the test double has to implement only this, and anything it adds beyond this
 * is not something production depends on.
 */
interface CountResult {
  count: number | null;
  error: { message: string } | null;
}

// PromiseLike rather than a hand-written then<R>: declaring the generic myself
// made TypeScript recurse into the real client's builder types and give up with
// "Type instantiation is excessively deep".
interface CountQuery extends PromiseLike<CountResult> {
  select(cols: string, opts?: { count?: 'exact'; head?: boolean }): CountQuery;
  eq(col: string, val: string): CountQuery;
  gte(col: string, val: string): CountQuery;
}

export async function getQuotaStatus(
  tenantId: string,
  opts: { db?: { from: (t: string) => CountQuery } | null; now?: Date } = {}
): Promise<QuotaStatus> {
  const limit = monthlyLimit();
  if (!tenantId) return { used: 0, limit, remaining: limit, exceeded: false, unknown: true };

  // The real client's builder types are far wider than the four methods used
  // here; narrowing at the boundary keeps the test double honest and stops
  // TypeScript walking the whole supabase type graph for one count.
  const db = opts.db ?? (admin() as unknown as { from: (t: string) => CountQuery });
  const since = monthStartIso(opts.now);

  try {
    const { count, error } = await db
      .from('ai_usage')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('call_site', SKIN_SCAN_CALL_SITE)
      .gte('created_at', since);

    if (error || count === null || count === undefined) {
      console.error(
        `[skin-scan-quota] count failed for tenant ${tenantId}: ${error?.message ?? 'null count'} — failing OPEN`
      );
      return { used: 0, limit, remaining: limit, exceeded: false, unknown: true };
    }

    const used = Number(count) || 0;
    return {
      used,
      limit,
      remaining: Math.max(0, limit - used),
      exceeded: used >= limit,
      unknown: false,
    };
  } catch (e) {
    console.error(
      `[skin-scan-quota] threw for tenant ${tenantId}: ${e instanceof Error ? e.message : String(e)} — failing OPEN`
    );
    return { used: 0, limit, remaining: limit, exceeded: false, unknown: true };
  }
}
