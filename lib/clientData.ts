// lib/clientData.ts
//
// A client's data, out and gone: the two things Israel's privacy law lets a person ask for (a copy of what is held about her, and
// erasure), done for real and scoped to ONE business.
//
//   exportClientData  -> everything held about one client in one business, as an object (and a CSV for people who open it in Excel)
//   eraseClientData   -> removes her personal data; keeps what the business is legally bound to keep, without her identity
//
// What "erase" means here, table by table (the reasoning is the point, so it is written down):
//   deleted outright   health declarations, skin scans, photos (rows and files), reviews, reminder log, her WhatsApp messages, waitlist,
//                      her leads and slot offers, the owner's notifications about her bookings, then the client card itself
//   anonymised         appointments and payment records (receipts, packages): a business must keep its accounting records for years,
//                      so the amounts and dates stay, but the name, phone, note and the link to her card are removed
//   NOT covered        published before/after results (treatment_results has no link to a client in the database): the result says so
//
// The business is always the one named by the caller (taken from the signed-in session by the route, never from the request body), and
// every query carries tenant_id. Nothing here talks to another business's rows.
//
// HONEST, NOT HOPEFUL: only a table that does not exist on this install may be skipped. A column that does not exist (a wrong name, a
// stale schema) is a FAILURE, because that is exactly how a delete quietly does nothing: the first version of this file filtered the
// message log by a column called `phone` that is really `recipient_phone`, reported "skipped", and deleted the card with every message
// still in the database. If any step fails the client card is NOT deleted and the result says so, so the owner can run it again.

import { createHash } from 'node:crypto'
import { normalizeIsraeliMobile } from './phone.ts'

/** The slice of the Supabase client this uses, so tests can pass a fake. */
export type Db = { from: (table: string) => any; storage: { from: (bucket: string) => any } }

export const ANONYMOUS_NAME_HE = 'לקוחה שנמחקה'
const PRIVATE_BUCKET = 'client-images'

type Step = { table: string; action: 'deleted' | 'anonymised' | 'skipped' | 'none' | 'failed'; count?: number; note?: string }
export type EraseResult = { ok: boolean; steps: Step[]; error?: string }
export type ClientExport = { exportedAt: string; businessId: string; client: Record<string, unknown>; sections: Record<string, Record<string, unknown>[]>; notes: string[] }
type Err = { code?: string; message?: string } | null | undefined

/** The TABLE is not on this install (a migration that was never run). The only thing that may be skipped. */
export const isTableMissing = (e: Err): boolean => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /relation .* does not exist|Could not find the table/i.test(e.message || ''))
/** A COLUMN is not there: a bug or a stale schema, never to be shrugged off. */
export const isColumnMissing = (e: Err): boolean => !!e && (e.code === '42703' || e.code === 'PGRST204' || /column .* does not exist|Could not find the '.*' column/i.test(e.message || ''))

/** The kept record that a number asked to stop receiving marketing, once her card is gone: a hash, never the number (marketing_suppressions, add_audit_hardening SQL). */
export const suppressionHash = (tenantId: string, e164: string): string => createHash('sha256').update(`${tenantId}:${e164}`).digest('hex')

/** Every shape a phone number may be stored in, for the tables that keep only a phone. */
export function phoneVariants(raw: unknown): string[] {
  const r = normalizeIsraeliMobile(String(raw ?? ''))
  if (!r.ok) return []
  const e164 = r.e164
  const local = '0' + e164.slice(3)
  const dashed = `${local.slice(0, 3)}-${local.slice(3)}`
  const dashed3 = `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`
  return [...new Set([e164, local, '+' + e164, dashed, dashed3, String(raw).trim()])].filter(Boolean)
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
  ['auto_reminders_log', 'automatic_reminders'],
  ['leads', 'leads'],
  ['slot_offers', 'slot_offers'],
]
/** Tables that hold only a phone, with the column it is in. */
const BY_PHONE: Array<[string, string, string]> = [
  ['whatsapp_messages', 'recipient_phone', 'whatsapp_messages'],
  ['waitlist', 'phone', 'waitlist'],
  ['leads', 'phone', 'leads_by_phone'],
]

