// lib/prospectsData.ts
//
// SERVER ONLY. Reads behind the outreach screen, on the service-role client the caller hands in. It does NOT check who is
// asking: both callers (app/dashboard/admin/outreach/loader.ts and app/api/admin/prospects/route.ts) run
// requirePlatformAdmin() first.
//
// What is read: public.prospects (the owner's own list), and, for the read-only "נרשמה" match, the phones of businesses that
// signed up (settings.business_phone, the WhatsApp number in settings.branding, owner_phones.phone_e164). Those phones never
// leave the server: only a yes/no per prospect does. Nothing is written here and nothing is sent.
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeIsraeliMobile } from './phone.ts'
import { isDemoTenantId } from './demoTenants.ts'
import { isProspectStatus, isTreatment, isSource, isMissingProspectsTable } from './prospects.ts'
import type { Prospect } from './prospects.ts'

type Db = SupabaseClient

export const PROSPECT_COLUMNS = 'id, name, phone_e164, instagram, city, treatment, source, notes, status, last_contacted_at, contact_count, created_at'

export type ProspectDbRow = {
  id: string; name: string; phone_e164: string | null; instagram: string | null; city: string | null; treatment: string
  source: string; notes: string | null; status: string; last_contacted_at: string | null; contact_count: number | null; created_at: string
}

export function toProspect(r: ProspectDbRow, signedUpPhones: Set<string>): Prospect {
  return {
    id: r.id, name: r.name, phone: r.phone_e164, instagram: r.instagram, city: r.city,
    treatment: isTreatment(r.treatment) ? r.treatment : 'other',
    source: isSource(r.source) ? r.source : 'whatsapp',
    notes: r.notes || '',
    status: isProspectStatus(r.status) ? r.status : 'new',
    lastContactedAt: r.last_contacted_at, contactCount: r.contact_count || 0, createdAt: r.created_at,
    signedUp: !!r.phone_e164 && signedUpPhones.has(r.phone_e164),
  }
}

/** Every Israeli mobile a real (non-demo) business gave Kalmea. Any read that fails only hides its part of the match. */
export async function readSignedUpPhones(db: Db): Promise<Set<string>> {
  const out = new Set<string>()
  const add = (v: unknown) => { const p = normalizeIsraeliMobile(typeof v === 'string' ? v : ''); if (p.ok) out.add(p.e164) }
  const [settings, owners] = await Promise.all([
    db.from('settings').select('tenant_id, business_phone, wa:branding->>whatsapp_number'),
    db.from('owner_phones').select('tenant_id, phone_e164'),
  ])
  if (settings.error) console.error('[prospects] settings phones unavailable:', settings.error.message)
  if (owners.error) console.error('[prospects] owner_phones unavailable:', owners.error.message)
  for (const s of (settings.data || []) as Array<{ tenant_id: string; business_phone: unknown; wa: unknown }>) {
    if (isDemoTenantId(s.tenant_id)) continue
    add(s.business_phone); add(s.wa)
  }
  for (const o of (owners.data || []) as Array<{ tenant_id: string | null; phone_e164: unknown }>) {
    if (isDemoTenantId(o.tenant_id)) continue
    add(o.phone_e164)
  }
  return out
}

export type ProspectsRead = { ok: true; available: true; rows: Prospect[] } | { ok: true; available: false; rows: [] } | { ok: false }

export async function readProspects(db: Db): Promise<ProspectsRead> {
  const res = await db.from('prospects').select(PROSPECT_COLUMNS).order('created_at', { ascending: true }).limit(5000)
  if (res.error) {
    if (isMissingProspectsTable(res.error)) return { ok: true, available: false, rows: [] }
    console.error('[prospects] read failed:', res.error.message)
    return { ok: false }
  }
  const phones = await readSignedUpPhones(db)
  return { ok: true, available: true, rows: ((res.data || []) as ProspectDbRow[]).map((r) => toProspect(r, phones)) }
}
