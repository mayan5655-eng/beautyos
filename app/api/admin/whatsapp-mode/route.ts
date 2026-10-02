// app/api/admin/whatsapp-mode/route.ts
// Reads and flips platform_settings.whatsapp_auto_utility_enabled - the one
// live switch for whether utility WhatsApp types (reminder, booking_confirm,
// receipt, skin_report) may send automatically through the central number.
// A visible admin-panel toggle, not an env var, by explicit decision: she
// needs to flip it the instant the SIM is authorized, and flip it back
// instantly if the number gets restricted, without waiting on a redeploy.
//
// SECURITY: requirePlatformAdmin() first, same pattern as
// app/api/admin/tenants/route.ts. A non-admin gets 404, not 403.

import { NextResponse } from 'next/server'
import { requirePlatformAdmin, createAdminClient } from '@/lib/adminGuard'
import { invalidatePlatformSettingsCache } from '@/lib/platformSettings.js'

function notFound() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}

export async function GET() {
  const admin = await requirePlatformAdmin()
  if (!admin.ok) return notFound()

  const db = createAdminClient()
  const { data, error } = await db
    .from('platform_settings')
    .select('whatsapp_auto_utility_enabled, updated_at')
    .eq('id', true)
    .maybeSingle()

  if (error) {
    // Most likely the migration hasn't been run yet - tell the panel plainly
    // rather than a raw Postgres error, since this is the first thing the
    // admin panel will hit after this feature ships.
    return NextResponse.json(
      { error: 'הטבלה platform_settings לא קיימת עדיין - יש להריץ את whatsapp-manual-mode.sql', enabled: false },
      { status: 200 }
    )
  }

  return NextResponse.json({ enabled: data?.whatsapp_auto_utility_enabled === true, updatedAt: data?.updated_at ?? null })
}

export async function POST(request: Request) {
  const admin = await requirePlatformAdmin()
  if (!admin.ok) return notFound()

  const body = await request.json().catch(() => ({}))
  const enabled = body?.enabled === true

  const db = createAdminClient()
  const { data, error } = await db
    .from('platform_settings')
    .update({ whatsapp_auto_utility_enabled: enabled, updated_at: new Date().toISOString(), updated_by: admin.userId })
    .eq('id', true)
    .select('whatsapp_auto_utility_enabled')
    .maybeSingle()

  if (error) {
    console.error('[admin/whatsapp-mode] write failed:', error.message)
    return NextResponse.json({ error: 'העדכון נכשל - יש להריץ את whatsapp-manual-mode.sql' }, { status: 500 })
  }

  invalidatePlatformSettingsCache()
  console.log(`[admin/whatsapp-mode] ${admin.userId} set whatsapp_auto_utility_enabled=${enabled}`)

  return NextResponse.json({ enabled: data?.whatsapp_auto_utility_enabled === true })
}
