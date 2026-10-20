// lib/subscribers.ts
//
// The platform owner's subscribers screen (/dashboard/admin/subscribers): the businesses that signed up to Kalmea, their stage, and
// her own follow-up notes about each one. Pure and client-safe: it imports no data module and no contact module, so the screen's
// client component can filter and search with it. The rows it works on are built on the server, behind requirePlatformAdmin(), by
// app/dashboard/admin/subscribers/loader.ts.
//
// Nothing here knows about a cosmetician's clients: every field is about the business itself (its account, its plan, its setup).

import { planState } from './planState.ts'

const MS_DAY = 24 * 60 * 60 * 1000

/** A signup is "new" for this many days after the account was created. */
export const NEW_SIGNUP_DAYS = 7

/** The owner's stages, in the order the filter shows them. */
export const SEGMENTS = ['new', 'trial', 'paying', 'past_due', 'churned'] as const
export type Segment = (typeof SEGMENTS)[number]

export const SEGMENT_HE: Record<Segment, string> = {
  new: 'חדשות',
  trial: 'בניסיון',
  paying: 'משלמות',
  past_due: 'תשלום בפיגור',
  churned: 'עזבו',
}

/** Her own follow-up states. Matches the check constraint in supabase/migrations/add_admin_tenant_contacts.sql. */
export const CONTACT_STATUSES = ['not_contacted', 'contacted', 'follow_up', 'no_answer', 'not_relevant'] as const
export type ContactStatus = (typeof CONTACT_STATUSES)[number]

export const CONTACT_STATUS_HE: Record<ContactStatus, string> = {
  not_contacted: 'עוד לא דיברנו',
  contacted: 'דיברנו',
  follow_up: 'לחזור אליה',
  no_answer: 'לא ענתה',
  not_relevant: 'לא רלוונטי',
}

export const NOTE_MAX = 1000

export function isContactStatus(v: unknown): v is ContactStatus {
  return typeof v === 'string' && (CONTACT_STATUSES as readonly string[]).includes(v)
}

const ms = (iso: string | null | undefined): number => {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isFinite(t) ? t : NaN
}

export type SegmentInput = {
  created_at: string | null
  plan_status: string | null
  trial_started_at?: string | null
  trial_ends_at: string | null
  /** billing_subscriptions.status when a subscription row exists (trialing / active / past_due / canceled), else null */
  billing_status?: string | null
}

/**
 * One stage per business. A payment problem wins (it is the most urgent call), then a business that left (blocked, paused or a
 * canceled subscription), then a paying one; a trial is "new" for its first NEW_SIGNUP_DAYS days.
 */
export function segmentOf(t: SegmentInput, now: Date): Segment {
  if (t.billing_status === 'past_due') return 'past_due'
  const p = planState(t, now)
  if (p.status === 'expired' || p.status === 'paused' || t.billing_status === 'canceled') return 'churned'
  if (p.status === 'active') return 'paying'
  const c = ms(t.created_at)
  if (Number.isFinite(c) && now.getTime() - c <= NEW_SIGNUP_DAYS * MS_DAY) return 'new'
  return 'trial'
}

/** What the screen needs for one business. Every field is already safe to render for a platform admin. */
export type SubscriberRow = {
  id: string
  businessName: string
  ownerName: string | null
  phone: string | null
  email: string | null
  createdAt: string | null
  segment: Segment
  /** whole trial days left, null when not on a dated trial */
  trialDaysLeft: number | null
  planPrice: number | null
  source: string | null
  /** the latest of: last sign-in, last thing created in the app. null when unknown */
  lastActivityAt: string | null
  lastSignInAt: string | null
  setupScore: number | null
  setupTotal: number | null
  appointmentCount: number | null
  /** she set the WhatsApp number her clients reach her on */
  whatsappSet: boolean | null
  /** she has her own booking link (not the signup placeholder) */
  bookingLinkSet: boolean | null
  bookingUrl: string | null
  links: { whatsapp: string | null; call: string | null; email: string | null }
  contact: { status: ContactStatus; note: string; followUpOn: string | null; contactedAt: string | null; updatedAt: string | null }
}

