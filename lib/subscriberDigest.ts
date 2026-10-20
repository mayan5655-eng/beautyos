// lib/subscriberDigest.ts
//
// The platform owner's morning digest about her subscribers: who to talk to today. Pure and client-safe (it imports no data
// module and no contact module), so the same summary feeds the cron (/api/owner-digest: WhatsApp to her, the admin log, a push
// to her own devices) and the strip at the top of /dashboard/admin/subscribers.
//
// Four lists, each only about a business, never about a cosmetician's clients:
//   newUncontacted  signed up in the last NEW_SIGNUP_DAYS days and she has not spoken to her yet
//   followUps       she set "לחזור אליה" for today or an earlier day
//   trialsEnding    on a trial that ends within TRIAL_ENDING_DAYS days, and not marked "not relevant"
//   pastDue         a payment that did not go through
// The message text carries business names only (no phone, no email). Nothing to report -> no message.

import { needsFirstContact, israelDate } from './subscribers.ts'
import type { SubscriberRow } from './subscribers.ts'

export const TRIAL_ENDING_DAYS = 3
/** Names per list in the message; the rest become "ועוד N". */
export const NAMES_PER_LIST = 8

export type DigestRow = Pick<SubscriberRow, 'id' | 'businessName' | 'createdAt' | 'segment' | 'trialDaysLeft' | 'contact'>

export type Digest = {
  newUncontacted: Array<{ id: string; name: string }>
  followUps: Array<{ id: string; name: string; overdueDays: number }>
  trialsEnding: Array<{ id: string; name: string; daysLeft: number }>
  pastDue: Array<{ id: string; name: string }>
  total: number
}

const dayNumber = (ymd: string) => Math.round(Date.parse(`${ymd}T12:00:00Z`) / 86_400_000)

export function buildDigest(rows: DigestRow[], now: Date): Digest {
  const today = israelDate(now)
  const d: Digest = { newUncontacted: [], followUps: [], trialsEnding: [], pastDue: [], total: 0 }
  for (const r of rows) {
    const name = r.businessName
    if (needsFirstContact(r, now)) d.newUncontacted.push({ id: r.id, name })
    const f = r.contact.followUpOn
    if (r.contact.status === 'follow_up' && f && /^\d{4}-\d{2}-\d{2}$/.test(f) && f <= today) {
      d.followUps.push({ id: r.id, name, overdueDays: Math.max(0, dayNumber(today) - dayNumber(f)) })
    }
    if ((r.segment === 'trial' || r.segment === 'new') && r.trialDaysLeft !== null && r.trialDaysLeft <= TRIAL_ENDING_DAYS && r.contact.status !== 'not_relevant') {
      d.trialsEnding.push({ id: r.id, name, daysLeft: r.trialDaysLeft })
    }
    if (r.segment === 'past_due' && r.contact.status !== 'not_relevant') d.pastDue.push({ id: r.id, name })
  }
  d.followUps.sort((a, b) => b.overdueDays - a.overdueDays)
  d.trialsEnding.sort((a, b) => a.daysLeft - b.daysLeft)
  d.total = new Set([...d.newUncontacted, ...d.followUps, ...d.trialsEnding, ...d.pastDue].map((x) => x.id)).size
  return d
}

export function digestIsEmpty(d: Digest): boolean {
  return d.total === 0
}

/** "יום אחד" / "יומיים" / "3 ימים" */
function daysWord(n: number): string {
  return n === 1 ? 'יום אחד' : n === 2 ? 'יומיים' : `${n} ימים`
}

type Clean = (name: unknown) => string

function list<T extends { name: string }>(items: T[], clean: Clean, extra?: (x: T) => string): string {
  const shown = items.slice(0, NAMES_PER_LIST).map((x) => `• ${clean(x.name)}${extra ? extra(x) : ''}`)
  if (items.length > NAMES_PER_LIST) shown.push(`• ועוד ${items.length - NAMES_PER_LIST}`)
  return shown.join('\n')
}

/**
 * The WhatsApp / admin-log text, or null when there is nothing to report.
 * @param clean makes a business name safe to send (the server passes lib/ownerSignupAlert.ts safeBusinessName)
 */
export function digestMessageHe(d: Digest, link: string, clean: Clean): string | null {
  if (digestIsEmpty(d)) return null
  const parts: string[] = ['בוקר טוב 🌸 מה מחכה לך היום בקלמיה:']
  if (d.newUncontacted.length) parts.push(`נרשמו ועוד לא דיברת איתן (${d.newUncontacted.length}):\n${list(d.newUncontacted, clean)}`)
  if (d.followUps.length) {
    parts.push(`לחזור אליהן היום (${d.followUps.length}):\n${list(d.followUps, clean, (x) => (x.overdueDays > 0 ? ` (באיחור של ${daysWord(x.overdueDays)})` : ''))}`)
  }
  if (d.trialsEnding.length) {
    parts.push(`הניסיון מסתיים בקרוב (${d.trialsEnding.length}):\n${list(d.trialsEnding, clean, (x) => (x.daysLeft <= 0 ? ' (היום)' : ` (עוד ${daysWord(x.daysLeft)})`))}`)
  }
  if (d.pastDue.length) parts.push(`תשלום שלא עבר (${d.pastDue.length}):\n${list(d.pastDue, clean)}`)
  parts.push(`לכל הפרטים ויצירת קשר: ${link}`)
  return parts.join('\n\n')
}

/** A short title and line for a push notification. */
export function digestPushHe(d: Digest): { title: string; body: string } | null {
  if (digestIsEmpty(d)) return null
  const bits: string[] = []
  if (d.newUncontacted.length) bits.push(`${d.newUncontacted.length} חדשות לדבר איתן`)
  if (d.followUps.length) bits.push(`${d.followUps.length} לחזור אליהן`)
  if (d.trialsEnding.length) bits.push(`${d.trialsEnding.length} ניסיונות מסתיימים`)
  if (d.pastDue.length) bits.push(`${d.pastDue.length} תשלומים שלא עברו`)
  return { title: 'מעקב מנויות להיום', body: bits.join(' · ') }
}
