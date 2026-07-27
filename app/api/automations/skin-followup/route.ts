// app/api/automations/skin-followup/route.ts
// Skin-scan → WhatsApp follow-up: builds the APPROVAL QUEUE of suggested,
// editable follow-up messages from each client's own scan trend.
//
// This route only PREVIEWS / PROPOSES — it never sends WhatsApp and never
// persists. It doubles as the required "test mode": it shows which client would
// be contacted, why it triggered, and the exact proposed message, without
// contacting anyone.
//
// SECURITY: the tenant is resolved from the AUTHENTICATED session
// (get_user_tenant_id); every read is tenant-scoped. Only the client's own data
// is used; messages carry no scan scores or findings.
//
// Automation control (three-state) + clinic master pause live in the EXISTING
// settings store, inside ONE JSONB column `settings.automations` (same convention
// as settings.business_hours / settings.faq — no new table, no new architecture).
// Read DEFENSIVELY so this is safe BEFORE the column exists:
//   settings.automations.skin_followup.mode -> 'off'(default)|'approval'|'automatic'
//   settings.automations.paused             -> false(default)|true (master pause)
// Default is OFF — no queue is produced until the clinic explicitly opts in, and
// even 'automatic' never sends from this route (auto-send is a later increment).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildSkinFollowupSuggestions } from '@/lib/skinFollowup'

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function daysAgo(dateStr: string, today: Date): number | null {
  const t = new Date(String(dateStr).slice(0, 10) + 'T00:00:00Z').getTime()
  if (Number.isNaN(t)) return null
  const b = new Date(ymd(today) + 'T00:00:00Z').getTime()
  return Math.round((b - t) / 86400000)
}

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'לא מחובר' }, { status: 401 })
    const { data: tenantId } = await supabase.rpc('get_user_tenant_id')
    if (!tenantId) return NextResponse.json({ error: 'לא זוהה עסק' }, { status: 400 })

    // Read automation control defensively (columns may not exist yet -> defaults).
    const { data: settingsRows } = await supabase
      .from('settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .limit(1)
    const settings: Record<string, unknown> = settingsRows?.[0] || {}
    // Automation config lives in the existing settings store, in a single JSONB
    // column `automations`. Read defensively so it works before the column exists.
    const asObj = (v: unknown): Record<string, unknown> =>
      v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
    const automations = asObj(settings.automations)
    const skinCfg = asObj(automations.skin_followup)
    const mode = typeof skinCfg.mode === 'string' ? skinCfg.mode : 'off'
    const paused = automations.paused === true

    // Clinic master pause wins over any individual automation mode.
    if (paused) {
      return NextResponse.json({ mode, paused: true, disabled: true, reason: 'master_pause', queue: [] })
    }
    if (mode === 'off') {
      return NextResponse.json({ mode: 'off', paused: false, disabled: true, reason: 'off', queue: [] })
    }

    const [clientsRes, scansRes, apptsRes] = await Promise.all([
      supabase.from('clients').select('id, name, phone').eq('tenant_id', tenantId),
      supabase.from('skin_scans').select('client_id, score, skin_type, created_at').eq('tenant_id', tenantId),
      supabase.from('appointments').select('client_id, date').eq('tenant_id', tenantId),
    ])
    const clients = clientsRes.data || []
    const scans = scansRes.data || []
    const appts = (apptsRes.data || []) as Array<{ client_id?: string; date?: string }>

    // Days since each client's last visit (for the "maintenance due" trigger).
    const now = new Date()
    const lastVisit: Record<string, string> = {}
    for (const a of appts) {
      if (!a.client_id || !a.date) continue
      const k = String(a.client_id)
      if (!lastVisit[k] || a.date > lastVisit[k]) lastVisit[k] = a.date
    }
    const lastVisitByClient: Record<string, number> = {}
    for (const k of Object.keys(lastVisit)) {
      const d = daysAgo(lastVisit[k], now)
      if (d != null) lastVisitByClient[k] = d
    }

    const queue = buildSkinFollowupSuggestions(
      { clients, scans, lastVisitByClient },
      { todayStr: ymd(now), reassessDays: 30, maintenanceDays: 60 }
    )

    return NextResponse.json({
      mode,
      paused: false,
      disabled: false,
      autoSendImplemented: false, // this slice PROPOSES only — nothing is ever sent here
      count: queue.length,
      queue,
      generatedAt: now.toISOString(),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
