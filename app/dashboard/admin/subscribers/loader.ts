// app/dashboard/admin/subscribers/loader.ts
//
// SERVER ONLY. The subscribers screen's data, behind requirePlatformAdmin(): a non-admin gets the same plain 404 as
// /dashboard/admin before any service-role query is made. What is read, and what never is, is documented in
// lib/subscribersData.ts (shared with the owner's morning digest).
//
// Contact details leave the server only inside the page rendered for a platform admin. Nothing is sent: the links open HER
// WhatsApp, phone or mail app.
import { notFound } from 'next/navigation'
import { requirePlatformAdmin, createAdminClient } from '@/lib/adminGuard'
import { createClient as createSessionClient } from '@/lib/supabase/server'
import { readSubscriberRows } from '@/lib/subscribersData'
import { sortSubscribers } from '@/lib/subscribers'
import type { SubscriberRow } from '@/lib/subscribers'

export type SubscribersPage =
  | { ok: true; rows: SubscriberRow[]; notesAvailable: boolean; metricsAvailable: boolean; now: string }
  | { ok: false }

export async function loadSubscribers(): Promise<SubscribersPage> {
  const admin = await requirePlatformAdmin()
  if (!admin.ok) notFound()
  const db = createAdminClient()

  // Her own business is not a signup (and is never contacted from here). Read on the session client, like the admin page.
  let ownTenantId: string | null = null
  try {
    const session = await createSessionClient()
    const { data } = await session.rpc('get_user_tenant_id')
    ownTenantId = typeof data === 'string' ? data : null
  } catch { /* the list then simply includes it */ }

  const now = new Date()
  const r = await readSubscriberRows(db, ownTenantId ? [ownTenantId] : [], now)
  if (!r.ok) return { ok: false }
  return { ok: true, rows: sortSubscribers(r.rows, now), notesAvailable: r.notesAvailable, metricsAvailable: r.metricsAvailable, now: now.toISOString() }
}
