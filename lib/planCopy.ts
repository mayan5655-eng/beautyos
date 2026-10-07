// lib/planCopy.ts
// SINGLE SOURCE OF TRUTH for every Hebrew string about plan state.
//
// The trial banner, the read-only notice on the standalone dashboard pages, the
// blocked-write toast inside beautyos.jsx and the API guard message all read
// from here, so the wording cannot drift between surfaces.
//
// House rules for everything in this file:
//   * Hebrew only, addressed to her in second person feminine.
//   * NO em-dashes and no en-dashes. Commas and full stops instead.
//   * Never blame her, and never imply her data is at risk. It is not: the gate
//     blocks writes and never deletes anything.

import type { PlanStatus } from './planState.ts'

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

export const TRIAL_URGENT_BODY_HE = 'אפשר להמשיך לעבוד בלי הפסקה. כתבי לי ונסגור את זה בקלות. כל מה שיצרת נשאר שלך, גם אם תרצי לעצור.'

/** The urgent card's body, led by the date the trial ends when it is known. */
export function trialUrgentBodyHe(endsAt?: Date | null): string {
  const date = trialEndDateHe(endsAt)
  return date ? `תקופת ההתנסות מסתיימת בתאריך ${date}. ${TRIAL_URGENT_BODY_HE}` : TRIAL_URGENT_BODY_HE
}

/**
 * The blocked notice. `paused` gets deliberately softer wording: a paused
 * account is an arrangement we made, not a debt.
 */
export function blockedNoticeHe(status: PlanStatus, endedAt?: Date | null): { title: string; body: string } {
  if (status === 'paused') {
    return {
      title: 'החשבון בהשהיה',
      body: 'החשבון במצב צפייה בלבד. כל הנתונים שלך שמורים במלואם, ואפשר לראות את היומן והלקוחות כרגיל. כשתרצי לחזור, אני כאן.',
    }
  }
  const date = trialEndDateHe(endedAt)
  return {
    title: 'תקופת ההתנסות הסתיימה',
    body: `${date ? `ההתנסות הסתיימה בתאריך ${date}. ` : ''}החשבון עבר למצב צפייה בלבד. כל הנתונים שלך שמורים במלואם, ואפשר להמשיך לראות את היומן והלקוחות. כדי לחזור לעבוד במלוא הכלים, נסדר את ההמשך בהודעה קצרה.`,
  }
}

/** Compact badge for headers and next to disabled controls. */
export const READ_ONLY_BADGE_HE = 'מצב צפייה בלבד'

/**
 * Shown the moment she tries a blocked write, so she never meets a raw error.
 * Used by the guard in beautyos.jsx and by the RLS-denial fallback.
 */
export const WRITE_BLOCKED_TOAST_HE =
  'החשבון במצב צפייה בלבד, אז לא ניתן להוסיף או לעדכן כרגע. הנתונים הקיימים שמורים וזמינים לצפייה.'

/** `title` attribute / tooltip on a disabled control, explaining why. */
export const DISABLED_REASON_HE =
  'לא זמין במצב צפייה בלבד. אפשר להמשיך לצפות בנתונים הקיימים.'

/** Primary call to action out of the blocked state. */
export const CTA_WHATSAPP_HE = 'דברי איתי בוואטסאפ'

/** Secondary line under the CTA, framing renewal without payment wording. */
export const CTA_RENEW_HINT_HE = 'לחידוש המנוי או לכל שאלה, אני זמינה בוואטסאפ.'

/** Short line for the API layer, when a fetch is intercepted server-side. */
export const API_BLOCKED_MESSAGE_HE =
  'החשבון במצב צפייה בלבד. כל הנתונים שלך שמורים במלואם, ואפשר להמשיך בכל רגע.'
