// lib/planCopy.ts
// SINGLE SOURCE OF TRUTH for every Hebrew string about plan state.
//
// The trial banner, the blocked screen that replaces the dashboard, the
// blocked-write toast inside beautyos.jsx and the API guard message all read
// from here, so the wording cannot drift between surfaces.
//
// The model since 2026-10-21 (owner decision): one plan, a 30-day trial with
// everything, and when it ends without payment the system CLOSES. No read-only
// mode: she sees only the renewal screen until she renews. Nothing is deleted,
// reminders for appointments already booked keep going, and her public booking
// page takes no new bookings in the meantime.
//
// House rules for everything in this file:
//   * Hebrew only, addressed to her in second person feminine.
//   * NO em-dashes and no en-dashes. Commas and full stops instead.
//   * Never blame her, and never imply her data is at risk. It is not: the gate
//     hides and blocks, it never deletes anything.

import type { PlanStatus } from './planState.ts'
import { PLAN_PRICES, priceHe } from './pricing.ts'

/**
 * The intro price line. Owner's words (2026-10-21): "מחיר היכרות 349 לזמן מוגבל, לא לציין תאריך". So: always
 * "מחיר היכרות 349 ₪ לזמן מוגבל", never a date. Numbers come from lib/pricing.ts only.
 */
export const PRICE_LINE_HE = `מחיר היכרות ${priceHe(PLAN_PRICES.launch)} לזמן מוגבל, במקום ${priceHe(PLAN_PRICES.regular)} לחודש.`

/** Hebrew needs a real dual form: "יומיים", not "2 ימים". */
export function daysHe(n: number): string {
  if (n === 1) return 'יום אחד'
  if (n === 2) return 'יומיים'
  return `${n} ימים`
}

/**
 * The day the trial ends, as she reads dates: 30.10.2026, in Israel's calendar (the same day for her and for the clock that ends it).
 * Words around it say "בתאריך", never "ב-" glued to the digits, so no bidi rule can turn the hyphen into a sign.
 */
export function trialEndDateHe(d: Date | null | undefined): string {
  if (!d || Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric' })
    .format(d)
    .replace(/\//g, '.')
}

/** The quiet line shown for most of the trial. With the end date when it is known: the cliff is never a surprise. */
export function trialGentleHe(days: number, endsAt?: Date | null): string {
  const date = trialEndDateHe(endsAt)
  return `תקופת ההתנסות שלך פעילה, נשארו עוד ${daysHe(days)}${date ? `, עד ${date}` : ''}`
}

/**
 * Title for the final stretch of the trial. At one day we say "בקרוב" rather
 * than "מחר", because the count is rounded up and under 24 hours may remain.
 */
export function trialUrgentTitleHe(days: number): string {
  return days === 1
    ? 'תקופת ההתנסות מסתיימת בקרוב'
    : `תקופת ההתנסות מסתיימת בעוד ${daysHe(days)}`
}

/** Says plainly that the system closes at the end, so the day after is not a surprise. */
export const TRIAL_URGENT_BODY_HE = `בסוף ההתנסות המערכת נסגרת עד לחידוש המנוי. ${PRICE_LINE_HE} כתבי לי ונסגור את זה בקלות, בלי הפסקה בעבודה. כל מה שיצרת נשמר אצלנו, גם אם תרצי לעצור.`

/** The urgent card's body, led by the date the trial ends when it is known. */
export function trialUrgentBodyHe(endsAt?: Date | null): string {
  const date = trialEndDateHe(endsAt)
  return date ? `תקופת ההתנסות מסתיימת בתאריך ${date}. ${TRIAL_URGENT_BODY_HE}` : TRIAL_URGENT_BODY_HE
}

/**
 * The blocked screen. `paused` gets deliberately softer wording: a paused
 * account is an arrangement we made, not a debt.
 */
export function blockedNoticeHe(status: PlanStatus, endedAt?: Date | null): { title: string; body: string } {
  if (status === 'paused') {
    return {
      title: 'החשבון בהשהיה',
      body: 'המערכת סגורה בזמן ההשהיה. היומן, הלקוחות וכל מה שיצרת שמורים במלואם, ויחזרו בדיוק כמו שהיו. כשתרצי לחזור, אני כאן.',
    }
  }
  const date = trialEndDateHe(endedAt)
  return {
    title: 'תקופת ההתנסות הסתיימה',
    body: `${date ? `ההתנסות הסתיימה בתאריך ${date}. ` : ''}המערכת סגורה עד לחידוש המנוי. היומן, הלקוחות וכל מה שיצרת שמורים במלואם, ויחזרו בדיוק כמו שהיו ברגע שתחדשי.`,
  }
}

/** What keeps running and what does not while the system is closed, so nothing about her clients is a surprise. */
export const BLOCKED_CLIENTS_NOTE_HE =
  'הלקוחות שכבר קבעו תור ממשיכות לקבל תזכורות כרגיל. דף ההזמנות שלך לא מקבל תורים חדשים עד החידוש.'

/** Compact badge for a control that cannot be used while the system is closed. */
export const READ_ONLY_BADGE_HE = 'המערכת סגורה עד לחידוש המנוי'

/**
 * The upgrade button (behind NEXT_PUBLIC_UPGRADE_BUTTONS, lib/pricing.ts). During the trial it adds a card, and the first charge
 * happens only when the trial ends, so the label says the price and nothing about paying today.
 */
export function upgradeCtaHe(price: number): string {
  return `הצטרפות למנוי, ${priceHe(price)} לחודש`
}

/** Under the upgrade button: the trial is not cut short by joining. */
export const UPGRADE_HINT_HE = 'החיוב הראשון רק כשתקופת ההתנסות מסתיימת.'

/** The blocked card's button with the price on it, when the upgrade buttons are on. */
export function payToContinueHe(price: number): string {
  return `תשלום וחזרה לעבודה, ${priceHe(price)} לחודש`
}

/**
 * Shown the moment she tries a blocked write, so she never meets a raw error.
 * Used by the guard in beautyos.jsx and by the RLS-denial fallback.
 */
export const WRITE_BLOCKED_TOAST_HE =
  'המערכת סגורה עד לחידוש המנוי, אז לא ניתן להוסיף או לעדכן כרגע. כל הנתונים שלך שמורים.'

/** `title` attribute / tooltip on a disabled control, explaining why. */
export const DISABLED_REASON_HE = 'לא זמין עד לחידוש המנוי.'

/** Primary call to action out of the blocked state. */
export const CTA_WHATSAPP_HE = 'דברי איתי בוואטסאפ'

/** Secondary line under the CTA, framing renewal without payment wording. */
export const CTA_RENEW_HINT_HE = 'לחידוש המנוי או לכל שאלה, אני זמינה בוואטסאפ.'

/** Short line for the API layer, when a fetch is intercepted server-side. */
export const API_BLOCKED_MESSAGE_HE =
  'המערכת סגורה עד לחידוש המנוי. כל הנתונים שלך שמורים במלואם, ואפשר לחזור בכל רגע.'

/** Her public booking page while her system is closed: said to HER client, in her voice, with no word about billing. */
export const BOOKING_CLOSED_TITLE_HE = 'קביעת תורים אונליין לא זמינה כרגע'
export const BOOKING_CLOSED_BODY_HE = 'אפשר לקבוע תור ישירות איתי בוואטסאפ או בטלפון. אשמח לשמוע ממך.'
