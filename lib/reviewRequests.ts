// lib/reviewRequests.ts
//
// "How was it?" after a visit, in two steps. Pure: no database, no clock of its own, so every rule is proven by
// test-reviews-monthly-report.ts. The cron (lib/reminders/smartReminders.js), the client page (/review), its routes
// (/api/reviews, /api/reviews/feedback, /api/reviews/go) and her own screen (/dashboard/feedback) all read these rules from here.
//
// ── The flow ────────────────────────────────────────────────────────────────────────────────────────────────────────────
// The message carries ONE signed link (lib/reviewToken). It opens /review, which asks one question with two big answers:
//   "היה מעולה"            -> her Google review link first (through /api/reviews/go, which counts the tap), and our own stars
//                            form as the second choice. Without a Google link she gets the stars form, as before.
//   "משהו היה פחות טוב"    -> a private note that reaches only her (public.visit_feedback, shown in /dashboard/feedback and as
//                            an in-app notification). Never published.
//
// NOT REVIEW GATING. Google's policy forbids discouraging negative reviews or asking only happy clients for one. So the Google
// link is offered on BOTH paths: prominently after "היה מעולה", and as a plain line after the private note ("רוצה לכתוב גם
// ביקורת פומבית?"). The private note is an extra channel for an unhappy client, never a wall in front of Google. The stars form
// stays exactly as it was (every rating published, hide but never edit, lib/reviewCopy.ts).
//
// ── Who is asked, and when ──────────────────────────────────────────────────────────────────────────────────────────────
//   * a visit that happened: not cancelled, not a no show, not a personal block in her diary;
//   * never a client who asked to stop getting messages (marketing_opted_out_at), whatever the message type;
//   * at most once per client every N months (default 4, her choice 1..12), counted from the visit of the last request;
//   * at her timing: "the same day" (delay 0: the evening run, at least two hours after the visit ended, or the next day's run
//     when the visit ended too late) or 1..14 days after.
// Owner switch: settings.review_requests_enabled (an existing column, on by default). Platform switch for the two-step page:
// automations.feature_flags.review_two_step, ON unless explicitly false; off brings back the stars-only page and message.

import { tenantFlags } from './featureFlags.ts';
import { endMinute } from './apptTime.ts';

export const REVIEW_TWO_STEP_FLAG = 'review_two_step';
export const DEFAULT_REVIEW_DELAY_DAYS = 2;
export const REVIEW_SAME_DAY = 0;
export const DEFAULT_REVIEW_EVERY_MONTHS = 4;
/** On "the same day", a visit is asked about only when it ended at least this long ago. */
export const SAME_DAY_MIN_HOURS = 2;
export const MAX_FEEDBACK = 1000;
export const MOODS = ['happy', 'unhappy'] as const;
export type Mood = (typeof MOODS)[number];

type SettingsLike = { automations?: unknown; feature_flags?: unknown } | null | undefined;
const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** The two-step page and message. ON unless the platform flag is an explicit false. */
export function reviewTwoStepOn(settings: SettingsLike): boolean {
  return tenantFlags(settings)[REVIEW_TWO_STEP_FLAG] !== false;
}

/** Her timing from automations.timing: delay 0..14 days (0 = the same day), and once every 1..12 months. Bad values are the defaults. */
export function reviewTimingOf(automations: unknown): { delayDays: number; everyMonths: number } {
  const t = asObj(asObj(automations).timing);
  const rawDelay = t.review_delay_days;
  const rv = rawDelay === null || rawDelay === undefined || rawDelay === '' ? NaN : Number(rawDelay);
  const ev = Number(t.review_every_months);
  return {
    delayDays: Number.isInteger(rv) && rv >= 0 && rv <= 14 ? rv : DEFAULT_REVIEW_DELAY_DAYS,
    everyMonths: Number.isInteger(ev) && ev >= 1 && ev <= 12 ? ev : DEFAULT_REVIEW_EVERY_MONTHS,
  };
}

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' });
const clockFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** 'YYYY-MM-DD' in Israel, `back` days before `now`. */
export function israelDateBack(now: Date, back = 0): string {
  const today = dayFmt.format(now);
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/** Minutes since midnight in Israel. */
export function israelMinuteOfDay(now: Date): number {
  const parts = clockFmt.formatToParts(now);
  const get = (k: string) => Number(parts.find((p) => p.type === k)?.value || 0);
  return (get('hour') % 24) * 60 + get('minute');
}

/** The visit dates a run at `now` asks about for this delay. The same day also takes yesterday: a visit that ended too late for last evening's run. */
export function reviewDatesFor(delayDays: number, now: Date): string[] {
  if (delayDays === REVIEW_SAME_DAY) return [israelDateBack(now, 0), israelDateBack(now, 1)];
  return [israelDateBack(now, delayDays)];
}

export type ReviewAppt = {
  id?: unknown; client_id?: unknown; date?: unknown; confirmation_status?: unknown; kind?: unknown;
  start_minute?: number | null; hour?: number | null; duration?: number | string | null;
};

/** A visit that took place: not cancelled, not a no show, not a personal block. */
export function isReviewableVisit(a: ReviewAppt | null | undefined): boolean {
  if (!a) return false;
  const s = String(a.confirmation_status || '');
  if (s === 'cancelled' || s === 'no_show') return false;
  if (a.kind === 'personal') return false;
  return true;
}

/**
 * Is this visit due for a request in a run at `now`, for a business with this delay?
 * The same day: today's visits that ended SAME_DAY_MIN_HOURS ago (a visit without a readable time counts as ended only from
 * the next day), and yesterday's. Otherwise: exactly `delay` days ago.
 */
export function reviewDue(a: ReviewAppt, delayDays: number, now: Date): boolean {
  if (!isReviewableVisit(a)) return false;
  const d = String(a.date || '').slice(0, 10);
  if (!d) return false;
  if (delayDays !== REVIEW_SAME_DAY) return d === israelDateBack(now, delayDays);
  if (d === israelDateBack(now, 1)) return true;
  if (d !== israelDateBack(now, 0)) return false;
  const end = endMinute(a as never);
  if (end === null || !Number.isFinite(end)) return false;
  return israelMinuteOfDay(now) - end >= SAME_DAY_MIN_HOURS * 60;
}

/** Whole months between two 'YYYY-MM-DD' days, rounded down (Jan 31 to Feb 28 is 0). */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  let m = (ty - fy) * 12 + (tm - fm);
  if (td < fd) m -= 1;
  return m;
}

