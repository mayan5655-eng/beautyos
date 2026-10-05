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
// ── Fails CLOSED ────────────────────────────────────────────────────────────
// If ai_usage cannot be read - the count errors, times out or throws, or the
// month's spend cannot be summed - the call is REFUSED, with a plain Hebrew
// message that makes no claim about her month (capMessages.ts), and the
// operator is alerted that the counter is broken (opsAlert.js).
//
// This file used to fail open, on the reasoning that a cost control must not
// take her advisor away mid-question during a database wobble. That reasoning
// priced the wobble and not the alternative: with the counter unreadable the
// ceiling does not exist, so one bad query - or one loop that happens while
// the database is struggling, which is exactly when loops are likeliest - lets a
// tenant spend without limit on Kalmea's bill. A ceiling that opens when it
// breaks is not a ceiling. A refused call costs her a retry in a few minutes and
// nothing else (everything outside AI keeps working); an uncapped one can cost
// real money. So spend controls now fail closed like the security boundary does
// (lib/adminGuard.ts). lib/skinScanQuota.ts, the scanner's own counter, follows.
//
// Two ceilings, because the counts are a proxy and the money is the point:
//   1. a per-feature COUNT per month (MONTHLY_CALL_CAPS below), chosen against
//      each feature's known per-call cost;
//   2. a per-tenant DOLLAR ceiling per month across every feature
//      (tenantMonthlyUsdCeiling), summed from ai_usage.cost_usd. It also bounds
//      the call sites with no count cap at all (marketing/shooting-list).
// Crossing either refuses the call. Coming within 20% of either is announced to
// her first, warmly, with the date it renews.

import { createClient } from '@supabase/supabase-js';
import { readAllRows } from '../pagedRead.js';
import { capRefusalHe } from './capMessages.ts';

/** Monthly ceiling per tenant, per call site. Absent = uncapped by this file. */
export const MONTHLY_CALL_CAPS: Record<string, number> = {
  'whatsapp-webhook': 1500,
  'advisor': 400,
  'voice-intent': 600,
  'score-lead': 1000,
  'leads/map-headers': 100,
  'marketing/groups': 150,
  'marketing/reel': 80,
  // Creatives (OpenAI images, ~13 cents each at high quality). The test
  // surface is admin-only and small; the real call site gets its own number
  // when stage 4 wires it.
  'creatives/direct': 120,
  'creatives/test-image': 30,
  'creatives/image': 60,
  // Free-form post generation (lib/ai/postGenerator.ts): the number she
  // sees as "3 מתוך 9 החודש". One generation = one Claude call + up to three
  // pictures, ~$0.45. settings.ai_generation_cap overrides it per tenant.
  // The pictures inside a generation have their own ceiling as a backstop.
  'designs/generate': 9,
  'designs/generate-image': 30,
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
  readonly reason: 'calls' | 'dollars';
  /**
   * `message` IS the user-facing Hebrew (the same convention as
   * DemoBlockedError below): every route already answers a failure with
   * `error: err.message`, so the warm sentence reaches her without a per-route
   * edit. The numbers stay on the fields, for logs.
   */
  constructor(callSite: string, used: number, cap: number, reason: 'calls' | 'dollars' = 'calls') {
    super(capRefusalHe(reason, callSite));
    this.name = 'AiCapExceededError';
    this.callSite = callSite;
    this.used = used;
    this.cap = cap;
    this.reason = reason;
  }
}

/**
 * The usage counter could not be read, so the call was refused rather than
 * allowed blind. Not "she used her allowance" - nothing is known about that -
 * so it has its own class and its own sentence.
 */
export class AiCapUnavailableError extends Error {
  readonly callSite: string;
  constructor(callSite: string) {
    super(capRefusalHe('unreadable', callSite));
    this.name = 'AiCapUnavailableError';
    this.callSite = callSite;
  }
}

/**
 * Raised by trackedCreate and generateImage for a demo tenant (lib/demoTenants.ts),
 * checked BEFORE the cap or the API call - a demo account must never spend real
 * money, and that has to be true regardless of whatever cap math runs after it.
 * Same shape as AiCapExceededError on purpose, so a caller catching one already
 * knows the pattern for the other: check `error.name`, show a specific message,
 * never let it read as a generic failure.
 */
