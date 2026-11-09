// app/api/admin/prospects/route.ts
// The owner's outreach list (/dashboard/admin/outreach): add prospects (one or a pasted batch), change a status or a note, and
// record that she messaged one.
//
// SECURITY MODEL: the same as /api/admin/tenant-contact. requirePlatformAdmin() first, on every request; a non-admin gets 404.
// Writes go through the service role: public.prospects is RLS deny-all with no browser grants
// (supabase/migrations/add_prospects_2026-11-09.sql).
//
// It writes only that table and never deletes. IT NEVER SENDS A MESSAGE: "sent" only records that she opened WhatsApp (or
// Instagram) on her own phone. A prospect who declined or asked to stop is refused here too, not only hidden in the screen.

import { NextResponse } from 'next/server'
import { requirePlatformAdmin, createAdminClient } from '@/lib/adminGuard'
import {
  cleanProspectInput, dedupeAgainst, isProspectStatus, canSend, statusAfterSend, isMissingProspectsTable,
  ADD_MAX, NOTES_MAX, MIGRATION_NEEDED_HE, isTreatment,
} from '@/lib/prospects'
import type { ProspectInput } from '@/lib/prospects'
import { PROSPECT_COLUMNS, readSignedUpPhones, toProspect } from '@/lib/prospectsData'
import type { ProspectDbRow } from '@/lib/prospectsData'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function notFound() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}

function dbError(e: { code?: string; message?: string }, what: string) {
  if (isMissingProspectsTable(e)) return NextResponse.json({ error: MIGRATION_NEEDED_HE, migrationNeeded: true }, { status: 503 })
  console.error(`[admin/prospects] ${what} failed:`, e.message)
  return NextResponse.json({ error: 'השמירה נכשלה, אפשר לנסות שוב' }, { status: 500 })
}

export async function POST(request: Request) {
  const admin = await requirePlatformAdmin()
  if (!admin.ok) return notFound()

  const body = await request.json().catch(() => ({}))
  const action = body?.action
  const db = createAdminClient()

  // ── add one or many ────────────────────────────────────────────────────────
  if (action === 'add') {
    const list: unknown[] = Array.isArray(body?.prospects) ? body.prospects : []
    if (list.length === 0) return NextResponse.json({ error: 'אין מה להוסיף' }, { status: 400 })
    if (list.length > ADD_MAX) return NextResponse.json({ error: `אפשר להוסיף עד ${ADD_MAX} בפעם אחת` }, { status: 400 })
    const valid: ProspectInput[] = []
    const invalid: Array<{ name: string; error: string }> = []
    for (const raw of list) {
      const r = cleanProspectInput((raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>)
      if (r.ok) valid.push(r.value)
      else invalid.push({ name: String((raw as { name?: unknown })?.name ?? '').slice(0, 80), error: r.error })
    }
    const phones = valid.map((v) => v.phone).filter((p): p is string => !!p)
    const handles = valid.map((v) => v.instagram).filter((h): h is string => !!h)
    const [byPhone, byHandle] = await Promise.all([
      phones.length ? db.from('prospects').select('phone_e164').in('phone_e164', phones) : Promise.resolve({ data: [], error: null }),
      handles.length ? db.from('prospects').select('instagram').in('instagram', handles) : Promise.resolve({ data: [], error: null }),
    ])
    if (byPhone.error) return dbError(byPhone.error, 'duplicate check')
    if (byHandle.error) return dbError(byHandle.error, 'duplicate check')
    const { fresh, duplicates } = dedupeAgainst(
      valid,
      ((byPhone.data || []) as Array<{ phone_e164: string }>).map((r) => r.phone_e164),
      ((byHandle.data || []) as Array<{ instagram: string }>).map((r) => r.instagram),
    )
    let added: ProspectDbRow[] = []
    if (fresh.length) {
      const now = new Date().toISOString()
      const { data, error } = await db.from('prospects').insert(fresh.map((v) => ({
        name: v.name, phone_e164: v.phone, instagram: v.instagram, city: v.city, treatment: v.treatment, source: v.source,
        notes: v.notes, status: 'new', created_at: now, updated_at: now, created_by: admin.userId,
      }))).select(PROSPECT_COLUMNS)
      if (error) return dbError(error, 'insert')
      added = (data || []) as ProspectDbRow[]
    }
    const signed = await readSignedUpPhones(db)
    return NextResponse.json({
      ok: true,
      added: added.map((r) => toProspect(r, signed)),
      duplicates: duplicates.map((d) => d.name),
      invalid,
    })
  }

  // ── everything else acts on one prospect ───────────────────────────────────
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 })
  const prior = await db.from('prospects').select(PROSPECT_COLUMNS).eq('id', id).maybeSingle()
  if (prior.error) return dbError(prior.error, 'read')
  if (!prior.data) return NextResponse.json({ error: 'לא נמצאה ברשימה' }, { status: 404 })
  const row = prior.data as ProspectDbRow
  const status = isProspectStatus(row.status) ? row.status : 'new'
  const now = new Date().toISOString()

  let patch: Record<string, unknown>
  if (action === 'sent') {
    // The law and her word: whoever declined or asked to stop is never messaged again.
    if (!canSend(status)) return NextResponse.json({ error: 'היא ביקשה לא לקבל הודעות, אז לא שולחים לה שוב.' }, { status: 409 })
    patch = { status: statusAfterSend(status), last_contacted_at: now, contact_count: (row.contact_count || 0) + 1, updated_at: now }
  } else if (action === 'update') {
    patch = { updated_at: now }
    if (body.status !== undefined) {
      if (!isProspectStatus(body.status)) return NextResponse.json({ error: 'סטטוס לא מוכר' }, { status: 400 })
      patch.status = body.status
    }
    if (body.notes !== undefined) {
      const notes = typeof body.notes === 'string' ? body.notes.replace(/\r\n/g, '\n').trim() : ''
      if (notes.length > NOTES_MAX) return NextResponse.json({ error: `ההערה ארוכה מדי (עד ${NOTES_MAX} תווים)` }, { status: 400 })
      patch.notes = notes
    }
    if (body.treatment !== undefined) {
      if (!isTreatment(body.treatment)) return NextResponse.json({ error: 'סוג טיפול לא מוכר' }, { status: 400 })
      patch.treatment = body.treatment
    }
  } else {
    return NextResponse.json({ error: 'פעולה לא מוכרת' }, { status: 400 })
  }

  const { data, error } = await db.from('prospects').update(patch).eq('id', id).select(PROSPECT_COLUMNS).maybeSingle()
  if (error) return dbError(error, 'update')
  if (!data) return NextResponse.json({ error: 'לא נמצאה ברשימה' }, { status: 404 })
  const signed = await readSignedUpPhones(db)
  return NextResponse.json({ ok: true, prospect: toProspect(data as ProspectDbRow, signed) })
}
