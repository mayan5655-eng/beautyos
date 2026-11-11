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
import { isProspectStatus, isTreatment, isSource, isChannel, isMissingProspectsTable, isMissingEnrichColumns, isCurrentSystem, isFollowupDate, FOLLOWERS_MAX } from './prospects.ts'
import type { Prospect } from './prospects.ts'

type Db = SupabaseClient

export const PROSPECT_COLUMNS = 'id, name, phone_e164, instagram, city, treatment, source, notes, status, last_contacted_at, last_channel, contact_count, created_at'

/** Added by add_prospects_enrich_2026-11-11.sql. Read (and written) only once that file ran: see probeEnrichColumns. */
export const ENRICH_COLUMNS = 'followers, current_system, next_followup'
export const PROSPECT_COLUMNS_ENRICHED = `${PROSPECT_COLUMNS}, ${ENRICH_COLUMNS}`
export const prospectColumns = (enriched: boolean): string => (enriched ? PROSPECT_COLUMNS_ENRICHED : PROSPECT_COLUMNS)

export type ProspectDbRow = {
  id: string; name: string; phone_e164: string | null; instagram: string | null; city: string | null; treatment: string
  source: string; notes: string | null; status: string; last_contacted_at: string | null; last_channel?: string | null; contact_count: number | null; created_at: string
  followers?: number | null; current_system?: string | null; next_followup?: string | null
}

export function toProspect(r: ProspectDbRow, signedUpPhones: Set<string>): Prospect {
  return {
    id: r.id, name: r.name, phone: r.phone_e164, instagram: r.instagram, city: r.city,
    treatment: isTreatment(r.treatment) ? r.treatment : 'other',
    source: isSource(r.source) ? r.source : 'whatsapp',
    notes: r.notes || '',
    status: isProspectStatus(r.status) ? r.status : 'new',
    lastContactedAt: r.last_contacted_at, lastChannel: isChannel(r.last_channel) ? r.last_channel : null, contactCount: r.contact_count || 0, createdAt: r.created_at,
    signedUp: !!r.phone_e164 && signedUpPhones.has(r.phone_e164),
    followers: typeof r.followers === 'number' && r.followers >= 0 && r.followers <= FOLLOWERS_MAX ? r.followers : null,
    currentSystem: isCurrentSystem(r.current_system) ? r.current_system : 'unknown',
    nextFollowup: isFollowupDate(r.next_followup) ? r.next_followup : null,
  }
}

/**
 * Whether the enrich columns exist. A cheap read of one column; true / false, or null when the read failed for another reason
 * (the caller then treats the fields as unavailable and writes none of them).
 */
export async function probeEnrichColumns(db: Db): Promise<boolean | null> {
  const res = await db.from('prospects').select(ENRICH_COLUMNS).limit(1)
  if (!res.error) return true
  if (isMissingEnrichColumns(res.error)) return false
  if (isMissingProspectsTable(res.error)) return null
  console.error('[prospects] enrich probe failed:', res.error.message)
  return null
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

export type ProspectsRead =
  | { ok: true; available: true; enriched: boolean; rows: Prospect[] }
  | { ok: true; available: false; enriched: false; rows: [] }
  | { ok: false }

/** Reads with the enrich columns; when they are missing (that SQL file has not run) reads again without them. */
export async function readProspects(db: Db): Promise<ProspectsRead> {
  const read = (cols: string) => db.from('prospects').select(cols).order('created_at', { ascending: true }).limit(5000)
  let enriched = true
  let res = await read(PROSPECT_COLUMNS_ENRICHED)
  if (res.error && isMissingEnrichColumns(res.error)) {
    enriched = false
    res = await read(PROSPECT_COLUMNS)
  }
  if (res.error) {
    if (isMissingProspectsTable(res.error)) return { ok: true, available: false, enriched: false, rows: [] }
    console.error('[prospects] read failed:', res.error.message)
    return { ok: false }
  }
  const phones = await readSignedUpPhones(db)
  return { ok: true, available: true, enriched, rows: ((res.data || []) as unknown as ProspectDbRow[]).map((r) => toProspect(r, phones)) }
}
