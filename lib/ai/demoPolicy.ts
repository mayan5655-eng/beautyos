// lib/ai/demoPolicy.ts
//
// What a DEMO tenant (lib/demoTenants.ts) may do with AI, now that voice is no longer switched off in the public demo.
//
// Until now every AI call from a demo tenant was refused with "זו תצוגה - במערכת שלך זה באמת יישלח" (lib/ai/usage.ts guardSpend). That kept
// the bill at zero and also hid the strongest moment in the product: a visitor tries voice, is told "this is a demo", and learns
// nothing. The rule is now narrow and has three parts:
//
//   1. ONE call site is open to a demo tenant: voice-intent. Every other AI feature stays blocked exactly as before.
//   2. Only READ-ONLY commands come back from it ("what do I have today", "how much did I earn this month"). A command that would write,
//      send or charge (book, cancel, receipt, call) is answered with the existing demo notice, by the SERVER, before the client sees it.
//   3. A small DAILY spend cap on the demo tenant. When it is reached - or when it cannot be read - the call is refused with the same
//      existing notice, never an error. (A visitor cannot run up a bill; at ~$0.002 a call the default is about a hundred calls a day.)

import { createClient } from '@supabase/supabase-js';
import { readAllRows } from '../pagedRead.js';
import { isDemoTenantId } from '../demoTenants.ts';
import { israelDate, israelToUtcIso } from '../demoWeek.ts';

/** The only AI call site a demo tenant may use. */
export const DEMO_AI_CALL_SITES: ReadonlySet<string> = new Set(['voice-intent']);

/** The voice actions that only READ. "unknown" is the model not understanding: nothing to protect. */
export const READ_ONLY_VOICE_ACTIONS: ReadonlySet<string> = new Set(['show_day', 'revenue_summary', 'unknown']);

/** May this voice action be shown to this tenant? A real tenant: always. A demo tenant: only the read-only ones. */
export function voiceActionAllowed(tenantId: string | null | undefined, action: unknown): boolean {
  if (!isDemoTenantId(tenantId)) return true;
  return READ_ONLY_VOICE_ACTIONS.has(String(action ?? 'unknown'));
}

/** USD the demo tenant may spend in one Israeli day. AI_DEMO_DAILY_USD overrides; junk, zero or negative falls back to the default. */
export const DEFAULT_DEMO_DAILY_USD = 0.25;
export function demoDailyUsdCeiling(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.AI_DEMO_DAILY_USD);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DEMO_DAILY_USD;
}
/** A second wall in calls (the dollar figure is a sum of priced rows; a count cannot be fooled by an unpriced one). */
export const DEMO_DAILY_CALLS = 80;

/** Start of today in Israel, as a UTC instant. */
export function dayStartIso(now: Date = new Date()): string {
  return israelToUtcIso(israelDate(now), 0);
}

/** An unpriced row is assumed to have cost this much, as in lib/ai/callCaps.ts. */
const UNPRICED_ROW_USD = 0.05;

export type DemoDaily = {
  allowed: boolean;
  reason: 'ok' | 'dollars' | 'calls' | 'unreadable';
  usedUsd: number | null;
  calls: number | null;
};

let cachedClient: { from: (t: string) => any } | null = null;
function admin() {
  if (!cachedClient) {
    cachedClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } }) as unknown as { from: (t: string) => any };
  }
  return cachedClient;
}

/**
 * Today's AI spend of this demo tenant, against its daily cap. FAILS CLOSED like every spend control here: if ai_usage cannot be read (or
 * not ALL of it was read) the answer is "not allowed", which the caller turns into the ordinary demo notice.
 */
export async function getDemoDailyStatus(
  tenantId: string,
  opts: { client?: { from: (t: string) => any }; now?: Date; env?: Record<string, string | undefined> } = {}
): Promise<DemoDaily> {
  try {
    const client = opts.client ?? admin();
    const since = dayStartIso(opts.now);
    const r = await readAllRows(client, 'ai_usage', {
      columns: 'id, cost_usd',
      order: 'id',
      filter: (q: any) => q.eq('tenant_id', tenantId).gte('created_at', since),
      ceiling: 5_000,
    });
    if (r.error || !r.complete || !r.data) return { allowed: false, reason: 'unreadable', usedUsd: null, calls: null };
    const rows = r.data as { cost_usd: number | string | null }[];
    let usd = 0;
    for (const x of rows) {
      const c = x.cost_usd === null || x.cost_usd === undefined ? UNPRICED_ROW_USD : Number(x.cost_usd);
      usd += Number.isFinite(c) && c > 0 ? c : UNPRICED_ROW_USD;
    }
    if (rows.length >= DEMO_DAILY_CALLS) return { allowed: false, reason: 'calls', usedUsd: usd, calls: rows.length };
    if (usd >= demoDailyUsdCeiling(opts.env)) return { allowed: false, reason: 'dollars', usedUsd: usd, calls: rows.length };
    return { allowed: true, reason: 'ok', usedUsd: usd, calls: rows.length };
  } catch {
    return { allowed: false, reason: 'unreadable', usedUsd: null, calls: null };
  }
}
