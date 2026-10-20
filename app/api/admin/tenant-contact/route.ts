// app/api/admin/tenant-contact/route.ts
// Saves the platform owner's own follow-up note about one business (/dashboard/admin/subscribers): her status ("contacted",
// "follow up"...), a short note and an optional date to get back to her.
//
// SECURITY MODEL: the same as /api/admin/tenants. requirePlatformAdmin() first, on every request; a non-admin gets 404. The
// tenant comes from the body, which is correct only here, behind that check. Writes go through the service role:
// admin_tenant_contacts is RLS deny-all with no browser grants (supabase/migrations/add_admin_tenant_contacts.sql).
//
// It writes only that table. It never contacts the business and never deletes anything: "not relevant" is a status, not a removal.

import { NextResponse } from 'next/server'
import { requirePlatformAdmin, createAdminClient } from '@/lib/adminGuard'
import { isContactStatus, NOTE_MAX } from '@/lib/subscribers'
import { isDemoTenantId } from '@/lib/demoTenants'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const COLUMNS = 'tenant_id, status, note, follow_up_on, contacted_at, updated_at'

function notFound() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}

/** The table has not been created yet (the SQL file has not run): PostgREST says so with one of these. */
function isMissingTable(e: { code?: string; message?: string } | null): boolean {
  return !!e && (e.code === '42P01' || e.code === 'PGRST205' || /admin_tenant_contacts/.test(e.message || '') && /not exist|schema cache/i.test(e.message || ''))
}

export async function POST(request: Request) {
  const admin = await requirePlatformAdmin()
  if (!admin.ok) return notFound()

  const body = await request.json().catch(() => ({}))
  const tenantId = typeof body?.tenantId === 'string' ? body.tenantId : ''
  const status = body?.status
  const note = typeof body?.note === 'string' ? body.note.replace(/\r\n/g, '\n').trim() : ''
  const followUpRaw = typeof body?.followUpOn === 'string' ? body.followUpOn.trim() : ''

  if (!UUID_RE.test(tenantId) || isDemoTenantId(tenantId)) {
    return NextResponse.json({ error: 'מזהה עסק לא תקין' }, { status: 400 })
  }
  if (!isContactStatus(status)) {
    return NextResponse.json({ error: 'סטטוס לא מוכר' }, { status: 400 })
  }
  if (note.length > NOTE_MAX) {
    return NextResponse.json({ error: `ההערה ארוכה מדי (עד ${NOTE_MAX} תווים)` }, { status: 400 })
  }
  if (followUpRaw && (!DATE_RE.test(followUpRaw) || !Number.isFinite(Date.parse(`${followUpRaw}T00:00:00Z`)))) {
    return NextResponse.json({ error: 'תאריך לא תקין' }, { status: 400 })
  }
  const followUpOn = status === 'follow_up' && followUpRaw ? followUpRaw : null

  const db = createAdminClient()

  const tenant = await db.from('tenants').select('id').eq('id', tenantId).maybeSingle()
  if (tenant.error) {
    console.error('[admin/tenant-contact] tenant read failed:', tenant.error.message)
    return NextResponse.json({ error: 'שגיאה בקריאת העסק' }, { status: 500 })
  }
  if (!tenant.data) return NextResponse.json({ error: 'העסק לא נמצא' }, { status: 404 })

  const prior = await db.from('admin_tenant_contacts').select('contacted_at').eq('tenant_id', tenantId).maybeSingle()
  if (prior.error) {
    if (isMissingTable(prior.error)) {
      return NextResponse.json({ error: 'שמירת הערות עוד לא זמינה: צריך להריץ את קובץ ה-SQL של מעקב המנויות (kalmea-sql-admin-tenant-contacts).' }, { status: 503 })
    }
    console.error('[admin/tenant-contact] read failed:', prior.error.message)
    return NextResponse.json({ error: 'השמירה נכשלה' }, { status: 500 })
  }

  const now = new Date().toISOString()
  // The first contact is kept as a record; later edits never move it.
  const contactedAt = (prior.data?.contacted_at as string | null | undefined) || (status !== 'not_contacted' ? now : null)

  const { data, error } = await db
    .from('admin_tenant_contacts')
    .upsert(
      { tenant_id: tenantId, status, note, follow_up_on: followUpOn, contacted_at: contactedAt, updated_at: now, updated_by: admin.userId },
      { onConflict: 'tenant_id' },
    )
    .select(COLUMNS)
    .maybeSingle()

  if (error || !data) {
    console.error('[admin/tenant-contact] write failed:', error?.message)
    return NextResponse.json({ error: 'השמירה נכשלה' }, { status: 500 })
  }

  return NextResponse.json({
    contact: { status: data.status, note: data.note || '', followUpOn: data.follow_up_on, contactedAt: data.contacted_at, updatedAt: data.updated_at },
  })
}
