// lib/monthlyFull.ts
//
// "הדוח החודשי שלך": one whole month on one simple page (/dashboard/monthly), for any of the last 12 months, and a short
// in-app note on the 1st that it is ready (app/api/send-monthly-report). The home card (lib/monthlyReport.ts) stays what it
// is: the month so far in a few sentences. This file is its full-page sibling and reuses its pieces, so the two never count
// differently:
//   * money: live receipts only (voided ones removed by the loader, lib/till liveReceipts), summed through incomeTotals
//     (lib/incomePeriod) exactly like the income screen: an exempt dealer sees her takings, a dealer who charges VAT sees them
//     without it. Tips are not part of amount, so they are not part of this either.
//   * the Israeli day of every row (lib/monthlyReport.ts israelDay), never the server's zone;
//   * treatments: lib/monthlyReport.ts treatmentShares (a discount comes off every line, products and gift voucher sales are
//     not treatments), products: lib/products.ts productShares, voucher sales: lib/giftVouchers.ts isVoucherSaleReceipt.
//
// Pure: no database, no clock of its own. Copy: feminine second person, Hebrew first, no dash of any kind (a test checks).

import { israelDay, treatmentShares, daysInMonth, previousMonth, type ReportReceipt } from './monthlyReport.ts';
import { incomeTotals } from './incomePeriod.js';
import { isVoucherSaleReceipt } from './giftVouchers.ts';
import { isProductOnlyReceipt, productShares } from './products.ts';
import { tenantFlags } from './featureFlags.ts';

export const MONTHS_HE = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
/** "Haven't come back": last visit between 60 days and a year ago, and nothing booked ahead. */
export const LAPSED_MIN_DAYS = 60;
export const LAPSED_MAX_DAYS = 365;
export const LAPSED_SHOWN = 6;
export const MONTHS_BACK = 12;
export const MONTHLY_FLAG = 'monthly_report_page';

export type MonthRef = { year: number; month: number }; // month 0-based

export const monthKey = (m: MonthRef) => `${m.year}-${String(m.month + 1).padStart(2, '0')}`;
export const monthLabel = (m: MonthRef) => `${MONTHS_HE[m.month]} ${m.year}`;

export function parseMonthKey(v: unknown): MonthRef | null {
  const r = /^(\d{4})-(\d{2})$/.exec(String(v ?? '').trim());
  if (!r) return null;
  const year = Number(r[1]), month = Number(r[2]) - 1;
  if (year < 2000 || year > 2100 || month < 0 || month > 11) return null;
  return { year, month };
}

export function currentMonth(now: Date): MonthRef {
  const d = israelDay(now)!;
  return { year: d.year, month: d.month };
}

/** The report opens on the last whole month: on the 1st that is the month that just ended. */
export const defaultReportMonth = (now: Date): MonthRef => { const c = currentMonth(now); return previousMonth(c.year, c.month); };

const cmp = (a: MonthRef, b: MonthRef) => (a.year - b.year) * 12 + (a.month - b.month);

/** The months she can open, newest first: this month so far, then the 12 before it. */
export function availableMonths(now: Date, back = MONTHS_BACK): { key: string; label: string; current: boolean }[] {
  const out: { key: string; label: string; current: boolean }[] = [];
  let m = currentMonth(now);
  for (let i = 0; i <= back; i++) {
    out.push({ key: monthKey(m), label: i === 0 ? `${MONTHS_HE[m.month]} עד היום` : monthLabel(m), current: i === 0 });
    m = previousMonth(m.year, m.month);
  }
  return out;
}

/** Is this month one she may open (not in the future, not older than the window)? */
export function monthAllowed(m: MonthRef, now: Date, back = MONTHS_BACK): boolean {
  const c = currentMonth(now);
  const d = cmp(c, m);
  return d >= 0 && d <= back;
}

/** 'YYYY-MM-DD' bounds of a month (for the database reads, which then cut by the Israeli day). */
export function monthBounds(m: MonthRef): { from: string; to: string } {
  const p = (n: number) => String(n).padStart(2, '0');
  return { from: `${m.year}-${p(m.month + 1)}-01`, to: `${m.year}-${p(m.month + 1)}-${p(daysInMonth(m.year, m.month))}` };
}

export type FullAppt = { id?: unknown; client_id?: unknown; date?: unknown; confirmation_status?: unknown; kind?: unknown };
export type FullClient = { id?: unknown; name?: unknown; phone?: unknown; status?: unknown };
export type LedgerRow = { kind?: unknown; amount?: unknown; created_at?: unknown };