/** Was she asked too recently? `lastAskedVisit` is the visit date of her latest request, or null for never. */
export function askedTooRecently(lastAskedVisit: string | null | undefined, visitDate: string, everyMonths: number): boolean {
  if (!lastAskedVisit) return false;
  return monthsBetween(String(lastAskedVisit).slice(0, 10), String(visitDate).slice(0, 10)) < everyMonths;
}

/** Never to a client who asked to stop getting messages. */
export const optedOut = (client: { marketing_opted_out_at?: unknown } | null | undefined) => !!client?.marketing_opted_out_at;

/** The message the run queues. One link; the page asks the question. Without a link: the plain ask, as before. */
export function reviewRequestLines(o: { businessName: string; link: string; twoStep: boolean }): (string | null)[] {
  if (o.twoStep && o.link) {
    return [`תודה שהגעת ל${o.businessName} 🌸`, '', 'איך היה? אפשר לענות בלחיצה אחת:', o.link];
  }
  return [`תודה שהגעת ל${o.businessName}.`, '', 'איך היה? דירוג קצר עוזר מאוד, ולוקח פחות מדקה.', o.link || null];
}

/** The private note, cleaned: line breaks kept (at most six), control characters out, capped. */
export function cleanFeedback(v: unknown): string {
  return String(v ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ')
    .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 6).join('\n').slice(0, MAX_FEEDBACK);
}

export const isMood = (v: unknown): v is Mood => (MOODS as readonly string[]).includes(String(v));

/** Her Google link, only when it is a real https address. */
export function googleReviewUrlOf(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!/^https:\/\/\S+$/i.test(s)) return '';
  try { return new URL(s).protocol === 'https:' ? s : ''; } catch { return ''; }
}

/** Looks like a Google review or Maps link (for a gentle hint in Settings, never to block her). */
export function looksLikeGoogleLink(v: unknown): boolean {
  const s = googleReviewUrlOf(v);
  return !!s && /(^https:\/\/(g\.page|maps\.app\.goo\.gl|goo\.gl|search\.google\.|www\.google\.|google\.|maps\.google\.))/i.test(s);
}

/** public.visit_feedback has not been created yet (add_visit_feedback_2026-11-09.sql not run). */
export function isMissingFeedbackTable(e: { code?: string; message?: string } | null | undefined): boolean {
  if (!e) return false;
  if (e.code === '42P01' || e.code === 'PGRST205') return true;
  return /visit_feedback/.test(String(e.message || '')) && /(does not exist|schema cache|not find)/i.test(String(e.message || ''));
}

export const FEEDBACK_NEEDS_MIGRATION_HE = 'התשובות הפרטיות של הלקוחות עוד לא הופעלו אצלך: חסר עדכון אחד במסד הנתונים (kalmea-sql-visit-feedback.txt). עד שירוץ, בקשת הביקורת ממשיכה לעבוד כמו קודם.';

/** How she finds her Google review link. Short steps, in her words. */
export const GOOGLE_LINK_HELP: string[] = [
  'פתחי את גוגל וחפשי את שם העסק שלך (כשאת מחוברת לחשבון שמנהל את העסק).',
  'בכרטיס העסק לחצי על "בקשת ביקורות" או "קבלת ביקורות נוספות".',
  'העתיקי את הקישור שמופיע שם (מתחיל ב-https://g.page) והדביקי אותו כאן.',
];

export type FeedbackCounts = { requested: number; happy: number; unhappy: number; googleClicks: number; inAppReviews: number };

/** One short line for her, only what is known. Nothing asked yet: null. */
export function feedbackSummaryLine(c: FeedbackCounts): string | null {
  if (!c || c.requested <= 0) return null;
  const parts = [c.requested === 1 ? 'בקשת ביקורת אחת' : `${c.requested} בקשות ביקורת`];
  if (c.googleClicks > 0) parts.push(c.googleClicks === 1 ? 'לקוחה אחת עברה לגוגל' : `${c.googleClicks} עברו לגוגל`);
  if (c.inAppReviews > 0) parts.push(c.inAppReviews === 1 ? 'ביקורת אחת אצלך בעמוד' : `${c.inAppReviews} ביקורות אצלך בעמוד`);
  if (c.unhappy > 0) parts.push(c.unhappy === 1 ? 'הערה פרטית אחת' : `${c.unhappy} הערות פרטיות`);
  return parts.join(', ');
}

/** The in-app notification for a private note. */
export function feedbackNotice(o: { clientName: string; body: string }): { title: string; body: string } {
  const who = String(o.clientName || '').trim() || 'לקוחה';
  const text = String(o.body || '').trim();
  return {
    title: `${who} כתבה לך משהו פרטי`,
    body: text ? (text.length > 140 ? `${text.slice(0, 137)}...` : text) : 'סימנה שמשהו היה פחות טוב, בלי לכתוב פרטים.',
  };
}
