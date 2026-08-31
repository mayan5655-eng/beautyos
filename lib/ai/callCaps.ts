// lib/ai/callCaps.ts
//
// A monthly ceiling on AI calls, per tenant, per feature.
//
// ── What this is for ────────────────────────────────────────────────────────
// Every AI call in this app goes through trackedCreate(), which logs it to
// ai_usage. Until now nothing READ that log to decide whether to spend more.
// One feature had a ceiling - the skin scanner, because it is public - and the
// other nine had none at all.
//
// The exposure is not a cosmetician generating too many posts. It is:
//   * whatsapp-webhook, which fires a Claude call for EVERY inbound message.
//     A stranger looping messages at her number spends money on her tenant,
//     and neither she nor we would notice until the bill.
//   * marketing/reel at max_tokens 16000 on a Sonnet-tier model - roughly
//     $0.17 a call, one button, and a retry loop is indistinguishable from
//     enthusiasm.
//
// ── Counted, not summed ─────────────────────────────────────────────────────
// PostgREST has no SUM here, so this counts ROWS the way lib/skinScanQuota.ts
// does - count: exact, head: true - and the money is expressed by choosing each
// ceiling against that feature's known per-call cost. A count is one cheap
// indexed query; a sum would need an RPC, and RPCs in this project are DDL
// applied by hand.
//
// ── The arithmetic behind each number ───────────────────────────────────────
// Per-call costs at Haiku 4.5 ($1/$5 per Mtok) and Sonnet 5 ($2/$10 per Mtok),
// using each call site's real max_tokens. Ceilings sit roughly an order of
// magnitude above heavy honest use, so tripping one means a loop or an abuser,
// never a busy week:
//
//   site                     ~$/call   cap   worst case   heavy honest use
//   whatsapp-webhook          0.0035   1500     $5.25      ~300 inbound/mo
//   advisor                   0.007     400     $2.80      ~50 questions
//   voice-intent              0.002     600     $1.20      a few a day
//   score-lead                0.005    1000     $5.00      one per new lead
//   leads/map-headers         0.012     100     $1.20      one per import
//   marketing/strategy        0.045     150     $6.75      ~20 campaigns
//   marketing/variations      0.045     200     $9.00
//   marketing/groups          0.045     150     $6.75
//   marketing/reel            0.17       80    $13.60      ~10 reels
//
// Worst case if a tenant pinned every ceiling in one month: about $51.
// Realistic use is $4-11. This is a ceiling, not a budget.
//
// ── skin-scan is deliberately ABSENT ────────────────────────────────────────
// It already has a dedicated, env-tunable ceiling in lib/skinScanQuota.ts that
// its route enforces with a proper Hebrew message. Listing it here too would
// create two numbers that can disagree - and SKIN_SCAN_MONTHLY_LIMIT raising
// one while a hardcoded copy here blocked at the old value is exactly the class
// of bug this file should not introduce.
//
// ── Fails OPEN ──────────────────────────────────────────────────────────────
// If ai_usage cannot be read we allow the call, matching lib/skinScanQuota.ts
// and lib/planState.ts. This is a COST control, not a security boundary: a
// database wobble must not take her advisor away in the middle of a question.
// The security boundary in this project (lib/adminGuard.ts) fails closed; spend
// controls fail open. The asymmetry is intentional and documented in both.

import { createClient } from '@supabase/supabase-js';

/** Monthly ceiling per tenant, per call site. Absent = uncapped by this file. */
export const MONTHLY_CALL_CAPS: Record<string, number> = {
  'whatsapp-webhook': 1500,
  'advisor': 400,
  'voice-intent': 600,
  'score-lead': 1000,
  'leads/map-headers': 100,
  'marketing/strategy': 150,
  'marketing/variations': 200,
  'marketing/groups': 150,
  'marketing/reel': 80,
};

/**
 * Raised by trackedCreate when a ceiling is reached, so a caller can tell this
 * apart from the model itself failing. Carries the numbers so the log line and
 * any future user-facing message can be specific.
 */
export class AiCapExceededError extends Error {
  readonly callSite: string;
  readonly used: number;
  readonly cap: number;
  constructor(callSite: string, used: number, cap: number) {
    super(`AI monthly cap reached for ${callSite}: ${used}/${cap}`);
    this.name = 'AiCapExceededError';
    this.callSite = callSite;
    this.used = used;
    this.cap = cap;
  }
}

/** Per-call-site override, e.g. AI_CAP_MARKETING_REEL=200. */
function capFor(callSite: string): number | null {
  const envKey = 'AI_CAP_' + callSite.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const raw = Number(process.env[envKey]);
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  const fixed = MONTHLY_CALL_CAPS[callSite];
  return typeof fixed === 'number' ? fixed : null;
}

/**
 * Start of this month in Israel time, as a UTC instant.
 *
 * Same derivation as lib/skinScanQuota.ts, and for the same reason: created_at
 * is timestamptz, so the comparison needs an instant rather than a wall clock.
 */
export function monthStartIso(now: Date = new Date()): string {
  const il = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const utc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
  const offsetMs = il.getTime() - utc.getTime();
  const firstIl = new Date(il.getFullYear(), il.getMonth(), 1, 0, 0, 0, 0);
  return new Date(firstIl.getTime() - offsetMs).toISOString();
}

let cachedClient: ReturnType<typeof createClient> | null = null;
function admin() {
  if (cachedClient) return cachedClient;
  cachedClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  return cachedClient;
}

type CountQuery = {
  select: (c: string, o: { count: 'exact'; head: true }) => CountQuery;
  eq: (c: string, v: unknown) => CountQuery;
  gte: (c: string, v: unknown) => Promise<{ count: number | null; error: { message: string } | null }>;
};

export type CapStatus = {
  used: number;
  cap: number | null;
  exceeded: boolean;
  /** true when the count could not be read, so the call was allowed anyway */
  unknown: boolean;
};

/**
 * How much of this month's allowance for one feature a tenant has used.
 *
 * An unattributed call (tenantId null) is never capped: there is no tenant to
 * charge it to, and refusing it would break the one path - a scan through a
 * link whose signature did not carry a tenant - that cannot retry.
 */
export async function getCallCapStatus(
  tenantId: string | null | undefined,
  callSite: string,
  opts: { now?: Date; db?: CountQuery } = {}
): Promise<CapStatus> {
  const cap = capFor(callSite);
  if (cap === null || !tenantId) {
    return { used: 0, cap, exceeded: false, unknown: false };
  }

  const table =
    opts.db ??
    ((admin() as unknown as { from: (t: string) => CountQuery }).from('ai_usage'));
  const since = monthStartIso(opts.now);

  try {
    const { count, error } = await table
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('call_site', callSite)
      .gte('created_at', since);

    if (error || count === null || count === undefined) {
      console.error(
        `[ai-cap] count failed for tenant ${tenantId} / ${callSite}: ` +
        `${error?.message ?? 'null count'} - failing OPEN`
      );
      return { used: 0, cap, exceeded: false, unknown: true };
    }

    const used = Number(count) || 0;
    return { used, cap, exceeded: used >= cap, unknown: false };
  } catch (e) {
    console.error(
      `[ai-cap] threw for tenant ${tenantId} / ${callSite}: ` +
      `${e instanceof Error ? e.message : String(e)} - failing OPEN`
    );
    return { used: 0, cap, exceeded: false, unknown: true };
  }
}
