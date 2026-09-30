// app/dashboard/admin/page.tsx
// Phase 4: the platform admin panel. Lists every tenant with its plan state and
// lets an admin extend a trial, activate, or pause.
//
// GATING, in layers, outermost first:
//   1. proxy.ts -> lib/supabase/middleware.ts: /dashboard/* is not public, so
//      an anonymous visitor is redirected to /login before this file runs.
//   2. app/dashboard/layout.tsx: re-checks the session and redirects.
//   3. requirePlatformAdmin() below: the real gate. Everything above only
//      proves you are SOMEBODY; this proves you are an admin.
//
// A non-admin gets notFound() -> a plain 404, deliberately not a 403 and not a
// "you are not allowed" screen. A tenant poking at /dashboard/admin should not
// learn that an admin panel exists at all.
//
// This page only READS. Every mutation goes through /api/admin/tenants, which
// repeats the admin check, because a route handler is reachable over HTTP and
// never sees this file's check.

import { notFound } from 'next/navigation'
import { requirePlatformAdmin, createAdminClient } from '@/lib/adminGuard'
import { createClient as createSessionClient } from '@/lib/supabase/server'
import { checkInstanceState } from '@/lib/greenApi/health'
import AdminClient, { type AdminTenantRow } from './AdminClient'

// Never cache or prerender an admin listing: it is per-request, privileged, and
// must reflect the database as it is right now.
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Trial-start/end are still read straight off `tenants` even in the rich
// path below: platform_tenant_metrics() returns trial_ends_at but not
// trial_started_at (the panel's extend action never needed it as a metric,
// only as an input), so that one column still comes from the plain table.
const TENANT_FALLBACK_FIELDS =
  'id, name, plan_status, trial_started_at, trial_ends_at, plan_price, signup_source'

export default async function AdminPage() {
  const admin = await requirePlatformAdmin()
  if (!admin.ok) notFound()

  const db = createAdminClient()

  // The rich path: platform_tenant_metrics() (supabase/migrations/pending/
  // platform-admin-view.sql), metadata-only by construction - client and
  // appointment COUNTS come out, never a client row. Degrades to the plain
  // tenants select if the function has not been applied yet (the standing
  // rule in that migration's own README: code that depends on a new database
  // object must degrade rather than break), so this page never goes down
  // over a migration nobody has run by hand yet.
  const rich = await db.rpc('platform_tenant_metrics')

  let rows: AdminTenantRow[]
  const trialStartById = new Map<string, string | null>()

  if (!rich.error && rich.data) {
    // trial_started_at only lives on `tenants`, so one lightweight extra read
    // to fill it in - never a client-bearing table, never select('*').
    const started = await db.from('tenants').select('id, trial_started_at')
    for (const row of started.data || []) {
      trialStartById.set((row as { id: string }).id, (row as { trial_started_at: string | null }).trial_started_at)
    }
    rows = (rich.data as AdminTenantRow[]).map((r) => ({
      ...r,
      trial_started_at: trialStartById.get(r.id) ?? null,
    }))
  } else {
    if (rich.error) {
      console.error('[admin] platform_tenant_metrics unavailable, falling back to plain tenants read:', rich.error.message)
    }
    const { data, error } = await db.from('tenants').select(TENANT_FALLBACK_FIELDS)
    if (error) {
      return (
        <div style={{ direction: 'rtl', fontFamily: "'Heebo','Assistant',sans-serif" }}>
          <h1 style={{ fontSize:"var(--t-3xl)", fontWeight: 600, marginBottom: 12 }}>ניהול מנויים</h1>
          <p style={{ color: '#B4453C', fontSize:"var(--t-md)" }}>
            שגיאה בטעינת רשימת העסקים: {error.message}
          </p>
        </div>
      )
    }
    rows = (data || []) as AdminTenantRow[]
  }

  // Which tenant is the admin's own, so the UI can flag it before she pauses
  // herself by accident. Read on the SESSION client, not the service-role one.
  let ownTenantId: string | null = null
  try {
    const session = await createSessionClient()
    const { data: tid } = await session.rpc('get_user_tenant_id')
    ownTenantId = typeof tid === 'string' ? tid : null
  } catch {
    // Non-fatal: the panel simply will not badge her own row.
  }

  // Checked live, every load, not cached: this asks GreenAPI itself whether
  // the shared WhatsApp session is actually logged in. Found 2026-10-01 by
  // hand, the hard way - instance 7107629829 read notAuthorized while 12
  // consecutive nightly alerts sat logged "sent" and none arrived, because
  // GreenAPI's /sendMessage returns 200 regardless of whether anything is on
  // the other end. This is the loud, WhatsApp-independent way to catch that
  // going forward: a WhatsApp alert about WhatsApp being down is exactly the
  // message that wouldn't arrive either.
  const greenApiState = await checkInstanceState()

  return (
    <AdminClient
      initialTenants={rows}
      ownTenantId={ownTenantId}
      metricsAvailable={!rich.error}
      greenApiState={greenApiState}
    />
  )
}