export class DemoBlockedError extends Error {
  readonly callSite: string;
  constructor(callSite: string) {
    // The message IS the user-facing string, deliberately - every route that
    // calls trackedCreate/generateImage already catches its own errors with
    // `catch (err) { return NextResponse.json({ error: err.message }, ...) }`
    // and every caller already does `toast(data.error)`. Making the message
    // itself be the exact demo-preview copy means the right toast shows up
    // everywhere for free, with no per-route edit - see app/api/advisor's
    // handleAsk for the pattern this relies on.
    super('זו תצוגה - במערכת שלך זה באמת יישלח');
    this.name = 'DemoBlockedError';
    this.callSite = callSite;
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
  /** true when the call must be refused: over the cap, OR the count could not be read */
  exceeded: boolean;
  /** true when the count could not be read (and `exceeded` is therefore true) */
  unknown: boolean;
};

/**
 * How much of this month's allowance for one feature a tenant has used.
 *
 * FAILS CLOSED: an unreadable count returns exceeded:true, unknown:true. Every
 * caller that only ever looked at `.exceeded` therefore refuses, with no edit.
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

  const since = monthStartIso(opts.now);

  try {
    const table =
      opts.db ??
      ((admin() as unknown as { from: (t: string) => CountQuery }).from('ai_usage'));
    const { count, error } = await table
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('call_site', callSite)
      .gte('created_at', since);

    if (error || count === null || count === undefined) {
      console.error(
        `[ai-cap] count failed for tenant ${tenantId} / ${callSite}: ` +
        `${error?.message ?? 'null count'} - failing CLOSED (call refused)`
      );
      return { used: 0, cap, exceeded: true, unknown: true };
    }

    const used = Number(count) || 0;
    return { used, cap, exceeded: used >= cap, unknown: false };
  } catch (e) {
    console.error(
      `[ai-cap] threw for tenant ${tenantId} / ${callSite}: ` +
      `${e instanceof Error ? e.message : String(e)} - failing CLOSED (call refused)`
    );
    return { used: 0, cap, exceeded: true, unknown: true };
  }
}

// ── the dollar ceiling ──────────────────────────────────────────────────────

/**
 * The most one tenant may cost per calendar month (Israel time), across every
 * feature, in USD. Tunable with AI_TENANT_MONTHLY_USD; anything that is not a
 * positive number - unset, junk, zero, negative - falls back to the default,
 * never to "no ceiling".
 *
 * $25: roughly twice what heavy honest use costs (the table at the top of this
 * file puts realistic use at $4-11), and well under what pinning every count cap
 * in one month would cost (about $60).
 */
export const DEFAULT_TENANT_MONTHLY_USD = 25;
export function tenantMonthlyUsdCeiling(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.AI_TENANT_MONTHLY_USD);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TENANT_MONTHLY_USD;
}

/**
 * What a usage row with no price is assumed to have cost. cost_usd is null when
 * the model is missing from MODEL_RATES; counting that as free would make an
 * unpriced model a way around the ceiling.
 */
export const UNPRICED_ROW_USD = 0.05;

/** Within this share of either ceiling she is told, warmly, before being stopped. */
export const NEAR_LIMIT = 0.8;

export type AllowanceReason = 'ok' | 'calls' | 'dollars' | 'unreadable';

export type Allowance = {
  allowed: boolean;
  reason: AllowanceReason;
  callSite: string;
  callsUsed: number;
  callsCap: number | null;
  /** null when it could not be summed */
  spentUsd: number | null;
  usdCap: number;
  /** allowed, but within NEAR_LIMIT of a ceiling */
  near: boolean;
  nearWhat?: 'calls' | 'dollars';
};

type Client = { from: (t: string) => any };

// Summed spend per tenant, kept for a few seconds so a burst of calls (a bot
// answering a stream of messages) does not re-read a month of rows each time. A
// failed read is never cached, so an outage is never remembered as "fine".
const SPEND_TTL_MS = 20_000;
const spendCache = new Map<string, { at: number; usd: number }>();

