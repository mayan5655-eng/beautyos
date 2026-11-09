// app/api/admin/grow-onboarding/route.ts
//
// POST { updateId, tenantId } -> attaches ONE unmatched Grow onboarding update (grow_onboarding_updates, written by
// /api/grow/webhook) to the business the platform admin picked. Grow sometimes sends the update without our tracking code, so
// the webhook cannot match it and the owner used to paste the business id by hand on the business's card.
//
// SECURITY MODEL: the same as the other /api/admin routes. requirePlatformAdmin() FIRST, on every request; a non-admin gets 404
// (a 403 would confirm the endpoint exists). The tenant comes from the body, which is correct only here, behind that check.
// Rate-limited per admin and per address (lib/rateLimit.ts 'admin-grow-attach'). Writes go through the service role.
//
// What it writes is exactly what a matched onboarding writes: lib/grow/webhook.ts attachOnboardingToTenant, the webhook's own code
// path, never a copy of it. Every attempt that reaches the database leaves a row in ops_events (source grow:onboarding-attached)
// with the update id, the tenant id, the admin's user id and the outcome. Never the Grow user_id, never a key, never a name.
// Nothing is deleted. Demo tenants are refused.

import { NextResponse } from 'next/server'
import { requirePlatformAdmin, createAdminClient } from '@/lib/adminGuard'
import { isDemoTenantId } from '@/lib/demoTenants'
import { checkIpLimit, checkTenantLimit } from '@/lib/rateLimit'
import { supabaseOnboardingRepo } from '@/lib/grow/onboardingRepo'
import { adminAttachOnboarding } from '@/lib/grow/webhook'
import { raiseOpsAlert } from '@/lib/opsAlert.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const notFound = () => NextResponse.json({ error: 'not found' }, { status: 404 })

export async function POST(request: Request) {
  const adminCheck = await requirePlatformAdmin()
  if (!adminCheck.ok) return notFound()
  const limited = checkIpLimit(request, 'admin-grow-attach') || checkTenantLimit(adminCheck.userId, 'admin-grow-attach')
  if (limited) return limited

  const body = await request.json().catch(() => ({}))
  const updateId = typeof body?.updateId === 'string' ? body.updateId.trim() : ''
  const tenantId = typeof body?.tenantId === 'string' ? body.tenantId.trim() : ''
  if (!UUID_RE.test(updateId)) return NextResponse.json({ success: false, error: 'מזהה העדכון לא תקין' }, { status: 400 })
  if (!UUID_RE.test(tenantId) || isDemoTenantId(tenantId)) return NextResponse.json({ success: false, error: 'מזהה עסק לא תקין' }, { status: 400 })

  const db = createAdminClient()
  const tenant = await db.from('tenants').select('id').eq('id', tenantId).maybeSingle()
  if (tenant.error) return NextResponse.json({ success: false, error: 'שגיאה בקריאת העסק' }, { status: 500 })
  if (!tenant.data) return NextResponse.json({ success: false, error: 'העסק לא נמצא' }, { status: 404 })

  const log = (outcome: string, extra: Record<string, unknown> = {}) =>
    raiseOpsAlert({
      db, source: 'grow:onboarding-attached', severity: 'info',
      message: `Grow onboarding update attached by admin: ${outcome}`,
      details: { updateId, tenantId, adminUserId: adminCheck.userId, outcome, ...extra },
      timeoutMs: 5000,
    }).catch(() => null)

  try {
    const r = await adminAttachOnboarding(updateId, tenantId, supabaseOnboardingRepo(db))
    if (!r.ok) {
      await log(r.code)
      return NextResponse.json(
        { success: false, code: r.code, error: r.code === 'not-found' ? 'העדכון לא נמצא' : 'העדכון הזה כבר שויך לעסק' },
        { status: r.code === 'not-found' ? 404 : 409 },
      )
    }
    await log(r.result.status, { registration: r.result.registration || null })
    if (r.result.status === 'conflict') {
      return NextResponse.json({ success: false, code: 'conflict', error: 'העסק הזה כבר מחובר לחשבון Grow אחר. לא שינינו כלום בחיבור שלו.' }, { status: 409 })
    }
    const message = r.result.registration === 'approved'
      ? 'שויך. החשבון חובר לעסק והסליקה הופעלה.'
      : r.result.registration === 'rejected'
        ? 'שויך. בכרטיס של העסק מופיע ש-Grow לא אישרה את החשבון.'
        : 'שויך. בכרטיס של העסק מופיע שהבקשה ממתינה לאישור של Grow.'
    return NextResponse.json({ success: true, status: r.result.status, registration: r.result.registration || null, message })
  } catch (e) {
    console.error('[admin/grow-onboarding] attach failed:', (e as Error)?.message)
    await log('failed')
    return NextResponse.json({ success: false, error: 'השיוך נכשל, אפשר לנסות שוב' }, { status: 500 })
  }
}
