// lib/monthlyReport.ts
//
// The simple monthly report on the home screen: three or four plain Hebrew sentences, no tables.
//   1. what she took this month so far, against the SAME elapsed days of last month (fair mid-month)
//   2. how many treatments
//   3. which treatment earned the most
//   4. one honest observation from data that already exists (clients who have not come back, or the quietest weekday)
//
// ONE WAY TO COUNT REVENUE. Receipts, with voided ones left out (lib/till liveReceipts), summed through incomeTotals
// (lib/incomePeriod) exactly like the income screen: an exempt dealer's takings are her turnover, a dealer who charges
// VAT is shown without it (net). Tips are not part of amount, so they are not part of this either. No second formula.
//
// ISRAEL TIME. A month starts and ends where she lives, not where the phone happens to be: every day boundary below is
// Asia/Jerusalem. (The income screen cuts months in the device's own zone; for a phone in Israel the two are identical.)
//
// An empty month says so. Zeros are never dressed as results.

import { liveReceipts } from './till.ts';
import { incomeTotals } from './incomePeriod.js';
import { parseDb } from './dbTime.js';

const TZ = 'Asia/Jerusalem';
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

export type IsraelDay = { year: number; month: number; day: number; dow: number; key: string; n: number };

/** The calendar day of a moment in Israel: month is 0-based, dow 0 = Sunday, n = a day number that sorts and subtracts. */
export function israelDay(when: Date | string | number | null | undefined): IsraelDay | null {
  const d = when instanceof Date ? when : typeof when === 'string' ? parseDb(when) : new Date(when as number);
  if (!d || isNaN(d.getTime())) return null;
  const [y, m, dd] = dayFmt.format(d).split('-').map(Number);
  const n = Math.floor(Date.UTC(y, m - 1, dd) / 86400000);
  return { year: y, month: m - 1, day: dd, dow: new Date(Date.UTC(y, m - 1, dd)).getUTCDay(), key: `${y}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`, n };
}

export const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/** The month before (year, month), month 0-based. */
export function previousMonth(year: number, month: number) {
  return month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 };
}

export type ReportReceipt = { id?: unknown; created_at?: unknown; amount?: unknown; service?: unknown; items?: unknown };
export type ReportAppt = { client_id?: unknown; date?: unknown; confirmation_status?: unknown; kind?: unknown };
export type ReportVoid = { receipt_id?: unknown; credit_status?: unknown };

export type Treatment = { name: string; income: number };

/**
 * What each treatment on a receipt earned. The receipt's items (name, price, qty) say how the amount splits; the split is
 * scaled to the receipt's amount so a discount comes off every item and the parts always add up to what she took. A receipt
 * without readable items counts its service text (comma separated names share it equally).
 */
export function treatmentShares(r: ReportReceipt): Treatment[] {
  const amount = Number(r.amount) || 0;
  if (amount <= 0) return [];
  let names: { name: string; weight: number }[] = [];
  try {
    const raw = typeof r.items === 'string' ? JSON.parse(r.items) : r.items;
    if (Array.isArray(raw)) {
      names = raw
        .map((i) => ({ name: String(i?.name ?? '').trim(), weight: Math.max(0, (Number(i?.price) || 0) * (Number(i?.qty) || 1)) }))
        .filter((i) => i.name);
    }
  } catch { /* fall back to the service text */ }
  if (names.length === 0) {
    names = String(r.service ?? '').split(',').map((s) => ({ name: s.trim(), weight: 1 })).filter((i) => i.name);
  }
  if (names.length === 0) return [];
  let total = names.reduce((s, i) => s + i.weight, 0);
  if (total <= 0) { names = names.map((i) => ({ ...i, weight: 1 })); total = names.length; }
  return names.map((i) => ({ name: i.name, income: (amount * i.weight) / total }));
}