export type Change = { cur: number; prev: number; dir: 'up' | 'down' | 'same'; pct: number | null };

/** cur against prev. pct only when there is something to compare with; under 5% either way reads as "the same". */
export function compareMonths(cur: number, prev: number): Change {
  if (prev > 0) {
    const pct = Math.round(((cur - prev) / prev) * 100);
    return { cur, prev, pct: Math.abs(pct), dir: pct >= 5 ? 'up' : pct <= -5 ? 'down' : 'same' };
  }
  return { cur, prev, pct: null, dir: cur > 0 ? 'up' : 'same' };
}

export type MonthFull = {
  key: string;
  monthName: string;
  year: number;
  label: string;
  isCurrent: boolean;
  /** Days counted: the whole month, or 1..today for the month in progress. */
  days: number;
  prevLabel: string;
  prevName: string;
  /** "בספטמבר", or "באותם ימים בספטמבר" for a month in progress: how every comparison names the month before. */
  inPrev: string;
  /** "the same 9 days of October" for a month in progress, else the whole previous month. */
  prevIsPartial: boolean;
  netOfVat: boolean;
  hasData: boolean;
  income: Change;
  visits: Change;
  newClients: number;
  returningClients: number;
  noShows: number;
  avgPerVisit: number | null;
  top: { name: string; income: number }[];
  /** minDays: her win-back period (lib/clientActivity winbackDaysOf), so this list and the win-back list it opens agree. */
  lapsed: { count: number; minDays: number; clients: { id: string; name: string; phone: string; lastVisit: string; days: number }[] };
  products: { income: number; units: number } | null;
  vouchers: { soldCount: number; soldAmount: number; redeemedCount: number | null; redeemedAmount: number | null } | null;
  headline: string;
};

const nis = (x: number) => `₪${Math.round(x).toLocaleString('he-IL')}`;
const notAVisit = (r: ReportReceipt) => isVoucherSaleReceipt(r) || isProductOnlyReceipt(r);
const isVisit = (a: FullAppt) => a.kind !== 'personal' && a.confirmation_status !== 'cancelled' && a.confirmation_status !== 'no_show';
const dayN = (key: string) => israelDay(`${key.slice(0, 10)}T12:00:00Z`)?.n ?? NaN;

