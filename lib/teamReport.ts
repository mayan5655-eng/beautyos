// lib/teamReport.ts
//
// "לפי מטפלת" (lib/team.ts): visits and income per staff member, this month so far, for the monthly report sheet. Pure.
// Shown only in team mode (two or more active staff). The same month and the same money as the monthly report above it
// (lib/monthlyReport.ts: live receipts, the Israeli day, net of VAT through `net`), so the rows add up to its total:
//   - a visit is a client appointment this month up to today, not cancelled, not a no-show, not a personal block;
//   - a payment belongs to the person of the appointment it was taken for (receipts.appointment_id); a payment with no appointment
//     (a walk-in at the till, a product, a gift voucher) is the owner's, the same rule as appointments: no staff = the owner.

import { israelDay, type IsraelDay } from './monthlyReport.ts';
import { orderedStaff, staffOfAppt, type Staff } from './team.ts';

export type TeamRow = { id: string; name: string; color: string; active: boolean; visits: number; income: number };

type Appt = { id?: unknown; date?: unknown; staff_id?: unknown; confirmation_status?: unknown; kind?: unknown };
type Receipt = { amount?: unknown; created_at?: unknown; appointment_id?: unknown };

const isVisit = (a: Appt) => a.kind !== 'personal' && a.confirmation_status !== 'cancelled' && a.confirmation_status !== 'no_show';

export function teamMonthReport(i: { staff: Staff[]; appointments: Appt[]; receipts: Receipt[]; now: Date; net?: (gross: number) => number }): TeamRow[] {
  const today = israelDay(i.now) as IsraelDay;
  const inMonth = (d: IsraelDay | null) => !!d && d.year === today.year && d.month === today.month && d.n <= today.n;
  const net = i.net || ((g: number) => g);
  const rows = new Map<string, { s: Staff; visits: number; gross: number }>();
  for (const s of orderedStaff(i.staff)) rows.set(s.id, { s, visits: 0, gross: 0 });
  const slot = (a: Appt) => { const s = staffOfAppt(a, i.staff); return s ? rows.get(s.id) : undefined; };

  const byId = new Map<string, Appt>();
  for (const a of i.appointments || []) {
    if (a && a.id != null) byId.set(String(a.id), a);
    if (!a || !isVisit(a) || !inMonth(israelDay(`${String(a.date || '').slice(0, 10)}T12:00:00Z`))) continue;
    const r = slot(a);
    if (r) r.visits++;
  }
  for (const rc of i.receipts || []) {
    if (!rc || !inMonth(israelDay(rc.created_at as string))) continue;
    const a = rc.appointment_id != null && rc.appointment_id !== '' ? byId.get(String(rc.appointment_id)) : undefined;
    const r = slot(a || {});
    if (r) r.gross += Number(rc.amount) || 0;
  }
  return [...rows.values()]
    .filter((r) => r.s.active || r.visits > 0 || r.gross > 0)
    .map((r) => ({ id: r.s.id, name: r.s.name, color: r.s.color, active: r.s.active, visits: r.visits, income: Math.round(net(r.gross)) }));
}