export function isNewSignup(r: Pick<SubscriberRow, 'createdAt'>, now: Date): boolean {
  const c = ms(r.createdAt)
  return Number.isFinite(c) && now.getTime() - c <= NEW_SIGNUP_DAYS * MS_DAY
}

/** New signups she has not spoken to yet: the top of the list. */
export function needsFirstContact(r: Pick<SubscriberRow, 'createdAt' | 'contact'>, now: Date): boolean {
  return r.contact.status === 'not_contacted' && isNewSignup(r, now)
}

/** Not-yet-contacted new signups first (newest first), then follow-ups that are due, then everyone else newest first. */
export function sortSubscribers<T extends Pick<SubscriberRow, 'createdAt' | 'contact'>>(rows: T[], now: Date): T[] {
  const today = israelDate(now)
  const rank = (r: T) => {
    if (needsFirstContact(r, now)) return 0
    if (r.contact.status === 'follow_up' && r.contact.followUpOn && r.contact.followUpOn <= today) return 1
    return 2
  }
  return [...rows].sort((a, b) => {
    const d = rank(a) - rank(b)
    if (d !== 0) return d
    return (ms(b.createdAt) || 0) - (ms(a.createdAt) || 0)
  })
}

export type Filter = 'all' | 'not_contacted' | Segment

const digits = (s: string) => s.replace(/\D/g, '')

/** Free-text search over the business name, her name, her email and her phone (digits only, so 054-123 and 054123 both match). */
export function matchesSearch(r: Pick<SubscriberRow, 'businessName' | 'ownerName' | 'email' | 'phone'>, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const text = [r.businessName, r.ownerName, r.email].filter(Boolean).join(' ').toLowerCase()
  if (text.includes(q)) return true
  const qd = digits(q)
  if (qd.length >= 3 && r.phone) {
    const pd = digits(r.phone)
    if (pd.includes(qd)) return true
    // "+972 54..." typed against a local "054..."
    if (qd.startsWith('972') && pd.includes('0' + qd.slice(3))) return true
  }
  return false
}

export function filterSubscribers<T extends Pick<SubscriberRow, 'segment' | 'contact' | 'businessName' | 'ownerName' | 'email' | 'phone'>>(
  rows: T[], filter: Filter, query: string,
): T[] {
  return rows.filter((r) => {
    if (filter === 'not_contacted' ? r.contact.status !== 'not_contacted' : filter !== 'all' && r.segment !== filter) return false
    return matchesSearch(r, query)
  })
}

export function segmentCounts(rows: Array<Pick<SubscriberRow, 'segment' | 'contact'>>): Record<Filter, number> {
  const c: Record<Filter, number> = { all: rows.length, not_contacted: 0, new: 0, trial: 0, paying: 0, past_due: 0, churned: 0 }
  for (const r of rows) {
    c[r.segment]++
    if (r.contact.status === 'not_contacted') c.not_contacted++
  }
  return c
}

/** Today's date in Israel, yyyy-mm-dd (the follow_up_on column is a calendar day). */
export function israelDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** The latest of several timestamps, or null when none parses. */
export function latestOf(...values: Array<string | null | undefined>): string | null {
  let best: number = NaN
  let out: string | null = null
  for (const v of values) {
    const t = ms(v)
    if (Number.isFinite(t) && (!Number.isFinite(best) || t > best)) { best = t; out = new Date(t).toISOString() }
  }
  return out
}

/** "היום" / "אתמול" / "לפני 5 ימים", or null when unknown. */
export function agoHe(iso: string | null | undefined, now: Date): string | null {
  const t = ms(iso)
  if (!Number.isFinite(t)) return null
  const days = Math.floor((now.getTime() - t) / MS_DAY)
  if (days <= 0) return 'היום'
  if (days === 1) return 'אתמול'
  if (days === 2) return 'לפני יומיים'
  return `לפני ${days} ימים`
}
