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
import type { FeedbackRow } from '@/lib/feedbackBanner'

export type SubscribersPage =
  | { ok: true; rows: SubscriberRow[]; notesAvailable: boolean; metricsAvailable: boolean; feedback: Record<string, FeedbackRow>; feedbackAvailable: boolean; now: string }
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
  // What each business answered in the feedback banner. Until add_product_feedback_2026-10-30.sql runs the list still loads and says so.
  const fb = await db.from('product_feedback').select('tenant_id, rating, answers, free_text, created_at')
  if (fb.error) console.error('[subscribers] product_feedback read failed:', fb.error.message)
  const feedback = Object.fromEntries(((fb.data || []) as FeedbackRow[]).map((row) => [row.tenant_id, row]))
  return { ok: true, rows: sortSubscribers(r.rows, now), notesAvailable: r.notesAvailable, metricsAvailable: r.metricsAvailable, feedback, feedbackAvailable: !fb.error, now: now.toISOString() }
}
