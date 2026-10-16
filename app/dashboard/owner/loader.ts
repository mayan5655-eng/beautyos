// app/dashboard/owner/loader.ts
//
// SERVER ONLY. The one place the owner screens read data, behind requirePlatformAdmin(). A non-admin gets the same
// plain 404 as /dashboard/admin, before any service-role query is made.
//
// What is read, exactly:
//   - public.tenants, only the columns in OWNER_TENANT_COLUMNS (name, dates, plan status, signup source);
//   - the public.platform_tenant_metrics() function, projected immediately to business name + last-activity timestamp.
// Never read: clients, appointments, receipts, leads, messages, emails, phone numbers. test-owner-control.ts pins this.
import { notFound } from 'next/navigation'
import { requirePlatformAdmin, createAdminClient } from '@/lib/adminGuard'
import { createClient as createSessionClient } from '@/lib/supabase/server'
import { OWNER_TENANT_COLUMNS, realTenants, activityRows, newestSignups } from '@/lib/ownerControl'
import type { OwnerTenant, ActivityRow, NewestSignup } from '@/lib/ownerControl'
import { loadContactLinks } from './signups/contacts'
import type { ContactLink } from '@/lib/ownerContact'

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
 * The signups screen: every real business, the 20 newest, and a contact link for those 20 where one can be built. The links are built
 * here, on the server, after requirePlatformAdmin() (inside requireOwner); a non-admin gets the 404 before anything is read.
 */
export async function loadSignupsPage(): Promise<{ ok: true; rows: OwnerTenant[]; newest: NewestSignup[]; contacts: Record<string, ContactLink> } | { ok: false }> {
  const { db, ownTenantId } = await requireOwner()
  const rows = await readTenants(db, ownTenantId)
  if (!rows) return { ok: false }
  const newest = newestSignups(rows, 20)
  const contacts = await loadContactLinks(db, newest, ownTenantId)
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