/** Another card in the same business with the same phone: then the phone is not ONLY hers, and phone-based deletes must not run. */
async function phoneShared(db: Db, tenantId: string, clientId: string, phones: string[]): Promise<boolean> {
  if (!phones.length) return false
  const { data, error } = await db.from('clients').select('id').eq('tenant_id', tenantId).in('phone', phones).neq('id', clientId)
  if (error) return true // cannot tell: be careful, do not delete by phone
  return (data || []).length > 0
}

export async function exportClientData(db: Db, tenantId: string, clientId: string): Promise<{ ok: true; data: ClientExport } | { ok: false; status: number; error: string }> {
  const { data: client, error } = await db.from('clients').select('*').eq('tenant_id', tenantId).eq('id', clientId).maybeSingle()
  if (error && !isTableMissing(error)) return { ok: false, status: 500, error: 'read failed' }
  if (!client) return { ok: false, status: 404, error: 'not found' }

  const sections: Record<string, Record<string, unknown>[]> = {}
  const notes: string[] = []
  const read = async (heading: string, q: Promise<{ data: any[] | null; error: Err }>) => {
    const { data, error: e } = await q
    if (e) { if (!isTableMissing(e)) notes.push(`${heading}: could not be read`); return }
    sections[heading] = (data || []).map(scrub)
  }
  for (const [table, heading] of BY_CLIENT_ID) await read(heading, db.from(table).select('*').eq('tenant_id', tenantId).eq('client_id', clientId))

  const phones = phoneVariants((client as Record<string, unknown>).phone)
  if (phones.length) {
    for (const [table, col, heading] of BY_PHONE) await read(heading, db.from(table).select('*').eq('tenant_id', tenantId).in(col, phones))
    // the owner's own copy of messages about her (notifications and the log of messages sent to the owner) quote her name and phone
    await read('messages_to_owner_about_her', db.from('whatsapp_messages').select('*').eq('tenant_id', tenantId).or(phones.map((p) => `message_body.ilike.%${p}%`).join(',')))
  }
  const apptIds = (sections.appointments || []).map((a) => a.id).filter(Boolean)
  if (apptIds.length) await read('owner_notifications', db.from('owner_notifications').select('*').eq('tenant_id', tenantId).in('appointment_id', apptIds))
  const receiptIds = (sections.payments || []).map((r) => r.id).filter(Boolean)
  if (receiptIds.length) await read('payment_cancellations', db.from('receipt_voids').select('*').eq('tenant_id', tenantId).in('receipt_id', receiptIds))
  notes.push('treatment_results: published before/after results are not linked to a client in the database, so they are not included')
  return { ok: true, data: { exportedAt: new Date().toISOString(), businessId: tenantId, client: scrub(client as Record<string, unknown>), sections, notes } }
}

// ── CSV: one file a person can open in Excel. Sections one after another, each with its own header row. ──
const csvCell = (v: unknown): string => {
  let t = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
  // a value that starts like a formula would run in Excel (names come from a public form)
  // (a phone written as +9725... is not a formula: it keeps its plus sign)
  if (typeof v !== 'number' && !/^\+?\d[\d\s-]*$/.test(t) && /^[=+\-@|\t\r\n]/.test(t)) t = "'" + t
  return `"${t.replace(/"/g, '""')}"`
}
const SECTION_TITLES_HE: Record<string, string> = {
  appointments: 'תורים', payments: 'תשלומים', forms: 'טפסים', skin_scans: 'סריקות עור', photos: 'תמונות', packages: 'חבילות', reviews: 'ביקורות',
  automatic_reminders: 'תזכורות אוטומטיות', leads: 'פניות', leads_by_phone: 'פניות לפי טלפון', slot_offers: 'הצעות לתורים שהתפנו', whatsapp_messages: 'הודעות וואטסאפ',
  waitlist: 'רשימת המתנה', payment_cancellations: 'ביטולי תשלום', owner_notifications: 'התראות לבעלת העסק', messages_to_owner_about_her: 'הודעות לבעלת העסק עליה',
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
  if (data.notes.length) { out.push(''); for (const n of data.notes) out.push(csvCell(n)) }
  return '﻿' + out.join('\r\n') + '\r\n'
}