async function monthlySpendUsd(client: Client, tenantId: string, since: string, useCache: boolean): Promise<number | null> {
  const key = `${tenantId}|${since}`;
  const hit = useCache ? spendCache.get(key) : undefined;
  if (hit && Date.now() - hit.at < SPEND_TTL_MS) return hit.usd;
  try {
    const r = await readAllRows(client, 'ai_usage', {
      columns: 'id, cost_usd',
      order: 'id',
      filter: (q: any) => q.eq('tenant_id', tenantId).gte('created_at', since),
      ceiling: 50_000,
    });
    // Unreadable, or not ALL of it read: an unknown total is not a small one.
    if (r.error || !r.complete || !r.data) return null;
    let usd = 0;
    for (const x of r.data as { cost_usd: number | string | null }[]) {
      const c = x.cost_usd === null || x.cost_usd === undefined ? UNPRICED_ROW_USD : Number(x.cost_usd);
      usd += Number.isFinite(c) ? c : UNPRICED_ROW_USD;
    }
    if (useCache) spendCache.set(key, { at: Date.now(), usd });
    return usd;
  } catch {
    return null;
  }
}

type AlertFn = (a: { reason: 'unreadable' | 'dollars'; tenantId: string; callSite: string; detail: string }) => Promise<void>;
const alertedAt = new Map<string, number>();
const ALERT_THROTTLE_MS = 30 * 60 * 1000;

/**
 * Tell the operator, through the same three channels as every other alert
 * (lib/opsAlert.js): the log, the admin panel, WhatsApp. Imported lazily so
 * this module stays loadable without a WhatsApp client, and throttled so a
 * broken counter is one message, not one per AI call.
 */
const defaultAlert: AlertFn = async ({ reason, tenantId, callSite, detail }) => {
  const { raiseOpsAlert } = await import('../opsAlert.js');
  const { sendWhatsApp } = await import('../whatsapp.js');
  await raiseOpsAlert({
    db: admin() as never,
    send: sendWhatsApp,
    to: String(process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || '').trim(),
    source: 'ai-cap',
    severity: reason === 'unreadable' ? 'error' : 'warning',
    message:
      reason === 'unreadable'
        ? `מונה ה-AI לא נקרא - כל קריאות ה-AI נחסמות עד שיתוקן (נכשל ב-${callSite}). ${detail}`
        : `עסק ${String(tenantId).slice(0, 8)} הגיע לתקרת ההוצאה החודשית על AI (${detail}). הקריאות שלה נעצרות עד ה-1 בחודש.`,
    details: { reason, tenantId, callSite, detail },
  });
};

async function raise(a: Parameters<AlertFn>[0], send: AlertFn, throttle: Map<string, number>): Promise<void> {
  // One alert per cause: a broken counter is global, so it is keyed by reason
  // alone; a tenant hitting her ceiling is keyed by tenant.
  const key = a.reason === 'unreadable' ? 'unreadable' : `dollars:${a.tenantId}`;
  const last = throttle.get(key) ?? 0;
  if (Date.now() - last < ALERT_THROTTLE_MS) return;
  throttle.set(key, Date.now());
  try { await send(a); } catch (e) { console.error('[ai-cap] could not raise the ops alert:', e instanceof Error ? e.message : String(e)); }
}

/**
 * May this tenant make this AI call right now?
 *
 * Refuses, in this order of precedence, when: the counter or the month's spend
 * cannot be read ('unreadable'); the feature's call cap is reached ('calls');
 * the tenant's dollar ceiling is reached ('dollars'). Allowed otherwise, with
 * `near` set when she is within NEAR_LIMIT of either, so the caller can tell her
 * warmly (capNoticeHe) before she is stopped.
 *
 * Unattributed calls (no tenant) are not capped, as in getCallCapStatus.
 * `opts` exists for tests: an injected client/clock/alert and no spend cache.
 */
