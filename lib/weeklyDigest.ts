// lib/weeklyDigest.ts
//
// "הסיכום השבועי שלך": the Sunday note to HER (the business owner, not Maayan's platform digest in app/api/owner-digest).
// It replaces the plain weekly report (lib/weeklyReport.ts, still there behind WEEKLY_DIGEST_OFF=1) with three parts:
//   1. last week's numbers next to the week before: revenue, visits, new clients, no-shows;
//   2. up to three "מה כדאי לעשות השבוע" actions, each with a one-tap link into the app (/dashboard?go=...);
//   3. one gentle positive line (her best day, or the treatment that earned most).
//
// Pure: no database, no clock of its own. The cron (app/api/send-weekly-report) and the screen (/dashboard/digest, through
// /api/weekly-digest) both read the rows with lib/weeklyDigestLoad.ts and hand them here, so the notification and the screen
// can never disagree. No AI call: every sentence is built from the numbers.
//
// Weeks are Israeli calendar weeks, Sunday to Saturday, by the Israeli day of each row. "Last week" is the most recent week
// that is fully over, so a Sunday evening send never counts a half day, and every day lands in exactly one report.
//
// Copy rules: feminine second person, Hebrew first on every line, and no dash of any kind (a test checks every string).

import { topTreatment, WEEKDAY_HE, type ReportReceipt } from './monthlyReport.ts';
import { isColdClient, winbackDaysOf } from './clientActivity.ts';
import { dayHoursFrom } from './businessHours.ts';
import { startMinute, endMinute } from './apptTime.ts';
import { resolveLunch } from './lunchBreak.js';
import { parseDb } from './dbTime.js';
import { israelClock, israelDayKey, EVE_LATEST_HOUR, SATURDAY_NIGHT_HOUR } from './shabbat.js';

// ── Israeli days ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** 'YYYY-MM-DD' n days after a day key. Noon UTC, so no zone or DST edge can move it. */
export function addDays(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday. */
export const weekdayOfKey = (key: string) => new Date(`${key}T12:00:00Z`).getUTCDay();

/** The Israeli day a timestamp falls on, or '' when it is unreadable. */
export function israelDayOf(ts: unknown): string {
  const d = parseDb(ts);
  if (!Number.isFinite(d.getTime())) return '';
  return israelDayKey(d);
}

export type DayRange = { from: string; to: string };
export type DigestWeeks = { today: string; last: DayRange; prev: DayRange; coming: DayRange };

/**
 * The weeks a digest written at `now` talks about, in Israeli days:
 *   last    the most recent Sunday to Saturday that is fully over
 *   prev    the week before it
 *   coming  tomorrow and the six days after it (where the empty hours and the birthdays are looked for)
 */
export function digestWeeks(now: Date): DigestWeeks {
  const today = israelDayKey(now);
  const sunday = addDays(today, -weekdayOfKey(today));
  return {
    today,
    last: { from: addDays(sunday, -7), to: addDays(sunday, -1) },
    prev: { from: addDays(sunday, -14), to: addDays(sunday, -8) },
    coming: { from: addDays(today, 1), to: addDays(today, 7) },
  };
}

const inRange = (day: string, r: DayRange) => !!day && day >= r.from && day <= r.to;

/** '26.10' style, for the screen's heading. */
export const shortDay = (key: string) => `${Number(key.slice(8, 10))}.${Number(key.slice(5, 7))}`;

// ── the numbers ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export type DigestAppt = {
  id?: unknown; client_id?: unknown; date?: unknown; confirmation_status?: unknown; kind?: unknown;
  start_minute?: number | null; hour?: number | null; duration?: number | string | null; service?: unknown;
};
export type DigestClient = { id?: unknown; name?: unknown; created_at?: unknown; birthday?: unknown };
export type WeekNumbers = { revenue: number; visits: number; newClients: number; noShows: number };

const isVisit = (a: DigestAppt) =>
  a.kind !== 'personal' && a.confirmation_status !== 'cancelled' && a.confirmation_status !== 'no_show';

