// app/dashboard/admin/AddonPurchasesAdmin.tsx
//
// Admin panel, under "מנויים וחיובים": the add-on packs bought THIS month (Israel calendar): who, what, how much, when. Server component,
// service-role read after requirePlatformAdmin() has passed (rendered by BillingAdmin). Read-only. A pack row exists only after its charge
// succeeded (lib/billing/service.ts buyAddon), so this is money that really came in. Before add_billing_addons.sql runs it says so.

import type { SupabaseClient } from '@supabase/supabase-js'
import { ADDON_PACKS, type AddonPackKey } from '@/lib/pricing'
import { periodMonth } from '@/lib/addonQuota'

type Row = { id: string; tenant_id: string; pack: string; units: number | string; price: number | string; created_at: string }

const fmt = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' }).format(d)
}

export default async function AddonPurchasesAdmin({ db, now = new Date() }: { db: SupabaseClient; now?: Date }) {
  const note = { fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.7 }
  const month = periodMonth(now)
  const { data, error } = await db
    .from('billing_addons')
    .select('id, tenant_id, pack, units, price, created_at')
    .eq('period_month', month)
    .order('created_at', { ascending: false })
    .limit(200)

  const head = <h3 style={{ fontSize: 'var(--t-lg)', fontWeight: 600, marginTop: 20, marginBottom: 4 }}>חבילות שנקנו החודש</h3>
  if (error) return <div data-testid="admin-addon-purchases">{head}<p style={note}>הרשימה עוד לא זמינה: צריך להריץ את add_billing_addons.sql.</p></div>

  const rows = (data || []) as Row[]
  const ids = [...new Set(rows.map((r) => r.tenant_id))]
  const names: Record<string, string> = {}
  if (ids.length) {
    const { data: ts } = await db.from('tenants').select('id, name').in('id', ids)
    for (const t of ts || []) names[String(t.id)] = String(t.name || '')
  }
  const total = rows.reduce((s, r) => s + (Number(r.price) || 0), 0)
  const td = { padding: '8px 10px', borderBottom: '1px solid var(--line)', verticalAlign: 'top' as const }

  return (
    <div data-testid="admin-addon-purchases">
      {head}
      {rows.length === 0 ? (
        <p style={note}>עוד לא נקנו חבילות החודש.</p>
      ) : (
        <>
          <p style={note}>{rows.length} חבילות, ₪{Math.round(total * 100) / 100} בסך הכול.</p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--t-sm)' }}>
              <thead>
                <tr>
                  {['עסק', 'חבילה', 'סכום', 'מתי'].map((h) => (
                    <th key={h} style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid var(--line)', color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const p = ADDON_PACKS[r.pack as AddonPackKey]
                  return (
                    <tr key={r.id}>
                      <td style={td}>{names[r.tenant_id] || r.tenant_id.slice(0, 8)}</td>
                      <td style={td}><bdi>{p ? `עוד ${Number(r.units)} ${p.unitHe}` : r.pack}</bdi></td>
                      <td style={td}>₪{Number(r.price)}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmt(r.created_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
