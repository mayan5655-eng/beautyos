// lib/design/suggestions.ts
//
// "מה מפרסמים השבוע": the posts the app can propose before she asks,
// from what it already knows. Pure - no fetching, no dates read from the
// clock - so the studio can render them instantly and a test can pin them.
//
//   occasion   a holiday or season whose window is open (lib/design/holidays)
//   quiet day  the emptiest working day in the coming week -> "התפנה תור"
//   treatment  a service she offers and has never posted about
//   review     a saved review she has not turned into a post lately
//   tip        the week's tip, rotating through the knowledge templates
//
// Each suggestion names a template key and the values to prefill; the
// studio draws it with her branding and opens it as a design on tap.

import { upcomingHolidays, holidayPrompt, type Upcoming } from './holidays.ts';

export type Suggestion = {
  key: string;
  /** Hebrew, one line: why this, now. */
  reason: string;
  templateKey: string;
  values: Record<string, string>;
  /** The occasion behind it, when there is one (for the days-left badge). */
  upcoming?: Upcoming;
};

export type SuggestionInput = {
  today?: Date;
  /** Appointments in the coming days: only the date matters. */
  appointments?: { date?: string | null; status?: string | null }[] | null;
  services?: { name?: string | null }[] | null;
  /** Her saved designs: what she already posted about. */
  designs?: { template_key?: string | null; values?: Record<string, unknown> | null; created_at?: string | null }[] | null;
  reviews?: unknown[] | null;
  /** Days she works, 0 = Sunday; all but Saturday by default. */
  workingDays?: number[] | null;
  /** Which holiday templates exist, by occasion key -> template key. */
  holidayTemplates?: Record<string, string> | null;
};

const DAY = 86_400_000;
const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const TIP_ROTATION = ['tip-feed', 'routine-feed', 'info-feed', 'myths-feed', 'faq-feed', 'skin-health-feed'];

const isoDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

/** The emptiest working day in the next seven, when the week is not uniformly full. */
export function quietDay(input: SuggestionInput): { date: string; weekday: string; count: number } | null {
  const today = input.today || new Date();
  const working = input.workingDays && input.workingDays.length ? input.workingDays : [0, 1, 2, 3, 4, 5];
  const counts = new Map<string, number>();
  for (const a of input.appointments || []) {
    if (!a?.date || a.status === 'cancelled') continue;
    counts.set(String(a.date).slice(0, 10), (counts.get(String(a.date).slice(0, 10)) || 0) + 1);
  }
  const days: { date: string; weekday: string; count: number }[] = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date(today.getTime() + i * DAY);
    const dow = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'short' }).format(d) === 'Sun' ? 0 : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'short' }).format(d)));
    if (!working.includes(dow)) continue;
    const date = isoDay(d);
    days.push({ date, weekday: WEEKDAYS[dow], count: counts.get(date) || 0 });
  }
  if (!days.length) return null;
  const max = Math.max(...days.map((d) => d.count));
  const min = days.reduce((a, b) => (b.count < a.count ? b : a));
  // A uniformly busy week has no quiet day worth a post; an empty calendar has nothing to fill.
  if (max === 0 || min.count >= max) return null;
  return min;
}

/** The first service she has never written a post about. */
export function unpostedService(input: SuggestionInput): string | null {
  const posted = (input.designs || []).flatMap((d) => Object.values(d.values || {}).map(clean)).filter(Boolean).map((s) => s.toLowerCase());
  for (const s of input.services || []) {
    const name = clean(s?.name);
    if (!name) continue;
    if (!posted.some((p) => p.includes(name.toLowerCase()))) return name;
  }
  return null;
}

/** Up to `max` suggestions, occasions first. */
export function suggestPosts(input: SuggestionInput, max = 5): Suggestion[] {
  const today = input.today || new Date();
  const out: Suggestion[] = [];
  const templates = input.holidayTemplates || {};
  for (const u of upcomingHolidays(today)) {
    const templateKey = templates[u.holiday.key];
    if (!templateKey) continue;
    out.push({ key: `occasion:${u.holiday.key}`, reason: holidayPrompt(u), templateKey, values: {}, upcoming: u });
  }
  const quiet = quietDay(input);
  if (quiet) {
    const [, m, d] = quiet.date.split('-');
    out.push({ key: `quiet:${quiet.date}`, reason: `יום ${quiet.weekday} נראה שקט ביומן. פוסט "התפנה תור"?`, templateKey: 'slot-opened-feed', values: { subline: `יום ${quiet.weekday}, ${Number(d)}.${Number(m)}` } });
  }
  const service = unpostedService(input);
  if (service) out.push({ key: `service:${service}`, reason: `עוד לא פרסמת על ${service}.`, templateKey: 'facial-feed', values: { headline: service, kicker: 'טיפול' } });
  const reviews = input.reviews || [];
  const recentReview = (input.designs || []).some((d) => d.template_key?.startsWith('review-') && d.created_at && today.getTime() - new Date(d.created_at).getTime() < 30 * DAY);
  if (reviews.length && !recentReview) out.push({ key: 'review', reason: 'יש לך ביקורת שמורה שעוד לא הפכה לפוסט.', templateKey: 'review-feed', values: {} });
  const week = Math.floor(today.getTime() / (7 * DAY));
  out.push({ key: 'tip', reason: 'הטיפ של השבוע, מוכן לפרסום.', templateKey: TIP_ROTATION[week % TIP_ROTATION.length], values: {} });
  return out.slice(0, max);
}
