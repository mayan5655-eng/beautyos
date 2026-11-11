// app/dashboard/admin/outreach/loader.ts
//
// SERVER ONLY. The outreach screen's data, behind requirePlatformAdmin(): a non-admin gets the same plain 404 as
// /dashboard/admin before any service-role query is made. What is read is documented in lib/prospectsData.ts. Nothing is sent.
import { notFound } from 'next/navigation'
import { requirePlatformAdmin, createAdminClient } from '@/lib/adminGuard'
import { readProspects } from '@/lib/prospectsData'
import { sortProspects } from '@/lib/prospects'
import type { Prospect } from '@/lib/prospects'

export type OutreachPage = { ok: true; available: boolean; enriched: boolean; rows: Prospect[]; now: string } | { ok: false }

export async function loadOutreach(): Promise<OutreachPage> {
  const admin = await requirePlatformAdmin()
  if (!admin.ok) notFound()
  const db = createAdminClient()
  const r = await readProspects(db)
  if (!r.ok) return { ok: false }
  return { ok: true, available: r.available, enriched: r.enriched, rows: sortProspects(r.rows), now: new Date().toISOString() }
}
