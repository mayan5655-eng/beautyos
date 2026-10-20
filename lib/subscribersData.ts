// lib/subscribersData.ts
//
// SERVER ONLY. The rows behind the owner's subscribers screen (/dashboard/admin/subscribers) and her morning digest
// (/api/owner-digest), read on the service-role client the caller hands in. It does NOT check who is asking: every caller
// gates first - the screen with requirePlatformAdmin() (app/dashboard/admin/subscribers/loader.ts), the digest with the cron
// secret (lib/cronAuth.js).
//
// What is read, per business (never a cosmetician's clients, never a client row):
//   - public.tenants: name, dates, plan state, signup source, owner id, booking-link slug;
//   - public.settings: her business name, her own name, her business phone, and whether she set her WhatsApp number;
//   - auth users (service role): the account email, the last sign-in and the name she gave at signup;
//   - platform_tenant_metrics(): last activity, setup progress and the appointment COUNT (an integer, no rows);
//   - billing_subscriptions: the status only (to tell a payment problem apart);
//   - admin_tenant_contacts: the owner's own notes.
// The last three degrade: a function or table that has not been created yet only hides its part.
//
// Nothing is stored or logged here (errors log a message only), and nothing is sent.
import type { SupabaseClient } from '@supabase/supabase-js'
import { isDemoTenantId } from './demoTenants.ts'
import { isPlaceholderSlug } from './autoSlug.ts'
import { displayPhone } from './publicLanding.ts'
import { planState } from './planState.ts'
import { buildSubscriberLinks, cleanEmail, contactEligible } from './ownerContact.ts'
import { segmentOf, latestOf, isContactStatus } from './subscribers.ts'
import type { SubscriberRow } from './subscribers.ts'

type Db = SupabaseClient

type TenantRow = {
  id: string; name: string | null; created_at: string | null; plan_status: string | null; trial_started_at: string | null
  trial_ends_at: string | null; plan_price: number | string | null; signup_source: string | null; owner_id: string | null; slug: string | null
}
type SettingsRow = { tenant_id: string; business_name: string | null; therapist_name: string | null; business_phone: string | null; wa: string | null }
type AccountRow = { email: string | null; lastSignInAt: string | null; fullName: string | null }
type MetricsRow = { id: string; last_activity_at: string | null; setup_score: number | null; setup_total: number | null; appointment_count: number | null }
type ContactRow = { tenant_id: string; status: string; note: string | null; follow_up_on: string | null; contacted_at: string | null; updated_at: string | null }

export type SubscriberData =
  | { ok: true; rows: SubscriberRow[]; notesAvailable: boolean; metricsAvailable: boolean }
  | { ok: false }

const TENANT_COLUMNS = 'id, name, created_at, plan_status, trial_started_at, trial_ends_at, plan_price, signup_source, owner_id, slug'
const CONTACT_COLUMNS = 'tenant_id, status, note, follow_up_on, contacted_at, updated_at'

const text = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''
  return s && s !== 'העסק שלי' ? s.slice(0, 80) : null
}
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

/** Every auth account, a page of 1000 at a time (one request for any platform this size). */
async function readAccounts(db: Db): Promise<Map<string, AccountRow>> {
  const out = new Map<string, AccountRow>()
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) { console.error('[subscribers] account list failed:', error.message); break }
    const users = data?.users || []
    for (const u of users) {
      const meta = (u.user_metadata || {}) as Record<string, unknown>
      out.set(u.id, { email: u.email ?? null, lastSignInAt: u.last_sign_in_at ?? null, fullName: text(meta.full_name) })
    }
    if (users.length < 1000) break
  }
  return out
}

/**
 * Every real business (not a demo, not one in `excludeTenantIds`), unsorted.
 * @param excludeTenantIds the platform owner's own business(es): not signups, never contacted from here
 */
