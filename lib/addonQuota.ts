// lib/addonQuota.ts
//
// SERVER ONLY. How many add-on units a business bought for THIS month (Israel calendar), per pack (lib/pricing.ts ADDON_PACKS), read from
// billing_addons with the service role. lib/ai/callCaps.ts and lib/skinScanQuota.ts add these to the included amount when packs are on.
//
// Failure is quiet but never generous: if the table is missing (add_billing_addons.sql not run yet) or the read fails, she is credited
// zero packs and the included amount still applies. A pack row exists only after its charge succeeded (lib/billing/service.ts buyAddon).
import { createClient } from '@supabase/supabase-js';
import { ADDON_PACK_KEYS, type AddonPackKey } from './pricing.ts';

export type Purchased = { units: number; usd: number };
export type PurchasedByPack = Record<AddonPackKey, Purchased>;

type Client = { from: (t: string) => any };

export const emptyPurchased = (): PurchasedByPack =>
  Object.fromEntries(ADDON_PACK_KEYS.map((k) => [k, { units: 0, usd: 0 }])) as PurchasedByPack;

/** The first day of this month in Israel, as the date stored in billing_addons.period_month: "2026-10-01". */
export function periodMonth(now: Date = new Date()): string {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return `${ymd.slice(0, 7)}-01`;
}

let cached: Client | null = null;
function admin(): Client {
  if (cached) return cached;
  cached = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } }) as unknown as Client;
  return cached;
}

const TTL_MS = 20_000;
const memo = new Map<string, { at: number; v: PurchasedByPack }>();

/** Clears the short cache, so a pack bought a second ago counts on her very next call (the purchase route calls it). */
export function forgetPurchased(tenantId: string): void {
  for (const k of memo.keys()) if (k.startsWith(`${tenantId}|`)) memo.delete(k);
}

export async function purchasedAddons(tenantId: string, opts: { client?: Client; now?: Date; noCache?: boolean } = {}): Promise<PurchasedByPack> {
  const month = periodMonth(opts.now);
  const key = `${tenantId}|${month}`;
  const hit = opts.noCache || opts.client ? undefined : memo.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.v;
  const out = emptyPurchased();
  try {
    const { data, error } = await (opts.client ?? admin()).from('billing_addons').select('pack, units, usd_allowance').eq('tenant_id', tenantId).eq('period_month', month);
    if (error) {
      if (!/does not exist|schema cache|42P01/i.test(String(error.message))) console.error('[addons] read failed for tenant', tenantId, error.message);
      return out;
    }
    for (const r of (data || []) as { pack: string; units: number | string; usd_allowance: number | string | null }[]) {
      const p = out[r.pack as AddonPackKey];
      if (!p) continue;
      p.units += Math.max(0, Math.floor(Number(r.units) || 0));
      p.usd += Math.max(0, Number(r.usd_allowance) || 0);
    }
  } catch (e) {
    console.error('[addons] read threw for tenant', tenantId, e instanceof Error ? e.message : String(e));
    return out;
  }
  if (!opts.noCache && !opts.client) memo.set(key, { at: Date.now(), v: out });
  return out;
}

export function totalUsd(p: PurchasedByPack): number {
  return ADDON_PACK_KEYS.reduce((s, k) => s + (p[k]?.usd || 0), 0);
}
