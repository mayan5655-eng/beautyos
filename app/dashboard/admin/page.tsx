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
import AdminClient, { type AdminTenantRow } from './AdminClient'

// Never cache or prerender an admin listing: it is per-request, privileged, and
// must reflect the database as it is right now.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function AdminPage() {
  const admin = await requirePlatformAdmin()
  if (!admin.ok) notFound()

  const db = createAdminClient()

  // Explicit column list rather than select('*'): this row is privileged and
  // crosses to the browser, so nothing travels that the panel does not display.
  const { data, error } = await db
    .from('tenants')
    .select('id, name, plan_status, trial_started_at, trial_ends_at, plan_price, signup_source')

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

  if (error) {
    return (
      <div style={{ direction: 'rtl', fontFamily: "'Heebo','Assistant',sans-serif" }}>
        <h1 style={{ fontSize: 26, fontWeight: 600, marginBottom: 12 }}>ניהול מנויים</h1>
        <p style={{ color: '#B4453C', fontSize: 14 }}>
          שגיאה בטעינת רשימת העסקים: {error.message}
        </p>
      </div>
    )
  }

  return (
    <AdminClient
      initialTenants={(data || []) as AdminTenantRow[]}
      ownTenantId={ownTenantId}
    />
  )
}