/** One week's four numbers. Receipts must already be the live ones (voided removed, lib/till liveReceipts). */
export function weekNumbers(
  r: DayRange,
  rows: { receipts: ReportReceipt[]; appointments: DigestAppt[]; clients: DigestClient[] },
): WeekNumbers {
  let revenue = 0;
  for (const rc of rows.receipts || []) if (inRange(israelDayOf(rc.created_at), r)) revenue += Number(rc.amount) || 0;
  let visits = 0, noShows = 0;
  for (const a of rows.appointments || []) {
    const d = String(a.date || '').slice(0, 10);
    if (!inRange(d, r) || a.kind === 'personal') continue;
    if (a.confirmation_status === 'no_show') noShows++;
    else if (isVisit(a)) visits++;
  }
  let newClients = 0;
  for (const c of rows.clients || []) if (inRange(israelDayOf(c.created_at), r)) newClients++;
  return { revenue: Math.round(revenue), visits, newClients, noShows };
}

export type Change = { cur: number; prev: number; dir: 'up' | 'down' | 'same'; pct: number | null };

/** cur against prev. pct only when there is a week before to compare with; under 5% either way reads as "the same". */
export function compare(cur: number, prev: number): Change {
  if (prev > 0) {
    const pct = Math.round(((cur - prev) / prev) * 100);
    return { cur, prev, pct: Math.abs(pct), dir: pct >= 5 ? 'up' : pct <= -5 ? 'down' : 'same' };
  }
  return { cur, prev, pct: null, dir: cur > 0 ? 'up' : 'same' };
}

// ── what is waiting for her this week ────────────────────────────────────────────────────────────────────────────────────

export type HoursSettings = Parameters<typeof dayHoursFrom>[0] & { branding?: unknown; automations?: unknown };

/** Free bookable minutes per day in the coming week: open hours, less her lunch break and anything already in the diary. */
export function freeMinutesByDay(
  coming: DayRange,
  settings: HoursSettings | null | undefined,
  appointments: DigestAppt[],
  isYomTov: (day: string) => boolean = () => false,
): { day: string; minutes: number }[] {
  const lunch = resolveLunch((settings as { branding?: unknown } | null)?.branding) as { startMinute: number; minutes: number } | null;
  const out: { day: string; minutes: number }[] = [];
  for (let day = coming.from; day <= coming.to; day = addDays(day, 1)) {
    const wd = weekdayOfKey(day);
    if (wd === 6 || isYomTov(day)) continue;
    const h = dayHoursFrom(settings, wd);
    if (!h || !(h.close > h.open)) continue;
    const open = h.open * 60, close = h.close * 60;
    const busy: [number, number][] = [];
    if (lunch) busy.push([lunch.startMinute, lunch.startMinute + lunch.minutes]);
    for (const a of appointments || []) {
      if (String(a.date || '').slice(0, 10) !== day || a.confirmation_status === 'cancelled') continue;
      const s = startMinute(a), e = endMinute(a);
      if (s === null || e === null || e <= s) continue;
      busy.push([s, e]);
    }
    // Union of the busy intervals, clipped to the open hours.
    busy.sort((x, y) => x[0] - y[0]);
    let taken = 0, curS = -1, curE = -1;
    for (const [s0, e0] of busy) {
      const s = Math.max(s0, open), e = Math.min(e0, close);
      if (e <= s) continue;
      if (s > curE) { if (curE > curS) taken += curE - curS; curS = s; curE = e; }
      else curE = Math.max(curE, e);
    }
    if (curE > curS) taken += curE - curS;
    out.push({ day, minutes: Math.max(0, close - open - taken) });
  }
  return out;
}

/** Clients who are overdue to come back: the same rule as the home card's "להתחדשות" and the win-back list. */
export function overdueClientCount(clients: DigestClient[], appointments: DigestAppt[], now: Date, automations: unknown): number {
  const last = new Map<string, string>();
  for (const a of appointments || []) {
    if (a.client_id == null || a.client_id === '' || !a.date) continue;
    const k = String(a.client_id), d = String(a.date).slice(0, 10);
    const p = last.get(k);
    if (!p || d > p) last.set(k, d);
  }
  const days = winbackDaysOf(automations);
  let n = 0;
  for (const c of clients || []) if (isColdClient(last.get(String(c.id)) || null, now, days)) n++;
  return n;
}