export function topTreatment(receipts: ReportReceipt[]): Treatment | null {
  const by = new Map<string, number>();
  for (const r of receipts) for (const t of treatmentShares(r)) by.set(t.name, (by.get(t.name) || 0) + t.income);
  let best: Treatment | null = null;
  for (const [name, income] of by) {
    if (income <= 0) continue;
    if (!best || income > best.income + 1e-9 || (Math.abs(income - best.income) <= 1e-9 && name.localeCompare(best.name, 'he') < 0)) best = { name, income };
  }
  return best ? { name: best.name, income: Math.round(best.income) } : null;
}

/** Clients whose last real visit was 8 to 52 weeks ago and who have nothing booked ahead. Cancelled and personal entries are not visits. */
export const LAPSED_FROM_DAYS = 56;
export const LAPSED_UNTIL_DAYS = 364;
export function lapsedClientCount(appointments: ReportAppt[], today: IsraelDay): number {
  const last = new Map<string, number>();
  for (const a of appointments) {
    if (!a || a.client_id == null || a.client_id === '' || !a.date) continue;
    if (a.confirmation_status === 'cancelled' || a.kind === 'personal') continue;
    const d = israelDay(`${String(a.date).slice(0, 10)}T12:00:00Z`);
    if (!d) continue;
    const k = String(a.client_id);
    if (!last.has(k) || d.n > (last.get(k) as number)) last.set(k, d.n);
  }
  let count = 0;
  for (const n of last.values()) {
    const ago = today.n - n;
    if (ago >= LAPSED_FROM_DAYS && ago <= LAPSED_UNTIL_DAYS) count++;
  }
  return count;
}

export const WEEKDAY_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
export const QUIET_WINDOW_DAYS = 56;

/**
 * The quietest weekday over the last 8 weeks, among the days she actually works (a day with no treatment at all is a
 * day off, not a quiet day). Needs real volume or it says nothing. Quiet means clearly below the others, not just the minimum.
 */
export function quietestWeekday(receipts: ReportReceipt[], today: IsraelDay): { dow: number; count: number; total: number } | null {
  const byDow = [0, 0, 0, 0, 0, 0, 0];
  let total = 0;
  for (const r of receipts) {
    const d = israelDay(r.created_at as string);
    if (!d) continue;
    const ago = today.n - d.n;
    if (ago < 0 || ago >= QUIET_WINDOW_DAYS) continue;
    byDow[d.dow]++; total++;
  }
  const worked = byDow.map((c, dow) => ({ dow, count: c })).filter((x) => x.count > 0);
  if (total < 12 || worked.length < 3) return null;
  worked.sort((a, b) => a.count - b.count || a.dow - b.dow);
  const [quiet, ...rest] = worked;
  const avgRest = rest.reduce((s, x) => s + x.count, 0) / rest.length;
  if (quiet.count > avgRest * 0.6) return null;
  return { dow: quiet.dow, count: quiet.count, total };
}

export type Observation =
  | { kind: 'lapsed'; count: number }
  | { kind: 'quiet'; dow: number; count: number; total: number };

export type MonthlyReport = {
  hasData: boolean;
  monthName: string;       // "אוקטובר"
  elapsedDays: number;
  income: number;          // this month so far, rounded shekels
  prevIncome: number;      // last month over the same elapsed days
  count: number;           // receipts this month so far
  top: Treatment | null;
  observation: Observation | null;
  netOfVat: boolean;       // the figure is shown without VAT (a dealer who charges it)
  sentences: string[];
};

const MONTHS_HE = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const nis = (x: number) => `₪${Math.round(x).toLocaleString('he-IL')}`;

