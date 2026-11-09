// lib/monthlyFullLoad.ts
//
// Reads what lib/monthlyFull.ts needs for one tenant and one month, with a service-role client (the cron) or the same client
// after the session tenant was resolved (/api/monthly-report). Every query is scoped to the tenant here, never left to RLS.
//
// Failure rules, the weekly digest's (lib/weeklyDigestLoad.ts): receipts, voids, appointments and clients are the numbers, so
// a failed or incomplete read throws and nothing is shown or sent; a wrong number is worse than none. The gift voucher ledger is
// only one line, so a failed read leaves "redeemed" out (null), never shown as 0.

import { readAllRows } from './pagedRead.js';
import { liveReceipts } from './till.ts';
import { giftVouchersVisible } from './giftVouchers.ts';
import { productsVisible } from './products.ts';
import { previousMonth } from './monthlyReport.ts';
import { buildMonthFull, monthBounds, type MonthRef, type MonthFull } from './monthlyFull.ts';

type Db = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export type MonthlySettings = { automations?: unknown; feature_flags?: unknown; business_tax_status?: unknown } | null;

/** The VAT rate for a year (18% from 2025), the same rule as the income screen. */
export const vatRateForYear = (y: number) => (Number(y) >= 2025 ? 0.18 : 0.17);

const dayBefore = (key: string) => { const d = new Date(`${key}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
const dayAfter = (key: string) => { const d = new Date(`${key}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 2); return d.toISOString().slice(0, 10); };

export async function loadMonthFull(db: Db, tenantId: string, settings: MonthlySettings, month: MonthRef, now: Date): Promise<MonthFull> {
  const prev = previousMonth(month.year, month.month);
  // A day early and a day late: a bare date bound is UTC midnight, two or three hours off the Israeli day. Cut by Israeli day later.
  const since = dayBefore(monthBounds(prev).from);
  const until = dayAfter(monthBounds(month).to);
  const byTenant = (q: any) => q.eq('tenant_id', tenantId); // eslint-disable-line @typescript-eslint/no-explicit-any
  const showVouchers = giftVouchersVisible(settings as never);
  const showProducts = productsVisible(settings as never);

  const [rc, ap, cl] = await Promise.all([
    readAllRows(db, 'receipts', { columns: 'id, amount, created_at, service, items', filter: (q: any) => byTenant(q).gte('created_at', since).lt('created_at', until) }), // eslint-disable-line @typescript-eslint/no-explicit-any
    // All of her appointments: first visits, "has she come back" and "is something booked ahead" need the whole history.
    readAllRows(db, 'appointments', { columns: 'id, client_id, date, confirmation_status, kind', filter: byTenant }),
    // '*': an archived card (status) is not on every schema version, so no column list can name it safely.
    readAllRows(db, 'clients', { columns: '*', filter: byTenant }),
  ]);
  const broken = [rc, ap, cl].find((r) => r.error || !r.complete);
  if (broken) throw new Error(`monthly reads failed: ${broken.error?.message || 'incomplete read'}`);

  const ids = (rc.data || []).map((r: { id: unknown }) => r.id);
  let voids: { receipt_id?: unknown; credit_status?: string | null }[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const v = await db.from('receipt_voids').select('receipt_id, credit_status').in('receipt_id', ids.slice(i, i + 200));
    // A failed read is not "nothing voided": voided receipts would count as income.
    if (v.error) throw new Error(`voids read failed: ${v.error.message}`);
    voids = voids.concat(v.data || []);
  }

  let ledger: { kind?: unknown; amount?: unknown; created_at?: unknown }[] | null = null;
  if (showVouchers) {
    const l = await db.from('gift_voucher_ledger').select('kind, amount, created_at').eq('tenant_id', tenantId)
      .gte('created_at', dayBefore(monthBounds(month).from)).lt('created_at', until).limit(5000);
    ledger = l.error ? null : (l.data || []);
  }

  return buildMonthFull({
    month, now,
    receipts: liveReceipts(rc.data || [], voids),
    appointments: ap.data || [],
    clients: cl.data || [],
    status: String(settings?.business_tax_status || 'exempt'),
    vatRate: vatRateForYear(month.year),
    showProducts, showVouchers, voucherLedger: ledger,
  });
}
