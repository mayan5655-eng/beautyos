// app/dashboard/owner/loader.ts
//
// SERVER ONLY. The one place the owner screens read data, behind requirePlatformAdmin(). A non-admin gets the same
// plain 404 as /dashboard/admin, before any service-role query is made.
//
// What is read, exactly:
//   - public.tenants, only the columns in OWNER_TENANT_COLUMNS (name, dates, plan status, signup source);
//   - the public.platform_tenant_metrics() function, projected immediately to business name + last-activity timestamp;
//   - public.product_feedback, what she herself wrote about Kalmea in the feedback banner.
// Never read: clients, appointments, receipts, leads, messages, emails, phone numbers. test-owner-control.ts pins this.
import { notFound } from 'next/navigation'
import { requirePlatformAdmin, createAdminClient } from '@/lib/adminGuard'
import { createClient as createSessionClient } from '@/lib/supabase/server'
import { OWNER_TENANT_COLUMNS, realTenants, activityRows, newestSignups } from '@/lib/ownerControl'
import type { OwnerTenant, ActivityRow, NewestSignup } from '@/lib/ownerControl'
import { loadSignupContacts } from './signups/contacts'
import type { SignupContact } from '@/lib/ownerContact'
import { isMissingTable } from '@/lib/feedbackBanner'
import type { FeedbackRow } from '@/lib/feedbackBanner'

/** Gate every owner page with this first. */
export async function requireOwner() {
  const admin = await requirePlatformAdmin()
  if (!admin.ok) notFound()
  // The admin's own business is not a "signup": flagged by id, read on the session client like the admin page does.
  let ownTenantId: string | null = null
  try {
    const session = await createSessionClient()
    const { data } = await session.rpc('get_user_tenant_id')
    ownTenantId = typeof data === 'string' ? data : null
  } catch { /* the screens then simply include it */ }
  return { db: createAdminClient(), ownTenantId }
}

async function readTenants(db: ReturnType<typeof createAdminClient>, ownTenantId: string | null): Promise<OwnerTenant[] | null> {
  const { data, error } = await db.from('tenants').select(OWNER_TENANT_COLUMNS)
  if (error || !data) {
    console.error('[owner] tenants read failed:', error?.message)
    return null
  }
  return realTenants(data as unknown as OwnerTenant[], ownTenantId)
}

export async function loadTenants(): Promise<{ ok: true; rows: OwnerTenant[] } | { ok: false }> {
  const { db, ownTenantId } = await requireOwner()
  const rows = await readTenants(db, ownTenantId)
  return rows ? { ok: true, rows } : { ok: false }
}

/**
 * The signups screen: every real business, the 20 newest, and for those 20 the phone, email and contact link. They are built
 * here, on the server, after requirePlatformAdmin() (inside requireOwner); a non-admin gets the 404 before anything is read.
 */
export async function loadSignupsPage(): Promise<{ ok: true; rows: OwnerTenant[]; newest: NewestSignup[]; contacts: Record<string, SignupContact> } | { ok: false }> {
  const { db, ownTenantId } = await requireOwner()
  const rows = await readTenants(db, ownTenantId)
  if (!rows) return { ok: false }
  const newest = newestSignups(rows, 20)
  const contacts = await loadSignupContacts(db, newest, ownTenantId)
  return { ok: true, rows, newest, contacts }
}

export async function loadActivity(): Promise<{ ok: true; rows: ActivityRow[] } | { ok: false }> {
  const { db, ownTenantId } = await requireOwner()
  const { data, error } = await db.rpc('platform_tenant_metrics')
  // Not run yet (hand-run migration), or failing: the screen says the signal is not available, it never invents one.
  if (error || !Array.isArray(data)) {
    console.error('[owner] platform_tenant_metrics unavailable:', error?.message)
    return { ok: false }
  }
  return { ok: true, rows: activityRows(data as Array<Record<string, unknown>>, ownTenantId) }
}

/** The feedback screen, newest first. Smoke and demo businesses and the admin's own are left out, by the same rule as every owner screen. */
export async function loadFeedback(): Promise<{ ok: true; rows: Array<FeedbackRow & { name: string }> } | { ok: false; reason: 'table-missing' | 'read-failed' }> {
  const { db, ownTenantId } = await requireOwner()
  const { data, error } = await db.from('product_feedback').select('tenant_id, rating, answers, free_text, created_at').order('created_at', { ascending: false })
  if (error || !data) {
    console.error('[owner] product_feedback read failed:', error?.message)
    return { ok: false, reason: isMissingTable(error?.message) ? 'table-missing' : 'read-failed' }
  }
  const tenants = await readTenants(db, ownTenantId)
  if (!tenants) return { ok: false, reason: 'read-failed' }
  const names = new Map(tenants.map((t) => [t.id, t.name]))
  const rows = (data as FeedbackRow[]).filter((r) => names.has(r.tenant_id)).map((r) => ({ ...r, name: names.get(r.tenant_id) || 'עסק ללא שם' }))
  return { ok: true, rows }
}