export function monthlyReport(input: {
  receipts: ReportReceipt[];
  voids?: ReportVoid[] | null;
  appointments?: ReportAppt[];
  status: string;
  vatRate: number;
  now?: Date;
}): MonthlyReport {
  const now = input.now || new Date();
  const today = israelDay(now) as IsraelDay;
  const prev = previousMonth(today.year, today.month);
  const prevDays = daysInMonth(prev.year, prev.month);
  const live = liveReceipts(input.receipts as never[], (input.voids || []) as never[]) as ReportReceipt[];

  const thisMonth: ReportReceipt[] = [];
  const lastMonthSameDays: ReportReceipt[] = [];
  for (const r of live) {
    const d = israelDay(r.created_at as string);
    if (!d) continue;
    if (d.year === today.year && d.month === today.month && d.day <= today.day) thisMonth.push(r);
    else if (d.year === prev.year && d.month === prev.month && d.day <= Math.min(today.day, prevDays)) lastMonthSameDays.push(r);
  }
  const money = (rs: ReportReceipt[]) => incomeTotals(rs.map((r) => r.amount as number), input.status, input.vatRate).net;
  const income = money(thisMonth);
  const prevIncome = money(lastMonthSameDays);
  const netOfVat = input.status !== 'exempt';
  const monthName = MONTHS_HE[today.month];
  const base = { monthName, elapsedDays: today.day, netOfVat };

  // Nothing real to say: a month with no payment yet (or only payments that add up to nothing).
  if (thisMonth.length === 0 || income <= 0) {
    return { ...base, hasData: false, income: 0, prevIncome: Math.round(prevIncome), count: 0, top: null, observation: null, sentences: [] };
  }

  const top = topTreatment(thisMonth);
  const lapsed = lapsedClientCount(input.appointments || [], today);
  const quiet = quietestWeekday(live, today);
  let observation: Observation | null = null;
  if (lapsed >= 3) observation = { kind: 'lapsed', count: lapsed };
  else if (quiet) observation = { kind: 'quiet', dow: quiet.dow, count: quiet.count, total: quiet.total };
  else if (lapsed >= 1) observation = { kind: 'lapsed', count: lapsed };

  const sentences: string[] = [];
  const vatNote = netOfVat ? ' (לפני מע"מ)' : '';
  const sofar = today.day >= daysInMonth(today.year, today.month) ? `ב${monthName}` : `מתחילת ${monthName}`;
  const inc = Math.round(income), pinc = Math.round(prevIncome);
  if (pinc > 0) {
    const diff = inc - pinc;
    const pct = Math.round((Math.abs(diff) / pinc) * 100);
    const same = today.day === 1 ? 'ביום הראשון של החודש שעבר' : `באותם ${today.day} ימים בחודש שעבר`;
    const from = today.day === 1 ? 'מהיום הראשון של החודש שעבר' : `מאותם ${today.day} ימים בחודש שעבר`;
    if (diff === 0) sentences.push(`${sofar} הכנסת ${nis(inc)}${vatNote}, בדיוק כמו ${same}.`);
    else if (pct === 0) sentences.push(`${sofar} הכנסת ${nis(inc)}${vatNote}, כמעט בדיוק כמו ${same}.`);
    else sentences.push(`${sofar} הכנסת ${nis(inc)}${vatNote}, ${pct}% ${diff > 0 ? 'יותר' : 'פחות'} ${from} (${nis(pinc)}).`);
  } else {
    sentences.push(`${sofar} הכנסת ${nis(inc)}${vatNote}. בחודש שעבר באותם ימים לא נרשמו תשלומים, אז אין עם מה להשוות עדיין.`);
  }
  const n = thisMonth.length;
  sentences.push(n === 1 ? 'עד עכשיו עשית טיפול אחד.' : `עד עכשיו עשית ${n} טיפולים.`);
  if (top) sentences.push(`הטיפול שהכניס לך הכי הרבה הוא ${top.name}, ${nis(top.income)}.`);
  if (observation?.kind === 'lapsed') {
    sentences.push(observation.count === 1
      ? 'לקוחה אחת לא חזרה כבר 8 שבועות או יותר, אולי הזמן לשלוח לה הודעה חמה.'
      : `${observation.count} לקוחות לא חזרו כבר 8 שבועות או יותר, אולי הזמן לשלוח להן הודעה חמה.`);
  } else if (observation?.kind === 'quiet') {
    sentences.push(`יום ${WEEKDAY_HE[observation.dow]} הוא היום הכי שקט שלך: ${observation.count === 1 ? 'טיפול אחד' : `${observation.count} טיפולים`} מתוך ${observation.total} ב-8 השבועות האחרונות.`);
  }
  return { ...base, hasData: true, income: inc, prevIncome: pinc, count: n, top, observation, sentences };
}