export async function checkAiAllowance(
  tenantId: string | null | undefined,
  callSite: string,
  opts: { client?: Client; now?: Date; alert?: AlertFn; noCache?: boolean; alertThrottle?: Map<string, number> } = {}
): Promise<Allowance> {
  try {
    return await checkAiAllowanceUnsafe(tenantId, callSite, opts);
  } catch (e) {
    // Nothing in here may throw into a caller: any surprise (no database
    // configured, a client that cannot be built) is an unreadable counter, and an
    // unreadable counter refuses.
    console.error(`[ai-cap] allowance check threw for tenant ${tenantId} / ${callSite}: ${e instanceof Error ? e.message : String(e)} - failing CLOSED (call refused)`);
    if (tenantId) await raise({ reason: 'unreadable', tenantId, callSite, detail: 'בדיקת המכסה נכשלה' }, opts.alert ?? defaultAlert, opts.alertThrottle ?? alertedAt);
    return { allowed: false, reason: 'unreadable', callSite, callsUsed: 0, callsCap: capFor(callSite), spentUsd: null, usdCap: tenantMonthlyUsdCeiling(), near: false };
  }
}

async function checkAiAllowanceUnsafe(
  tenantId: string | null | undefined,
  callSite: string,
  opts: { client?: Client; now?: Date; alert?: AlertFn; noCache?: boolean; alertThrottle?: Map<string, number> }
): Promise<Allowance> {
  const usdCap = tenantMonthlyUsdCeiling();
  const callsCap = capFor(callSite);
  const base = { callSite, callsUsed: 0, callsCap, spentUsd: 0, usdCap, near: false } as const;
  if (!tenantId) return { ...base, allowed: true, reason: 'ok' };

  const client: Client = opts.client ?? (admin() as unknown as Client);
  const send = opts.alert ?? defaultAlert;
  const throttle = opts.alertThrottle ?? alertedAt;
  const since = monthStartIso(opts.now);

  const status = await getCallCapStatus(tenantId, callSite, { now: opts.now, db: client.from('ai_usage') as CountQuery });
  if (status.unknown) {
    await raise({ reason: 'unreadable', tenantId, callSite, detail: 'ספירת הקריאות נכשלה' }, send, throttle);
    return { ...base, allowed: false, reason: 'unreadable', spentUsd: null };
  }

  const spent = await monthlySpendUsd(client, tenantId, since, !opts.noCache);
  if (spent === null) {
    console.error(`[ai-cap] spend sum failed for tenant ${tenantId} - failing CLOSED (call refused)`);
    await raise({ reason: 'unreadable', tenantId, callSite, detail: 'סכום ההוצאה החודשית לא נקרא' }, send, throttle);
    return { ...base, allowed: false, reason: 'unreadable', callsUsed: status.used, spentUsd: null };
  }

  if (status.exceeded) {
    return { ...base, allowed: false, reason: 'calls', callsUsed: status.used, spentUsd: spent };
  }
  if (spent >= usdCap) {
    await raise({ reason: 'dollars', tenantId, callSite, detail: `$${spent.toFixed(2)} מתוך $${usdCap}` }, send, throttle);
    return { ...base, allowed: false, reason: 'dollars', callsUsed: status.used, spentUsd: spent };
  }

  const nearCalls = callsCap !== null && status.used >= callsCap * NEAR_LIMIT;
  const nearUsd = spent >= usdCap * NEAR_LIMIT;
  return {
    ...base, allowed: true, reason: 'ok', callsUsed: status.used, spentUsd: spent,
    near: nearCalls || nearUsd,
    ...(nearCalls ? { nearWhat: 'calls' as const } : nearUsd ? { nearWhat: 'dollars' as const } : {}),
  };
}

/**
 * A counter OTHER than the AI call counter (the skin scanner's) could not be
 * read: same alert, same throttle, one message however many calls were refused.
 */
export async function reportCounterFailure(
  tenantId: string,
  callSite: string,
  detail: string,
  alert: AlertFn = defaultAlert
): Promise<void> {
  await raise({ reason: 'unreadable', tenantId, callSite, detail }, alert, alertedAt);
}
