// lib/clientData.ts
//
// A client's data, out and gone: the two things Israel's privacy law lets a person ask for (a copy of what is held about her, and
// erasure), done for real and scoped to ONE business.
//
//   exportClientData  -> everything held about one client in one business, as an object (and a CSV for people who open it in Excel)
//   eraseClientData   -> removes her personal data; keeps what the business is legally bound to keep, without her identity
//
// What "erase" means here, table by table (the reasoning is the point, so it is written down):
//   deleted outright   health declarations, skin scans, photos (rows and files), reviews, reminder log, WhatsApp log, waitlist,
//                      treatment results, then the client card itself
//   anonymised         appointments and payment records (receipts, packages): a business must keep its accounting records for years,
//                      so the amounts and dates stay, but the name, phone, note and the link to her card are removed
//
// The business is always the one named by the caller (taken from the signed-in session by the route, never from the request body), and
// every query carries tenant_id. Nothing here talks to another business's rows.
//
// Idempotent and honest: each step reports what it did. If any step fails for a reason other than "that table or column does not exist
// on this install", the client card is NOT deleted and the result says so, so the owner can run it again instead of being told it is done.

import { normalizeIsraeliMobile } from './phone.ts'

/** The slice of the Supabase client this uses, so tests can pass a fake. */
export type Db = { from: (table: string) => any; storage: { from: (bucket: string) => any } }

export const ANONYMOUS_NAME_HE = 'לקוחה שנמחקה'
const PRIVATE_BUCKET = 'client-images'

type Step = { table: string; action: 'deleted' | 'anonymised' | 'skipped' | 'none' | 'failed'; count?: number; note?: string }
export type EraseResult = { ok: boolean; steps: Step[]; error?: string }
export type ClientExport = { exportedAt: string; businessId: string; client: Record<string, unknown>; sections: Record<string, Record<string, unknown>[]>; notes: string[] }

// A table or a column that this install does not have (a migration that has not run) is not a failure of the request.
const isMissing = (e: { code?: string; message?: string } | null | undefined): boolean =>
  !!e && (e.code === '42P01' || e.code === '42703' || e.code === 'PGRST204' || e.code === 'PGRST205' || /does not exist|schema cache|Could not find/i.test(e.message || ''))

/** Every shape a phone number may be stored in, for the tables that keep only a phone. */
export function phoneVariants(raw: unknown): string[] {
  const r = normalizeIsraeliMobile(String(raw ?? ''))
  if (!r.ok) return []
  const e164 = r.e164
  return [...new Set([e164, '0' + e164.slice(3), '+' + e164, String(raw).trim()])].filter(Boolean)
}

const SECRET_KEY = /token|secret|password|api_key|hash/i
function scrub(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) if (!SECRET_KEY.test(k)) out[k] = v
  return out
}

/** Tables read by client_id, and the heading each gets in the export. */
const BY_CLIENT_ID: Array<[string, string]> = [
  ['appointments', 'appointments'],
  ['receipts', 'payments'],
  ['forms', 'forms'],
  ['skin_scans', 'skin_scans'],
  ['client_photos', 'photos'],
  ['packages', 'packages'],
  ['reviews', 'reviews'],
  ['treatment_results', 'treatment_results'],
  ['auto_reminders_log', 'automatic_reminders'],
]

export async function exportClientData(db: Db, tenantId: string, clientId: string): Promise<{ ok: true; data: ClientExport } | { ok: false; status: number; error: string }> {
  const { data: client, error } = await db.from('clients').select('*').eq('tenant_id', tenantId).eq('id', clientId).maybeSingle()
  if (error && !isMissing(error)) return { ok: false, status: 500, error: 'read failed' }
  if (!client) return { ok: false, status: 404, error: 'not found' }

  const sections: Record<string, Record<string, unknown>[]> = {}
  const notes: string[] = []
  for (const [table, heading] of BY_CLIENT_ID) {
    const { data, error: e } = await db.from(table).select('*').eq('tenant_id', tenantId).eq('client_id', clientId)
    if (e) { if (!isMissing(e)) notes.push(`${heading}: could not be read`); continue }
    sections[heading] = (data || []).map(scrub)
  }
  const phones = phoneVariants((client as Record<string, unknown>).phone)
  if (phones.length) {
    for (const [table, heading] of [['whatsapp_messages', 'whatsapp_messages'], ['waitlist', 'waitlist']] as const) {
      const { data, error: e } = await db.from(table).select('*').eq('tenant_id', tenantId).in('phone', phones)
      if (e) { if (!isMissing(e)) notes.push(`${heading}: could not be read`); continue }
      sections[heading] = (data || []).map(scrub)
    }
  }
  // payment records that were voided
  const receiptIds = (sections.payments || []).map((r) => r.id).filter(Boolean)
  if (receiptIds.length) {
    const { data, error: e } = await db.from('receipt_voids').select('*').eq('tenant_id', tenantId).in('receipt_id', receiptIds)
    if (!e) sections.payment_cancellations = (data || []).map(scrub)
  }
  return { ok: true, data: { exportedAt: new Date().toISOString(), businessId: tenantId, client: scrub(client as Record<string, unknown>), sections, notes } }
}

