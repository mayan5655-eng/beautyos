// lib/waCloud/caps.ts
//
// SERVER ONLY. The spending ceilings every Cloud template send passes, counted from the cost log (wa_cloud_messages):
//
//   per business per Israel day     WA_CLOUD_TENANT_DAILY_CAP    (default 150)
//   per business per Israel month   WA_CLOUD_TENANT_MONTHLY_CAP  (default 400)
//   all businesses per Israel day   WA_CLOUD_GLOBAL_DAILY_CAP    (default 2000)
//
// Only accepted rows of the same mode count: a refused one never left, and a mock row is counted only against mock.
// FAILS CLOSED: a count that cannot be read is a refusal, because then the cost log is not being written either and
// these messages cost money.

import { tenantDailyCap, tenantMonthlyCap, globalDailyCap, type WaCloudEnv } from './config.ts';
import { israelDayStartIso, israelMonthStartIso } from './policy.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any };

const LOG_TABLE = 'wa_cloud_messages';

/** Accepted template sends since `sinceIso` in this mode, for one business or (tenantId null) for all. null = could not read. */
export async function countAccepted(db: Db, o: { tenantId: string | null; mode: 'live' | 'mock'; sinceIso: string }): Promise<number | null> {
  try {
    let q = db.from(LOG_TABLE).select('id', { count: 'exact', head: true });
    if (o.tenantId) q = q.eq('tenant_id', o.tenantId);
    q = q.eq('mode', o.mode).eq('status', 'accepted').gte('created_at', o.sinceIso);
    const { count, error } = await q;
    if (error) return null;
    return Number(count) || 0;
  } catch {
    return null;
  }
}

export type CapReason = 'cap_unreadable' | 'tenant_capped' | 'tenant_monthly_capped' | 'global_daily_capped';
export type CapVerdict =
  | { ok: true; tenantMonth: number; globalDay: number }
  | { ok: false; reason: CapReason; detail: string };

/** The three ceilings. `skipTenantDaily` when the caller already checked the daily one itself. */
export async function checkCaps(db: Db, o: { tenantId: string; mode: 'live' | 'mock'; now: Date; env: WaCloudEnv; skipTenantDaily?: boolean }): Promise<CapVerdict> {
  const unreadable = { ok: false as const, reason: 'cap_unreadable' as const, detail: `${LOG_TABLE} could not be read (has add_wa_cloud.sql run?)` };
  if (!o.skipTenantDaily) {
    const day = await countAccepted(db, { tenantId: o.tenantId, mode: o.mode, sinceIso: israelDayStartIso(o.now) });
    if (day === null) return unreadable;
    const cap = tenantDailyCap(o.env);
    if (day >= cap) return { ok: false, reason: 'tenant_capped', detail: `daily Cloud cap reached (${day}/${cap})` };
  }
  const month = await countAccepted(db, { tenantId: o.tenantId, mode: o.mode, sinceIso: israelMonthStartIso(o.now) });
  if (month === null) return unreadable;
  const mcap = tenantMonthlyCap(o.env);
  if (month >= mcap) return { ok: false, reason: 'tenant_monthly_capped', detail: `monthly Cloud cap reached (${month}/${mcap})` };
  const all = await countAccepted(db, { tenantId: null, mode: o.mode, sinceIso: israelDayStartIso(o.now) });
  if (all === null) return unreadable;
  const gcap = globalDailyCap(o.env);
  if (all >= gcap) return { ok: false, reason: 'global_daily_capped', detail: `global daily Cloud cap reached (${all}/${gcap})` };
  return { ok: true, tenantMonth: month, globalDay: all };
}
