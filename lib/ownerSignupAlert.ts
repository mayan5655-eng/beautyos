// lib/ownerSignupAlert.ts
//
// One alert to the platform owner when a new business finishes onboarding (the moment its settings row is first created, see
// app/api/settings/save/route.ts). It goes through the existing operator alert path (lib/opsAlert.js): the log, the ops_events table
// that /dashboard/admin shows, and WhatsApp to the operator's own number when one is configured. When no operator number is set, or
// WhatsApp is not connected, it is only written to the log.
//
// What it says: the business name, the signup source label and the time. Never an email, a phone number or anything about a client:
// the business name is cleaned of anything that looks like either before it is used.
//
// No duplicates: one alert per business (a record in ops_events, found by tenant id, before anything is raised), and no more than
// MAX_WHATSAPP_PER_HOUR messages an hour (a burst of signups still all land in the log, but only the first ones ring the phone).
// Demo businesses, the owner's own business and test-looking names (a 13-digit number, as the test runs create) raise nothing.
//
// Nothing here ever contacts the new business.

import { isDemoTenantId } from './demoTenants.ts'
import { looksLikeTestName } from './ownerContact.ts'
import { APP_URL } from './appUrl.ts'

/** Where the owner reaches the new business from: the subscribers screen, with her contact buttons. */
export const SUBSCRIBERS_PATH = '/dashboard/admin/subscribers'

export const SIGNUP_ALERT_SOURCE = 'new-signup'
export const MAX_WHATSAPP_PER_HOUR = 10
export const UNKNOWN_SOURCE_HE = 'לא ידוע'

/** A business name that is safe to put in an alert: no email-looking text, no long digit runs, no control characters, bounded. */
export function safeBusinessName(name: unknown): string {
  const s = String(name ?? '')
    .replace(/[\u0000-\u001f‎‏‪-‮]/g, ' ')
    .replace(/\S+@\S+/g, ' ')                    // anything with an @
    .replace(/\+?\d[\d\s().-]{5,}\d/g, ' ')      // a phone-like run of digits
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
  return s || 'ללא שם'
}

export function safeSourceLabel(label: unknown): string {
  const s = String(label ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\S+@\S+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  return s || UNKNOWN_SOURCE_HE
}

export function timeHe(now: Date): string {
  return new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(now)
}

export function signupAlertMessage(o: { businessName: unknown; source: unknown; at: Date }): string {
  return `עסק חדש סיים הרשמה בקלמיה: ${safeBusinessName(o.businessName)}. מקור: ${safeSourceLabel(o.source)}. ${timeHe(o.at)}
ליצירת קשר: ${APP_URL}${SUBSCRIBERS_PATH}`
}

type Db = {
  from: (t: string) => any
}
type Raise = (a: { db: any; send?: any; to?: string; source: string; severity: 'info' | 'warning' | 'error'; message: string; details?: object | null }) => Promise<unknown>

export type SignupAlertResult =
  | { status: 'raised'; whatsapp: boolean }
  | { status: 'skipped'; reason: 'demo' | 'owner' | 'test-name' | 'duplicate' | 'no-tenant' }

/**
 * @param ownerTenantId the platform owner's own business, never alerted about (null when unknown)
 * @param to            the operator WhatsApp number; empty means log only
 */
export async function notifyOwnerOfSignup(
  o: { db: Db; tenantId: string; businessName: unknown; ownerTenantId?: string | null; to?: string; send?: unknown; raise?: Raise; now?: () => Date },
): Promise<SignupAlertResult> {
  const { db, tenantId } = o
  if (!tenantId) return { status: 'skipped', reason: 'no-tenant' }
  if (isDemoTenantId(tenantId)) return { status: 'skipped', reason: 'demo' }
  if (o.ownerTenantId && tenantId === o.ownerTenantId) return { status: 'skipped', reason: 'owner' }
  if (looksLikeTestName(o.businessName)) return { status: 'skipped', reason: 'test-name' }

  // One alert per business: an earlier record for this tenant means it was already raised.
  const prior = await db.from('ops_events').select('id').eq('source', SIGNUP_ALERT_SOURCE).contains('details', { tenant_id: tenantId }).limit(1)
  if (!prior.error && Array.isArray(prior.data) && prior.data.length > 0) return { status: 'skipped', reason: 'duplicate' }

  // The signup source label (written earlier by /api/attribution). Not a person's data: "instagram / bio".
  let source: unknown = null
  const t = await db.from('tenants').select('signup_source').eq('id', tenantId).maybeSingle()
  if (!t.error) source = t.data?.signup_source

  // Throttle: count what rang the phone in the last hour; past the cap the alert is logged only.
  const now = (o.now || (() => new Date()))()
  const since = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
  const recent = await db.from('ops_events').select('id', { count: 'exact', head: true }).eq('source', SIGNUP_ALERT_SOURCE).neq('whatsapp_delivery', 'no_operator_number').gte('created_at', since)
  const overCap = !recent.error && typeof recent.count === 'number' && recent.count >= MAX_WHATSAPP_PER_HOUR
  const number = String(o.to || '').trim()
  const toNumber = number && !overCap ? number : undefined

  let raise = o.raise
  if (!raise) {
    const mod = await import('./opsAlert.js')
    raise = mod.raiseOpsAlert as Raise
  }
  let send = o.send
  if (!send && toNumber) {
    const wa = await import('./whatsapp.js')
    send = wa.sendWhatsApp
  }
  await raise({
    db,
    send: toNumber ? send : undefined,
    to: toNumber,
    source: SIGNUP_ALERT_SOURCE,
    severity: 'info',
    message: signupAlertMessage({ businessName: o.businessName, source, at: now }),
    details: { tenant_id: tenantId },
  })
  return { status: 'raised', whatsapp: !!toNumber }
}