// ── CSV: one file a person can open in Excel. Sections one after another, each with its own header row. ──
const csvCell = (v: unknown): string => {
  let t = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
  // a value that starts like a formula would run in Excel (names come from a public form)
  if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(t)) t = "'" + t
  return `"${t.replace(/"/g, '""')}"`
}
const SECTION_TITLES_HE: Record<string, string> = {
  appointments: 'תורים', payments: 'תשלומים', forms: 'טפסים', skin_scans: 'סריקות עור', photos: 'תמונות', packages: 'חבילות', reviews: 'ביקורות',
  treatment_results: 'תוצאות טיפול', automatic_reminders: 'תזכורות אוטומטיות', whatsapp_messages: 'הודעות וואטסאפ', waitlist: 'רשימת המתנה', payment_cancellations: 'ביטולי תשלום',
}
export function exportToCsv(data: ClientExport): string {
  const out: string[] = []
  out.push(csvCell('לקוחה'))
  out.push(['שדה', 'ערך'].map(csvCell).join(','))
  for (const [k, v] of Object.entries(data.client)) out.push([k, v].map(csvCell).join(','))
  for (const [heading, rows] of Object.entries(data.sections)) {
    out.push('')
    out.push(csvCell(`${SECTION_TITLES_HE[heading] || heading} (${rows.length})`))
    if (!rows.length) continue
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))]
    out.push(cols.map(csvCell).join(','))
    for (const r of rows) out.push(cols.map((c) => csvCell(r[c])).join(','))
  }
  return '﻿' + out.join('\r\n') + '\r\n'
}

export async function eraseClientData(db: Db, tenantId: string, clientId: string): Promise<EraseResult> {
  const steps: Step[] = []
  const { data: client, error } = await db.from('clients').select('id, name, phone').eq('tenant_id', tenantId).eq('id', clientId).maybeSingle()
  if (error && !isMissing(error)) return { ok: false, steps, error: 'read failed' }
  if (!client) return { ok: false, steps, error: 'not found' }
  const phones = phoneVariants((client as { phone?: unknown }).phone)
  let failed = false

  const run = async (table: string, action: 'deleted' | 'anonymised', op: () => Promise<{ error: any; count?: number | null; data?: any[] | null }>) => {
    const r = await op()
    if (r.error) {
      if (isMissing(r.error)) steps.push({ table, action: 'skipped', note: 'not on this install' })
      else { failed = true; steps.push({ table, action: 'failed', note: String(r.error.code || 'error') }) }
      return
    }
    const n = Array.isArray(r.data) ? r.data.length : (r.count ?? undefined)
    steps.push({ table, action: n === 0 ? 'none' : action, count: n })
  }

  // 1. private files (photos, scan images) under this client's own folder
  try {
    const folder = `${tenantId}/clients/${clientId}`
    const bucket = db.storage.from(PRIVATE_BUCKET)
    const { data: files, error: le } = await bucket.list(folder, { limit: 1000 })
    if (le) { steps.push({ table: 'files', action: 'skipped', note: 'could not list' }); failed = failed || !isMissing(le) }
    else if (files && files.length) {
      const { error: re } = await bucket.remove(files.map((f: { name: string }) => `${folder}/${f.name}`))
      if (re) { failed = true; steps.push({ table: 'files', action: 'failed' }) } else steps.push({ table: 'files', action: 'deleted', count: files.length })
    } else steps.push({ table: 'files', action: 'none', count: 0 })
  } catch { failed = true; steps.push({ table: 'files', action: 'failed' }) }

  // 2. deleted outright (every query: this business, this client)
  for (const table of ['forms', 'skin_scans', 'client_photos', 'reviews', 'treatment_results', 'auto_reminders_log']) {
    await run(table, 'deleted', () => db.from(table).delete().eq('tenant_id', tenantId).eq('client_id', clientId).select('id'))
  }
  if (phones.length) {
    for (const table of ['whatsapp_messages', 'waitlist']) {
      await run(table, 'deleted', () => db.from(table).delete().eq('tenant_id', tenantId).in('phone', phones).select('id'))
    }
  }

  // 3. kept for the books, without her identity
  await run('appointments', 'anonymised', () =>
    db.from('appointments').update({ client_id: null, name: ANONYMOUS_NAME_HE, client_phone: null, note: null }).eq('tenant_id', tenantId).eq('client_id', clientId).select('id'))
  await run('receipts', 'anonymised', () =>
    db.from('receipts').update({ client_id: null, client_name: ANONYMOUS_NAME_HE }).eq('tenant_id', tenantId).eq('client_id', clientId).select('id'))
  await run('packages', 'anonymised', () =>
    db.from('packages').update({ client_id: null, client_name: ANONYMOUS_NAME_HE }).eq('tenant_id', tenantId).eq('client_id', clientId).select('id'))

  // 4. the card itself, only if nothing above failed
  if (failed) return { ok: false, steps, error: 'some steps failed; the client card was kept so this can be run again' }
  const del = await db.from('clients').delete().eq('tenant_id', tenantId).eq('id', clientId).select('id')
  if (del.error) { steps.push({ table: 'clients', action: 'failed', note: String(del.error.code || 'error') }); return { ok: false, steps, error: 'the client card could not be deleted' } }
  steps.push({ table: 'clients', action: 'deleted', count: Array.isArray(del.data) ? del.data.length : 1 })
  return { ok: true, steps }
}
