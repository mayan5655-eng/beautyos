// app/api/admin/tenants/route.ts
// Plan-state mutations for the Phase 4 admin panel.
//
// SECURITY MODEL
//   * requirePlatformAdmin() runs FIRST, on every request. The page component
//     also checks, but that is irrelevant here: this handler is reachable over
//     HTTP directly and never sees the page's check.
//   * A non-admin gets 404, not 403. A 403 would confirm the endpoint exists.
//   * The tenant being modified comes from the body, which is CORRECT here and
//     only here: an admin legitimately acts on other tenants. That is exactly
//     why the admin check above has to be airtight.
//   * Writes use the service-role key, which is required: gate.sql revoked
//     UPDATE on public.tenants from `authenticated` and granted back only
//     (name), so plan_status and trial_ends_at are unwritable by any session
//     client. The panel is meant to be the only way to change them.
//
// NEVER DELETES ANYTHING. There is no delete action and there will not be one.
// 'expired' means blocked, not removed.

import { NextResponse } from 'next/server'
import { requirePlatformAdmin, createAdminClient } from '@/lib/adminGuard'

/** Actions the panel may perform. Anything else is rejected. */
const ACTIONS = ['extend', 'activate', 'pause'] as const
type Action = (typeof ACTIONS)[number]

/** Bounds on a trial extension, so a typo cannot grant a decade. */
const MIN_EXTEND_DAYS = 1
const MAX_EXTEND_DAYS = 365

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Columns the panel reads back after a write. Never `*`. */
const TENANT_FIELDS =
  'id, name, plan_status, trial_started_at, trial_ends_at, plan_price, signup_source'

function notFound() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}

export async function POST(request: Request) {
  // 1. Admin or nothing.
  const admin = await requirePlatformAdmin()
  if (!admin.ok) return notFound()

  // 2. Validate input before touching the database.
  const body = await request.json().catch(() => ({}))
  const action = body?.action as Action | undefined
  const tenantId = typeof body?.tenantId === 'string' ? body.tenantId : ''

  if (!action || !ACTIONS.includes(action)) {
    return NextResponse.json({ error: 'פעולה לא מוכרת' }, { status: 400 })
  }
  if (!UUID_RE.test(tenantId)) {
    return NextResponse.json({ error: 'מזהה עסק לא תקין' }, { status: 400 })
  }

  const db = createAdminClient()

  // 3. The row must exist. Also gives us the current trial_ends_at, which the
  //    extend maths needs.
  const { data: current, error: readErr } = await db
    .from('tenants')
    .select(TENANT_FIELDS)
    .eq('id', tenantId)
    .maybeSingle()

  if (readErr) {
    console.error('[admin/tenants] read failed:', readErr.message)
    return NextResponse.json({ error: 'שגיאה בקריאת העסק' }, { status: 500 })
  }
  if (!current) {
    return NextResponse.json({ error: 'העסק לא נמצא' }, { status: 404 })
  }

  // 4. Build the patch.
  let patch: Record<string, string | null> = {}

  if (action === 'activate') {
    // Trial dates are deliberately LEFT INTACT. They are a record of what
    // happened, and tenant_effective_status only applies the elapsed-trial rule
    // while plan_status = 'trial', so a stale trial_ends_at is inert here.
    patch = { plan_status: 'active' }
  } else if (action === 'pause') {
    patch = { plan_status: 'paused' }
  } else {
    // extend: add N days and put her back on trial.
    const days = Number(body?.days)
    if (!Number.isInteger(days) || days < MIN_EXTEND_DAYS || days > MAX_EXTEND_DAYS) {
      return NextResponse.json(
        { error: `מספר הימים חייב להיות בין ${MIN_EXTEND_DAYS} ל-${MAX_EXTEND_DAYS}` },
        { status: 400 }
      )
    }

    // Extend from whichever is LATER: now, or the existing end date. Extending
    // an already-elapsed trial from its old end date would hand her days that
    // are already in the past, so "+7 days" on a trial that ended a fortnight
    // ago would still leave her blocked. Extending from now is what is meant.
    const now = Date.now()
    const existing = current.trial_ends_at ? new Date(current.trial_ends_at).getTime() : NaN
    const base = Number.isFinite(existing) && existing > now ? existing : now
    const nextEnd = new Date(base + days * 24 * 60 * 60 * 1000)

    patch = {
      plan_status: 'trial',
      trial_ends_at: nextEnd.toISOString(),
      // Only stamp a start date if there has never been one, so the original
      // trial start is preserved across extensions.
      ...(current.trial_started_at ? {} : { trial_started_at: new Date(now).toISOString() }),
    }
  }

  // 5. Write, and read the row back so the panel shows what actually landed
  //    rather than what it hoped for.
  const { data: updated, error: writeErr } = await db
    .from('tenants')
    .update(patch)
    .eq('id', tenantId)
    .select(TENANT_FIELDS)
    .maybeSingle()

  if (writeErr) {
    console.error('[admin/tenants] write failed:', writeErr.message)
    return NextResponse.json({ error: 'העדכון נכשל' }, { status: 500 })
  }
  if (!updated) {
    return NextResponse.json({ error: 'העדכון לא בוצע' }, { status: 500 })
  }

  console.log(
    `[admin/tenants] ${admin.userId} performed "${action}" on tenant ${tenantId} -> ${updated.plan_status}`
  )

  return NextResponse.json({ tenant: updated })
}