export async function readSubscriberRows(db: Db, excludeTenantIds: string[], now: Date = new Date()): Promise<SubscriberData> {
  const exclude = new Set(excludeTenantIds.filter(Boolean))
  const tenantsRes = await db.from('tenants').select(TENANT_COLUMNS)
  if (tenantsRes.error || !tenantsRes.data) {
    console.error('[subscribers] tenants read failed:', tenantsRes.error?.message)
    return { ok: false }
  }
  const tenants = (tenantsRes.data as unknown as TenantRow[]).filter((t) => !isDemoTenantId(t.id) && !exclude.has(t.id))
  const ids = tenants.map((t) => t.id)
  if (ids.length === 0) return { ok: true, rows: [], notesAvailable: true, metricsAvailable: true }

  const [settingsRes, metricsRes, billingRes, contactsRes, accounts] = await Promise.all([
    db.from('settings').select('tenant_id, business_name, therapist_name, business_phone, wa:branding->>whatsapp_number').in('tenant_id', ids),
    db.rpc('platform_tenant_metrics'),
    db.from('billing_subscriptions').select('tenant_id, status').in('tenant_id', ids),
    db.from('admin_tenant_contacts').select(CONTACT_COLUMNS).in('tenant_id', ids),
    readAccounts(db),
  ])
  if (settingsRes.error) console.error('[subscribers] settings read failed:', settingsRes.error.message)
  if (metricsRes.error) console.error('[subscribers] platform_tenant_metrics unavailable:', metricsRes.error.message)
  if (billingRes.error) console.error('[subscribers] billing_subscriptions unavailable:', billingRes.error.message)
  if (contactsRes.error) console.error('[subscribers] admin_tenant_contacts unavailable:', contactsRes.error.message)

  const settingsOf = new Map<string, SettingsRow>()
  for (const s of (settingsRes.data || []) as unknown as SettingsRow[]) settingsOf.set(s.tenant_id, s)
  const metricsOf = new Map<string, MetricsRow>()
  if (!metricsRes.error && Array.isArray(metricsRes.data)) for (const m of metricsRes.data as MetricsRow[]) metricsOf.set(m.id, m)
  const billingOf = new Map<string, string>()
  for (const b of (billingRes.data || []) as Array<{ tenant_id: string; status: string }>) billingOf.set(b.tenant_id, b.status)
  const contactOf = new Map<string, ContactRow>()
  for (const c of (contactsRes.data || []) as ContactRow[]) contactOf.set(c.tenant_id, c)

  const settingsKnown = !settingsRes.error
  const metricsAvailable = !metricsRes.error
  const rows: SubscriberRow[] = tenants.map((t) => {
    const s = settingsOf.get(t.id)
    const m = metricsOf.get(t.id)
    const acc = t.owner_id ? accounts.get(t.owner_id) : undefined
    const c = contactOf.get(t.id)
    const billing = billingOf.get(t.id) ?? null
    const businessName = text(s?.business_name) || text(t.name) || 'ללא שם'
    const segment = segmentOf({ ...t, billing_status: billing }, now)
    const plan = planState(t, now)
    const phone = s?.business_phone ?? null
    const email = cleanEmail(acc?.email)
    const eligible = contactEligible({ id: t.id, name: businessName }, null)
    const slug = (t.slug || '').trim()
    const bookingLinkSet = slug ? !isPlaceholderSlug(slug, [t.owner_id, t.id]) : false
    return {
      id: t.id,
      businessName,
      ownerName: text(s?.therapist_name) || acc?.fullName || null,
      phone: displayPhone(phone),
      email,
      createdAt: t.created_at,
      segment,
      trialDaysLeft: plan.status === 'trial' ? plan.daysRemaining : null,
      planPrice: num(t.plan_price),
      source: text(t.signup_source),
      lastActivityAt: latestOf(acc?.lastSignInAt, m?.last_activity_at),
      lastSignInAt: acc?.lastSignInAt ?? null,
      setupScore: num(m?.setup_score),
      setupTotal: num(m?.setup_total),
      appointmentCount: num(m?.appointment_count),
      whatsappSet: settingsKnown ? !!text(s?.wa) : null,
      bookingLinkSet,
      bookingUrl: slug ? `/${encodeURIComponent(slug)}` : null,
      links: eligible ? buildSubscriberLinks({ segment, businessName, phone, email }) : { whatsapp: null, call: null, email: null },
      contact: {
        status: c && isContactStatus(c.status) ? c.status : 'not_contacted',
        note: c?.note || '',
        followUpOn: c?.follow_up_on ?? null,
        contactedAt: c?.contacted_at ?? null,
        updatedAt: c?.updated_at ?? null,
      },
    }
  })

  return { ok: true, rows, notesAvailable: !contactsRes.error, metricsAvailable }
}

/** The businesses the platform admins own themselves (by tenants.owner_id), for a caller with no session, like the cron. */
export async function platformOwnerTenantIds(db: Db): Promise<string[]> {
  const admins = await db.from('platform_admins').select('user_id')
  if (admins.error || !admins.data?.length) {
    if (admins.error) console.error('[subscribers] platform_admins read failed:', admins.error.message)
    return []
  }
  const userIds = (admins.data as Array<{ user_id: string }>).map((a) => a.user_id).filter(Boolean)
  const own = await db.from('tenants').select('id').in('owner_id', userIds)
  if (own.error) { console.error('[subscribers] owner tenants read failed:', own.error.message); return [] }
  return ((own.data || []) as Array<{ id: string }>).map((t) => t.id)
}