export function buildMonthFull(i: {
  month: MonthRef;
  now: Date;
  receipts: ReportReceipt[];        // LIVE receipts covering at least the month before through this month
  appointments: FullAppt[];         // all of her appointments (first visits and "has she come back" need the history)
  clients: FullClient[];
  status: string;                   // business_tax_status ('exempt' shows takings as they are)
  vatRate: number;
  showProducts?: boolean;
  showVouchers?: boolean;
  voucherLedger?: LedgerRow[] | null; // null = could not be read: "redeemed" is left out, never shown as 0
  lapsedMinDays?: number;           // her win-back period (winbackDaysOf); LAPSED_MIN_DAYS when not given
}): MonthFull {
  const today = israelDay(i.now)!;
  const m = i.month;
  const isCurrent = m.year === today.year && m.month === today.month;
  const days = isCurrent ? today.day : daysInMonth(m.year, m.month);
  const prev = previousMonth(m.year, m.month);
  const prevDays = isCurrent ? Math.min(days, daysInMonth(prev.year, prev.month)) : daysInMonth(prev.year, prev.month);
  const inMonth = (d: { year: number; month: number; day: number } | null, ref: MonthRef, lastDay: number) =>
    !!d && d.year === ref.year && d.month === ref.month && d.day <= lastDay;

  const cur: ReportReceipt[] = [], before: ReportReceipt[] = [];
  for (const r of i.receipts || []) {
    const d = israelDay(r.created_at as string);
    if (inMonth(d, m, days)) cur.push(r);
    else if (inMonth(d, prev, prevDays)) before.push(r);
  }
  const net = (gross: number) => incomeTotals([gross], i.status, i.vatRate).net;
  const sum = (rs: ReportReceipt[]) => rs.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const income = compareMonths(Math.round(net(sum(cur))), Math.round(net(sum(before))));

  // Visits from the diary (a visit without a payment recorded is still a visit). Up to today only.
  const apptDay = (a: FullAppt) => israelDay(`${String(a.date || '').slice(0, 10)}T12:00:00Z`);
  let visits = 0, prevVisits = 0, noShows = 0;
  const visitedThisMonth = new Set<string>();
  const firstVisit = new Map<string, number>();
  const lastVisit = new Map<string, string>();
  const bookedAhead = new Set<string>();
  for (const a of i.appointments || []) {
    const d = apptDay(a);
    if (!d || a.kind === 'personal') continue;
    const cid = a.client_id == null || a.client_id === '' ? '' : String(a.client_id);
    if (d.n > today.n) { if (cid && a.confirmation_status !== 'cancelled') bookedAhead.add(cid); continue; }
    if (inMonth(d, m, days)) {
      if (a.confirmation_status === 'no_show') noShows++;
      else if (isVisit(a)) { visits++; if (cid) visitedThisMonth.add(cid); }
    } else if (inMonth(d, prev, prevDays) && isVisit(a)) prevVisits++;
    if (cid && isVisit(a)) {
      if (!firstVisit.has(cid) || d.n < (firstVisit.get(cid) as number)) firstVisit.set(cid, d.n);
      const k = String(a.date).slice(0, 10);
      if (!lastVisit.has(cid) || k > (lastVisit.get(cid) as string)) lastVisit.set(cid, k);
    }
  }
  const monthStartN = dayN(monthBounds(m).from);
  let newClients = 0, returningClients = 0;
  for (const cid of visitedThisMonth) {
    if ((firstVisit.get(cid) ?? -Infinity) >= monthStartN) newClients++;
    else returningClients++;
  }

  // Treatments: the top three by what they brought in (net, like the total above).
  const by = new Map<string, number>();
  for (const r of cur) if (!isVoucherSaleReceipt(r)) for (const t of treatmentShares(r)) by.set(t.name, (by.get(t.name) || 0) + t.income);
  const top = [...by.entries()].filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'he')).slice(0, 3)
    .map(([name, v]) => ({ name, income: Math.round(net(v)) }));

  // Average per visit: what a paid treatment brought in, on average (voucher and products-only sales are not visits).
  const visitReceipts = cur.filter((r) => !notAVisit(r) && (Number(r.amount) || 0) > 0);
  const avgPerVisit = visitReceipts.length ? Math.round(net(sum(visitReceipts)) / visitReceipts.length) : null;

  // Clients who have not come back, as of today: the win-back list is one tap away on the page.
  const nameOf = new Map<string, FullClient>();
  for (const c of i.clients || []) if (c && c.id != null) nameOf.set(String(c.id), c);
  const lapsedMin = Number.isFinite(i.lapsedMinDays) && Number(i.lapsedMinDays) > 0 ? Number(i.lapsedMinDays) : LAPSED_MIN_DAYS;
  const lapsedAll: { id: string; name: string; phone: string; lastVisit: string; days: number }[] = [];
  for (const [cid, last] of lastVisit) {
    const c = nameOf.get(cid);
    if (!c || c.status === 'archived' || bookedAhead.has(cid)) continue;
    const ago = today.n - dayN(last);
    // More than her win-back period, the same rule as the win-back list (isColdClient: days > period).
    if (ago > lapsedMin && ago <= LAPSED_MAX_DAYS) lapsedAll.push({ id: cid, name: String(c.name || '').trim() || 'לקוחה', phone: String(c.phone || ''), lastVisit: last, days: ago });
  }
  lapsedAll.sort((a, b) => a.days - b.days || a.name.localeCompare(b.name, 'he'));

  let products: MonthFull['products'] = null;
  if (i.showProducts) {
    let g = 0, u = 0;
    for (const r of cur) { const s = productShares(r); g += s.income; u += s.units; }
    products = { income: Math.round(net(g)), units: u };
  }
  let vouchers: MonthFull['vouchers'] = null;
  if (i.showVouchers) {
    const sold = cur.filter((r) => isVoucherSaleReceipt(r));
    let redeemedCount: number | null = null, redeemedAmount: number | null = null;
    if (Array.isArray(i.voucherLedger)) {
      redeemedCount = 0; redeemedAmount = 0;
      for (const l of i.voucherLedger) {
        if (!inMonth(israelDay(l.created_at as string), m, days)) continue;
        const amt = Math.abs(Number(l.amount) || 0);
        if (l.kind === 'redeem') { redeemedCount++; redeemedAmount += amt; }
        else if (l.kind === 'reverse') { redeemedCount--; redeemedAmount -= amt; }
      }
      redeemedCount = Math.max(0, redeemedCount); redeemedAmount = Math.max(0, Math.round(redeemedAmount));
    }
    // Money taken for vouchers is what she was paid, as it is (a voucher is money in advance; its VAT is a question for her accountant).
    vouchers = { soldCount: sold.length, soldAmount: Math.round(sum(sold)), redeemedCount, redeemedAmount };
  }

  const monthName = MONTHS_HE[m.month];
  const prevName = MONTHS_HE[prev.month];
  const netOfVat = i.status !== 'exempt';
  const hasData = income.cur > 0 || visits > 0;
  const where = isCurrent ? `מתחילת ${monthName}` : `ב${monthName}`;
  const vatNote = netOfVat ? ' (לפני מע"מ)' : '';
  let headline: string;
  if (!hasData) headline = isCurrent ? `עוד לא נרשמו ביקורים או תשלומים ב${monthName}.` : `ב${monthName} לא נרשמו ביקורים או תשלומים.`;
  else if (income.pct === null) headline = `${where} הכנסת ${nis(income.cur)}${vatNote}.`;
  else if (income.dir === 'same') headline = `${where} הכנסת ${nis(income.cur)}${vatNote}, בערך כמו ${isCurrent ? `באותם ימים ב${prevName}` : `ב${prevName}`}.`;
  else headline = `${where} הכנסת ${nis(income.cur)}${vatNote}, ${income.pct}% ${income.dir === 'up' ? 'יותר' : 'פחות'} ${isCurrent ? `מאותם ימים ב${prevName}` : `מ${prevName}`}.`;

  return {
    key: monthKey(m), monthName, year: m.year, label: monthLabel(m), isCurrent, days,
    prevLabel: isCurrent ? `${days === 1 ? 'היום הראשון' : `${days} הימים הראשונים`} של ${prevName}` : prevName,
    prevName, inPrev: isCurrent ? `באותם ימים ב${prevName}` : `ב${prevName}`,
    prevIsPartial: isCurrent, netOfVat, hasData, income,
    visits: compareMonths(visits, prevVisits), newClients, returningClients, noShows, avgPerVisit, top,
    lapsed: { count: lapsedAll.length, minDays: lapsedMin, clients: lapsedAll.slice(0, LAPSED_SHOWN) },
    products, vouchers, headline,
  };
}