/** Every object under a folder, however deep and however many: list is one level and one page at a time. Returns the paths and whether it could read them all. */
async function listAllFiles(bucket: any, folder: string, depth = 0): Promise<{ paths: string[]; ok: boolean }> {
  const paths: string[] = []
  let ok = true
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await bucket.list(folder, { limit: 100, offset })
    if (error) return { paths, ok: false }
    const entries: Array<{ name: string; id?: string | null }> = data || []
    for (const f of entries) {
      if (f.id === null || f.id === undefined) {
        // a sub-folder has no id: remove what is inside it
        if (depth < 4) { const sub = await listAllFiles(bucket, `${folder}/${f.name}`, depth + 1); paths.push(...sub.paths); ok = ok && sub.ok } else ok = false
      } else paths.push(`${folder}/${f.name}`)
    }
    if (entries.length < 100) break
  }
  return { paths, ok }
}

export async function eraseClientData(db: Db, tenantId: string, clientId: string): Promise<EraseResult> {
  const steps: Step[] = []
  const { data: client, error } = await db.from('clients').select('id, name, phone').eq('tenant_id', tenantId).eq('id', clientId).maybeSingle()
  if (error) return { ok: false, steps, error: 'read failed' }
  if (!client) return { ok: false, steps, error: 'not found' }
  const variants = phoneVariants((client as { phone?: unknown }).phone)
  const shared = await phoneShared(db, tenantId, clientId, variants)
  const phones = shared ? [] : variants // a phone two cards share is not erased by phone: it would take the other card's rows too
  if (shared) steps.push({ table: 'phone-based tables', action: 'skipped', note: 'another card in this business has the same phone' })
  let failed = false

  // her appointments (by link, and the old online bookings that never got one: by phone)
  const apptIds: string[] = []
  {
    const byLink = await db.from('appointments').select('id').eq('tenant_id', tenantId).eq('client_id', clientId)
    if (byLink.error) { failed = true; steps.push({ table: 'appointments', action: 'failed', note: 'read' }) } else apptIds.push(...(byLink.data || []).map((a: { id: string }) => a.id))
    if (phones.length) {
      const byPhone = await db.from('appointments').select('id').eq('tenant_id', tenantId).is('client_id', null).in('client_phone', phones)
      if (!byPhone.error) apptIds.push(...(byPhone.data || []).map((a: { id: string }) => a.id))
    }
  }

  // 1. private files under her own folder, every level, every page
  try {
    const folder = `${tenantId}/clients/${clientId}`
    const bucket = db.storage.from(PRIVATE_BUCKET)
    const { paths, ok } = await listAllFiles(bucket, folder)
    let removedOk = true
    for (let i = 0; i < paths.length; i += 100) { const { error: re } = await bucket.remove(paths.slice(i, i + 100)); if (re) removedOk = false }
    if (!ok || !removedOk) { failed = true; steps.push({ table: 'files', action: 'failed' }) } else steps.push({ table: 'files', action: paths.length ? 'deleted' : 'none', count: paths.length })
  } catch { failed = true; steps.push({ table: 'files', action: 'failed' }) }

  // The tables are independent of each other, so they are cleaned in parallel. Steps are reported in a fixed order.
  const jobs: Array<Promise<Step>> = []
  const run = (table: string, action: 'deleted' | 'anonymised', op: () => Promise<{ error: any; count?: number | null; data?: any[] | null }>) => {
    jobs.push(op().then((r): Step => {
      if (r.error) {
        if (isTableMissing(r.error)) return { table, action: 'skipped', note: 'table not on this install' }
        failed = true
        return { table, action: 'failed', note: isColumnMissing(r.error) ? 'column missing' : String(r.error.code || 'error') }
      }
      const n = Array.isArray(r.data) ? r.data.length : (r.count ?? undefined)
      return { table, action: n === 0 ? 'none' : action, count: n }
    }))
  }

  // 2. deleted outright
  for (const table of ['forms', 'skin_scans', 'client_photos', 'reviews', 'auto_reminders_log', 'leads', 'slot_offers']) {
    run(table, 'deleted', () => db.from(table).delete().eq('tenant_id', tenantId).eq('client_id', clientId).select('id'))
  }
  if (phones.length) {
    for (const [table, col] of BY_PHONE) run(`${table} (by phone)`, 'deleted', () => db.from(table).delete().eq('tenant_id', tenantId).in(col, phones).select('id'))
    run('slot_offers (by phone)', 'deleted', () => db.from('slot_offers').delete().eq('tenant_id', tenantId).in('phone', phones).select('id'))
    // the owner's copies: the log of messages sent to HER about this client quotes the name and phone
    run('messages to the owner', 'deleted', () => db.from('whatsapp_messages').delete().eq('tenant_id', tenantId).or(phones.map((p) => `message_body.ilike.%${p}%`).join(',')).select('id'))
  }
  if (apptIds.length) run('owner_notifications', 'deleted', () => db.from('owner_notifications').delete().eq('tenant_id', tenantId).in('appointment_id', apptIds).select('id'))

  // 3. kept for the books, without her identity
  const scrubAppt = { client_id: null, name: ANONYMOUS_NAME_HE, client_phone: null, note: null }
  run('appointments', 'anonymised', () => db.from('appointments').update(scrubAppt).eq('tenant_id', tenantId).eq('client_id', clientId).select('id'))
  if (phones.length) run('appointments (old bookings by phone)', 'anonymised', () => db.from('appointments').update(scrubAppt).eq('tenant_id', tenantId).is('client_id', null).in('client_phone', phones).select('id'))
  run('receipts', 'anonymised', () => db.from('receipts').update({ client_id: null, client_name: ANONYMOUS_NAME_HE, note: null }).eq('tenant_id', tenantId).eq('client_id', clientId).select('id'))
  run('packages', 'anonymised', () => db.from('packages').update({ client_id: null, client_name: ANONYMOUS_NAME_HE }).eq('tenant_id', tenantId).eq('client_id', clientId).select('id'))
  run('grow_payments', 'anonymised', () => db.from('grow_payments').update({ client_id: null, client_name: ANONYMOUS_NAME_HE }).eq('tenant_id', tenantId).eq('client_id', clientId).select('id'))
  steps.push(...(await Promise.all(jobs)))
  // the database cannot link published before/after results to a client, so they are not touched: said plainly in the result
  steps.push({ table: 'treatment_results', action: 'skipped', note: 'not linked to a client in the database; remove published results in the results screen' })

  // 3b. someone who asked to stop messages must not become messageable again because her card is gone: keep a hash of the number, not the number
  try {
    const opt = await db.from('clients').select('marketing_opted_out_at').eq('tenant_id', tenantId).eq('id', clientId).maybeSingle()
    const e164 = normalizeIsraeliMobile(String((client as { phone?: unknown }).phone ?? ''))
    if (!opt.error && opt.data?.marketing_opted_out_at && e164.ok) {
      const up = await db.from('marketing_suppressions').upsert({ tenant_id: tenantId, phone_hash: suppressionHash(tenantId, e164.e164) })
      steps.push(up.error ? { table: 'marketing_suppressions', action: isTableMissing(up.error) ? 'skipped' : 'failed', note: 'opt-out record' } : { table: 'marketing_suppressions', action: 'anonymised', note: 'hash kept so she is not messaged again' })
      if (up.error && !isTableMissing(up.error)) failed = true
    }
  } catch { /* the column or table may not exist on this install: nothing to keep */ }

  // 4. the card itself, only if nothing above failed
  if (failed) return { ok: false, steps, error: 'some steps failed; the client card was kept so this can be run again' }
  const del = await db.from('clients').delete().eq('tenant_id', tenantId).eq('id', clientId).select('id')
  if (del.error) { steps.push({ table: 'clients', action: 'failed', note: String(del.error.code || 'error') }); return { ok: false, steps, error: 'the client card could not be deleted' } }
  steps.push({ table: 'clients', action: 'deleted', count: Array.isArray(del.data) ? del.data.length : 1 })
  // a booking that arrived while this ran can point at the card that was just deleted: one more idempotent pass over what was found
  if (apptIds.length) await db.from('appointments').update(scrubAppt).eq('tenant_id', tenantId).in('id', apptIds)
  return { ok: true, steps }
}
