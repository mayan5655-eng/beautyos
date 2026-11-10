// lib/billing/requestIdReady.ts
//
// SERVER ONLY. Can add-on packs be bought on this database? Only once billing_payments.request_id exists
// (supabase/migrations/add_addon_request_id_2026-11-10.sql): that column is what makes a purchase idempotent (lib/billing/service.ts
// buyAddon), and without it a pack is NOT purchasable at all (fail closed, Vercel review 2026-11-10). The upgrades read and the billing
// status use this to report packs as unavailable, so the store, the chips and the cap-hit offers hide them exactly as with packs off.
//
// A cheap probe (select request_id ... limit 0), cached per server instance: "ready" is cached for good (a column is never dropped by
// this app), "not ready" for a minute, so the packs appear within a minute of the migration running. Any error is "not ready".
import { isMissingColumnError } from '../pgError.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (t: string) => any };

const NOT_READY_TTL_MS = 60_000;
let ready = false;
let checkedAt = 0;

export async function addonRequestIdReady(db: Db, now: number = Date.now()): Promise<boolean> {
  if (ready) return true;
  if (checkedAt && now - checkedAt < NOT_READY_TTL_MS) return false;
  try {
    const { error } = await db.from('billing_payments').select('request_id').limit(0);
    if (!error) { ready = true; return true; }
    if (!isMissingColumnError(error)) console.error('[billing] request_id probe failed:', error.message);
  } catch (e) {
    console.error('[billing] request_id probe threw:', e instanceof Error ? e.message : String(e));
  }
  checkedAt = now;
  return false;
}

/** Tests only. */
export function resetAddonRequestIdProbe(): void { ready = false; checkedAt = 0; }