/** The note on the 1st: one paragraph, only for a month with something in it. */
export function monthlyNotice(r: MonthFull): { title: string; body: string } | null {
  if (!r.hasData) return null;
  const parts = [`ב${r.monthName} הכנסת ${nis(r.income.cur)}${r.netOfVat ? ' (לפני מע"מ)' : ''}, ${r.visits.cur === 1 ? 'ביקור אחד' : `${r.visits.cur} ביקורים`}.`];
  if (r.top[0]) parts.push(`הטיפול שהכניס הכי הרבה: ${r.top[0].name}.`);
  if (r.lapsed.count > 0) parts.push(r.lapsed.count === 1 ? `לקוחה אחת לא חזרה כבר יותר מ-${r.lapsed.minDays} ימים.` : `${r.lapsed.count} לקוחות לא חזרו כבר יותר מ-${r.lapsed.minDays} ימים.`);
  parts.push('הדוח המלא מחכה לך 🌸');
  return { title: `הדוח החודשי שלך: ${r.monthName}`, body: parts.join(' ') };
}

type FlagSettings = { automations?: unknown; feature_flags?: unknown } | null | undefined;

/** The page itself (and its links): ON unless the platform flag is an explicit false (lib/featureFlags.ts tenantFlags). */
export function monthlyPageOn(settings: FlagSettings): boolean {
  return tenantFlags(settings)[MONTHLY_FLAG] !== false;
}

/** The note on the 1st: the page on, her own switch (automations.monthly_report) not false, automations not paused. */
export function monthlyNoticeOn(settings: FlagSettings): boolean {
  const a = settings?.automations && typeof settings.automations === 'object' ? (settings.automations as Record<string, unknown>) : {};
  return monthlyPageOn(settings) && a.monthly_report !== false && a.paused !== true;
}

/**
 * When the cron may send: the 1st to the 3rd of the month in Israel, never on Shabbat or yom tov (the same rest-day rule as
 * every other note, so a 1st that falls on Shabbat moves to Sunday). The route skips a business that already got this month's note.
 */
export function monthlyCronDue(now: Date, isYomTov: (day: string) => boolean = () => false): { run: boolean; reason: 'ok' | 'not-start-of-month' | 'rest-day' } {
  const d = israelDay(now)!;
  if (d.day > 3) return { run: false, reason: 'not-start-of-month' };
  if (d.dow === 6 || isYomTov(d.key)) return { run: false, reason: 'rest-day' };
  return { run: true, reason: 'ok' };
}