/** Clients whose birthday falls in the coming week (month and day; a 29 February birthday counts on 28 February in other years). */
export function birthdaysIn(coming: DayRange, clients: DigestClient[]): DigestClient[] {
  const md = new Set<string>();
  for (let day = coming.from; day <= coming.to; day = addDays(day, 1)) md.add(day.slice(5));
  const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const hasFeb29 = [coming.from, coming.to].some((d) => leap(Number(d.slice(0, 4))));
  return (clients || []).filter((c) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(c.birthday || ''));
    if (!m) return false;
    let key = `${m[2]}-${m[3]}`;
    if (key === '02-29' && !hasFeb29) key = '02-28';
    return md.has(key);
  });
}

// ── actions ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

export const DIGEST_GO = ['queue', 'leads', 'winback', 'week', 'birthdays'] as const;
export type DigestGo = (typeof DIGEST_GO)[number];
export const digestHref = (go: DigestGo) => `/dashboard?go=${go}`;

export type DigestAction = { key: DigestGo; title: string; detail: string; cta: string; href: string };

export type ActionSignals = {
  pendingMessages: number | null;
  newLeads: number | null;
  overdueClients: number;
  freeMinutes: { day: string; minutes: number }[];
  birthdays: DigestClient[];
};

/** At least this many free hours in the coming week before "empty hours" is worth a line. */
export const MIN_FREE_HOURS = 2;
export const MAX_ACTIONS = 3;

const firstName = (n: unknown) => String(n || '').trim().split(/\s+/)[0] || '';
const joinHe = (names: string[]) => (names.length <= 1 ? names[0] || '' : `${names.slice(0, -1).join(', ')} ו${names[names.length - 1]}`);

/**
 * Up to three actions, most time sensitive first: messages already prepared and waiting, people who asked and got no answer,
 * clients overdue to return, empty hours, birthdays. A signal that is zero, unknown (null) or below its threshold is skipped.
 */
export function pickActions(s: ActionSignals): DigestAction[] {
  const out: DigestAction[] = [];
  const totalFree = (s.freeMinutes || []).reduce((t, d) => t + d.minutes, 0);
  const freeHours = Math.floor(totalFree / 60);
  const emptiest = [...(s.freeMinutes || [])].sort((a, b) => b.minutes - a.minutes || (a.day < b.day ? -1 : 1))[0];

  if ((s.pendingMessages || 0) > 0) {
    const n = s.pendingMessages as number;
    out.push({ key: 'queue', title: n === 1 ? 'הודעה אחת מוכנה ומחכה לשליחה' : `הודעות שמוכנות ומחכות לשליחה: ${n}`, detail: 'כל אחת נשלחת בלחיצה מהוואטסאפ שלך', cta: 'לרשימת ההודעות', href: digestHref('queue') });
  }
  if ((s.newLeads || 0) > 0) {
    const n = s.newLeads as number;
    out.push({ key: 'leads', title: n === 1 ? 'פנייה אחת עוד מחכה לתשובה' : `פניות שעוד מחכות לתשובה: ${n}`, detail: 'מי שמקבלת תשובה מהר קובעת יותר', cta: 'לפניות החדשות', href: digestHref('leads') });
  }
  if (s.overdueClients > 0) {
    const n = s.overdueClients;
    out.push({
      key: 'winback',
      title: n === 1 ? 'לקוחה אחת מזמן לא הגיעה' : `לקוחות שמזמן לא הגיעו: ${n}`,
      detail: freeHours >= MIN_FREE_HOURS ? 'אפשר להציע להן את השעות הפנויות של השבוע' : 'הודעה קצרה ממך מחזירה הרבה מהן',
      cta: 'לרשימה', href: digestHref('winback'),
    });
  }
  if (freeHours >= MIN_FREE_HOURS && emptiest) {
    out.push({
      key: 'week',
      title: `שעות פנויות ביומן השבוע: ${freeHours}`,
      detail: `הכי פנוי ביום ${WEEKDAY_HE[weekdayOfKey(emptiest.day)]}`,
      cta: 'ליומן השבועי', href: digestHref('week'),
    });
  }
  if ((s.birthdays || []).length > 0) {
    const names = s.birthdays.map((c) => firstName(c.name)).filter(Boolean);
    const shown = names.slice(0, 3);
    const more = names.length - shown.length;
    out.push({
      key: 'birthdays',
      title: s.birthdays.length === 1 ? 'יום הולדת אחד השבוע' : `ימי הולדת השבוע: ${s.birthdays.length}`,
      detail: shown.length ? `${joinHe(shown)}${more > 0 ? ` ועוד ${more}` : ''}. ברכה קטנה עושה הרבה` : 'ברכה קטנה עושה הרבה',
      cta: 'לימי ההולדת', href: digestHref('birthdays'),
    });
  }
  return out.slice(0, MAX_ACTIONS);
}

