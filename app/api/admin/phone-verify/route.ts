// app/api/admin/phone-verify/route.ts
//
// Reads and flips the two phone-verification switches (platform_settings.phone_verify_signup / phone_verify_existing,
// supabase/migrations/add_owner_phone_verification.sql). An admin-panel switch, not an env var, for the same reason as
// app/api/admin/whatsapp-mode: she turns it on the day SMS is paid for, and off at once if SMS breaks, with no redeploy.
//
// The first time the signup switch goes on, phone_verify_since is stamped: accounts created after that moment must
// verify; accounts created before it are only asked (and only if the second switch is on).
//
// SECURITY: requirePlatformAdmin() first. A non-admin gets 404, not 403.

import { NextResponse } from 'next/server'
import { requirePlatformAdmin, createAdminClient } from '@/lib/adminGuard'
import { smsStatus } from '@/lib/phoneVerify/sms'

const MIGRATION = 'add_owner_phone_verification.sql'

function notFound() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}

function smsInfo() {
  const s = smsStatus()
  return { ready: s.ready, mode: s.mode, provider: s.provider, reason: s.reason || null }
}

export async function GET() {
  const admin = await requirePlatformAdmin()
  if (!admin.ok) return notFound()

  const db = createAdminClient()
  const { data, error } = await db
    .from('platform_settings')
    .select('phone_verify_signup, phone_verify_existing, phone_verify_since')
    .eq('id', true)
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: `המתגים עוד לא קיימים - יש להריץ את ${MIGRATION}`, signup: false, existing: false, since: null, sms: smsInfo() })
  }
  return NextResponse.json({ signup: data.phone_verify_signup === true, existing: data.phone_verify_existing === true, since: data.phone_verify_since ?? null, sms: smsInfo() })
}

export async function POST(request: Request) {
  const admin = await requirePlatformAdmin()
  if (!admin.ok) return notFound()

  const body = await request.json().catch(() => ({}))
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: admin.userId }
  if (typeof body?.signup === 'boolean') patch.phone_verify_signup = body.signup
  if (typeof body?.existing === 'boolean') patch.phone_verify_existing = body.existing

  const db = createAdminClient()
  if (patch.phone_verify_signup === true) {
    const { data: cur } = await db.from('platform_settings').select('phone_verify_since').eq('id', true).maybeSingle()
    if (!cur?.phone_verify_since) patch.phone_verify_since = new Date().toISOString()
  }

  const { data, error } = await db
    .from('platform_settings')
    .update(patch)
    .eq('id', true)
    .select('phone_verify_signup, phone_verify_existing, phone_verify_since')
    .maybeSingle()

  if (error || !data) {
    console.error('[admin/phone-verify] write failed:', error?.message || 'no row')
    return NextResponse.json({ error: `העדכון נכשל - יש להריץ את ${MIGRATION}` }, { status: 500 })
  }
  console.log(`[admin/phone-verify] ${admin.userId} set signup=${data.phone_verify_signup} existing=${data.phone_verify_existing}`)
  return NextResponse.json({ signup: data.phone_verify_signup === true, existing: data.phone_verify_existing === true, since: data.phone_verify_since ?? null, sms: smsInfo() })
}
