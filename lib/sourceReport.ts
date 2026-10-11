// lib/sourceReport.ts
//
// "Revenue by source": for every place her leads came from, how many leads, how many became clients, how much
// those clients paid, and (when ad spend is known) what each lead and each client cost.
//
// Rules, because each one is a place a report quietly lies:
//   - Cohort view. The leads created inside the range, and what THEIR clients have paid to date. Spend is the
//     spend inside the same range. A report that mixed "this month's spend" with "all-time receipts" would
//     flatter every source.
//   - A lead is converted when it is closed/converted OR it points at a client (handleConvertLead writes
//     client_id). Leads that only ever had a status of "closed" with no client count as converted but earn 0.
//   - A client is attributed ONCE, to the earliest lead that points at her, so two leads for one client never
//     double her receipts.
//   - Revenue is live receipts only (the caller passes receipts with voids already removed) and excludes tips.
//   - Ratios are null, not 0 or Infinity, when the denominator is 0: "no spend recorded" must not read as a
//     free source.

import { sourceLabelHe } from './leadSources.ts';

export type LeadRow = { id?: unknown; source?: unknown; status?: unknown; client_id?: unknown; created_at?: string | null };
export type ReceiptRow = { client_id?: unknown; amount?: unknown; voided?: unknown };
export type SpendRow = { day?: string | null; source?: unknown; amount?: unknown };

export type SourceRow = {
  key: string;
  label: string;
  leads: number;
  conversions: number;
  conversionRate: number;
  revenue: number;
  avgRevenuePerLead: number | null;
  spend: number;
  costPerLead: number | null;
  costPerAcquisition: number | null;
  roas: number | null;
  roiPercent: number | null;
};

export type SourceReport = { rows: SourceRow[]; totals: SourceRow };

const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);
const round = (n: number | null, d = 2): number | null => (n === null ? null : Math.round(n * 10 ** d) / 10 ** d);

const CONVERTED = new Set(['closed', 'converted']);
const UNKNOWN = '__unknown__';
const keyOf = (src: unknown): string => { const s = String(src ?? '').trim(); return s || UNKNOWN; };

function finish(key: string, label: string, a: { leads: number; conversions: number; revenue: number; spend: number }): SourceRow {
  return {
    key, label,
    leads: a.leads,
    conversions: a.conversions,
    conversionRate: a.leads > 0 ? Math.round((a.conversions / a.leads) * 100) : 0,
    revenue: Math.round(a.revenue * 100) / 100,
    avgRevenuePerLead: round(ratio(a.revenue, a.leads)),
    spend: Math.round(a.spend * 100) / 100,
    costPerLead: a.spend > 0 ? round(ratio(a.spend, a.leads)) : null,
    costPerAcquisition: a.spend > 0 ? round(ratio(a.spend, a.conversions)) : null,
    roas: round(ratio(a.revenue, a.spend)),
    roiPercent: a.spend > 0 ? Math.round(((a.revenue - a.spend) / a.spend) * 100) : null,
  };
}

/**
 * @param from/to  inclusive ISO day keys (YYYY-MM-DD) bounding lead creation and spend; null = unbounded.
 */
export function buildSourceReport(
  leads: LeadRow[],
  receipts: ReceiptRow[],
  spend: SpendRow[] = [],
  range: { from?: string | null; to?: string | null } = {},
): SourceReport {
  const from = range.from || null;
  const to = range.to || null;
  const inRange = (iso: string | null | undefined) => {
    const d = String(iso || '').slice(0, 10);
    if (!d) return !from && !to;
    return (!from || d >= from) && (!to || d <= to);
  };

  const paidByClient = new Map<string, number>();
  for (const r of receipts) {
    if (r.client_id == null || r.client_id === '' || r.voided) continue;
    const k = String(r.client_id);
    paidByClient.set(k, (paidByClient.get(k) || 0) + num(r.amount));
  }

  // The earliest lead (over ALL leads, not just the range) is the one that brought a client in.
  const firstLeadOfClient = new Map<string, LeadRow>();
  for (const l of leads) {
    if (l.client_id == null || l.client_id === '') continue;
    const k = String(l.client_id);
    const prev = firstLeadOfClient.get(k);
    if (!prev || String(l.created_at || '') < String(prev.created_at || '')) firstLeadOfClient.set(k, l);
  }

  const acc = new Map<string, { leads: number; conversions: number; revenue: number; spend: number }>();
  const bucket = (k: string) => {
    let a = acc.get(k);
    if (!a) { a = { leads: 0, conversions: 0, revenue: 0, spend: 0 }; acc.set(k, a); }
    return a;
  };

  for (const l of leads) {
    if (!inRange(l.created_at)) continue;
    const a = bucket(keyOf(l.source));
    a.leads += 1;
    const hasClient = l.client_id != null && l.client_id !== '';
    if (hasClient || CONVERTED.has(String(l.status || ''))) a.conversions += 1;
    if (hasClient && firstLeadOfClient.get(String(l.client_id)) === l) {
      a.revenue += paidByClient.get(String(l.client_id)) || 0;
    }
  }
  for (const s of spend) {
    if (!inRange(s.day)) continue;
    bucket(keyOf(s.source)).spend += num(s.amount);
  }

  const rows = [...acc.entries()]
    .map(([k, a]) => finish(k, k === UNKNOWN ? 'לא ידוע' : sourceLabelHe(k), a))
    .sort((x, y) => y.revenue - x.revenue || y.leads - x.leads || x.label.localeCompare(y.label, 'he'));

  const sum = rows.reduce((t, r) => ({ leads: t.leads + r.leads, conversions: t.conversions + r.conversions, revenue: t.revenue + r.revenue, spend: t.spend + r.spend }), { leads: 0, conversions: 0, revenue: 0, spend: 0 });
  return { rows, totals: finish('__total__', 'סך הכל', sum) };
}

/** Flat rows for the Excel export: header first, plain strings and numbers, Hebrew labels. */
export function reportToSheetRows(report: SourceReport, hasSpend: boolean): (string | number)[][] {
  const head = ['מקור', 'לידים', 'הומרו ללקוחות', 'אחוז המרה', 'הכנסות (₪)', 'הכנסה ממוצעת לליד (₪)'];
  if (hasSpend) head.push('הוצאת פרסום (₪)', 'עלות לליד (₪)', 'עלות ללקוחה (₪)', 'ROAS', 'ROI %');
  const line = (r: SourceRow): (string | number)[] => {
    const base: (string | number)[] = [r.label, r.leads, r.conversions, r.conversionRate, r.revenue, r.avgRevenuePerLead ?? ''];
    if (hasSpend) base.push(r.spend, r.costPerLead ?? '', r.costPerAcquisition ?? '', r.roas ?? '', r.roiPercent ?? '');
    return base;
  };
  return [head, ...report.rows.map(line), line(report.totals)];
}