// ── the positive line ────────────────────────────────────────────────────────────────────────────────────────────────────

const money = (n: number) => `₪${Math.round(n).toLocaleString('he-IL')}`;

/** Her best day of the week (by money, then by visits), else the treatment that earned most, else how many she saw. */
export function positiveLine(r: DayRange, receipts: ReportReceipt[], appointments: DigestAppt[], visits: number): string | null {
  const byDay = new Map<string, number>();
  const weekReceipts = (receipts || []).filter((rc) => inRange(israelDayOf(rc.created_at), r));
  for (const rc of weekReceipts) {
    const d = israelDayOf(rc.created_at);
    byDay.set(d, (byDay.get(d) || 0) + (Number(rc.amount) || 0));
  }
  const days = [...byDay.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  if (days.length >= 2) return `היום החזק שלך היה יום ${WEEKDAY_HE[weekdayOfKey(days[0][0])]}, עם ${money(days[0][1])} 🌸`;
  const top = topTreatment(weekReceipts);
  if (top) return `הטיפול שהכניס הכי הרבה השבוע: ${top.name} 🌸`;
  const visitsByDay = new Map<string, number>();
  for (const a of appointments || []) {
    const d = String(a.date || '').slice(0, 10);
    if (inRange(d, r) && isVisit(a)) visitsByDay.set(d, (visitsByDay.get(d) || 0) + 1);
  }
  const vd = [...visitsByDay.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  if (vd.length >= 2 && vd[0][1] > vd[1][1]) return `היום הכי מלא שלך היה יום ${WEEKDAY_HE[weekdayOfKey(vd[0][0])]} 🌸`;
  if (visits > 0) return visits === 1 ? 'פגשת השבוע לקוחה אחת. כל ביקור נחשב 🌸' : `פגשת השבוע ${visits} לקוחות. כל הכבוד 🌸`;
  return null;
}

// ── the digest ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export type DigestInput = {
  now: Date;
  receipts: ReportReceipt[];          // live receipts from at least prev.from
  appointments: DigestAppt[];         // her appointment history, plus the coming week
  clients: DigestClient[];
  pendingMessages: number | null;     // null = could not be read: the action is left out, never shown as 0
  newLeads: number | null;            // null = could not be read, or her leads screen is switched off
  settings: HoursSettings | null;
  isYomTov?: (day: string) => boolean;
};

export type Digest = {
  title: string;
  weeks: DigestWeeks;
  numbers: { revenue: Change; visits: Change; newClients: Change; noShows: Change };
  actions: DigestAction[];
  positive: string | null;
  lines: string[];                    // the numbers as sentences, for the notification and the screen
  body: string;                       // the notification body
};

export const DIGEST_TITLE = 'הסיכום השבועי שלך';

const countLine = (label: string, c: Change) => `${label}: ${c.cur} (בשבוע שלפניו ${c.prev})`;

export function revenueLine(c: Change): string {
  if (c.prev <= 0) return c.cur > 0 ? `הכנסות: ${money(c.cur)}` : 'הכנסות: עוד לא נרשמו תשלומים';
  if (c.dir === 'up') return `הכנסות: ${money(c.cur)}, עלייה של ${c.pct}% לעומת השבוע שלפניו`;
  if (c.dir === 'down') return `הכנסות: ${money(c.cur)}, ירידה של ${c.pct}% לעומת השבוע שלפניו`;
  return `הכנסות: ${money(c.cur)}, כמו בשבוע שלפניו`;
}

/** The digest, or null when there is nothing to say: both weeks empty and nothing waiting. */
export function buildDigest(i: DigestInput): Digest | null {
  const weeks = digestWeeks(i.now);
  const rows = { receipts: i.receipts || [], appointments: i.appointments || [], clients: i.clients || [] };
  const cur = weekNumbers(weeks.last, rows);
  const prev = weekNumbers(weeks.prev, rows);
  const numbers = {
    revenue: compare(cur.revenue, prev.revenue),
    visits: compare(cur.visits, prev.visits),
    newClients: compare(cur.newClients, prev.newClients),
    noShows: compare(cur.noShows, prev.noShows),
  };
  const actions = pickActions({
    pendingMessages: i.pendingMessages,
    newLeads: i.newLeads,
    overdueClients: overdueClientCount(rows.clients, rows.appointments, i.now, i.settings?.automations),
    freeMinutes: freeMinutesByDay(weeks.coming, i.settings, rows.appointments, i.isYomTov),
    birthdays: birthdaysIn(weeks.coming, rows.clients),
  });
  const anyNumbers = [cur, prev].some((w) => w.revenue > 0 || w.visits > 0 || w.newClients > 0 || w.noShows > 0);
  if (!anyNumbers && actions.length === 0) return null;

  const positive = positiveLine(weeks.last, rows.receipts, rows.appointments, cur.visits);
  const lines = [
    revenueLine(numbers.revenue),
    countLine('ביקורים', numbers.visits),
    countLine('לקוחות חדשות', numbers.newClients),
    ...(cur.noShows > 0 || prev.noShows > 0 ? [countLine('לא הגיעו לתור', numbers.noShows)] : []),
  ];
  const body = [
    ...lines,
    ...(actions.length ? ['', 'מה כדאי לעשות השבוע:', ...actions.map((a) => `• ${a.title}`)] : []),
    ...(positive ? ['', positive] : []),
  ].join('\n');
  return { title: DIGEST_TITLE, weeks, numbers, actions, positive, lines, body };
}

// ── when it goes out ─────────────────────────────────────────────────────────────────────────────────────────────────────
//
// Sunday afternoon, like the weekly report always did, and never on Shabbat or yom tov (the same rule the client crons keep,
// lib/shabbat.js). vercel.json has three entries for /api/send-weekly-report and this picks the one that runs:
//   early    10:00 UTC Sunday (12:00/13:00 Israel)       when Sunday is an EVE (yom tov starts that evening)
//   regular  15:00 UTC Sunday (17:00/18:00 Israel)       an ordinary Sunday
//   night    17:00 and 18:00 UTC Sunday to Tuesday       when Sunday itself is yom tov: the one landing in Israel's 20:00 hour,
//                                                        on the night the rest days end
// Every other entry skips. The route also skips a tenant who already got this week's digest, so no slot can send twice.

export type DigestSlot = { run: boolean; reason: 'ok' | 'yomtov' | 'other-slot' | 'saturday-night-done' };

export function digestCronSlot(now: Date, { isYomTov = () => false, retry = false }: { isYomTov?: (day: string) => boolean; retry?: boolean } = {}): DigestSlot {
  const { weekday, hour } = israelClock(now);
  const today = israelDayKey(now);
  const rest = (k: string) => weekdayOfKey(k) === 6 || isYomTov(k);
  const ok: DigestSlot = { run: true, reason: 'ok' };
  if (rest(today) && hour < SATURDAY_NIGHT_HOUR) return { run: false, reason: 'yomtov' };
  if (retry) return rest(today) && rest(addDays(today, 1)) ? { run: false, reason: 'yomtov' } : ok;
  if (weekday < 0 || weekday > 2) return { run: false, reason: 'other-slot' };
  if (weekday === 0 && !rest(today)) {
    if (rest(addDays(today, 1))) return hour < EVE_LATEST_HOUR ? ok : { run: false, reason: 'other-slot' };
    return hour >= EVE_LATEST_HOUR && hour < SATURDAY_NIGHT_HOUR - 1 ? ok : { run: false, reason: 'other-slot' };
  }
  // Deferred: only when every day from this Sunday to today was a rest day, and the rest ends tonight.
  const sunday = addDays(today, -weekday);
  for (let k = sunday; k <= today; k = addDays(k, 1)) if (!rest(k)) return { run: false, reason: 'other-slot' };
  if (rest(addDays(today, 1))) return { run: false, reason: 'yomtov' };
  return hour === SATURDAY_NIGHT_HOUR ? ok : { run: false, reason: 'saturday-night-done' };
}
