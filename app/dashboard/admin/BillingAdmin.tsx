// app/dashboard/admin/BillingAdmin.tsx
//
// Admin panel section: every business's Kalmea subscription, with its status, monthly price, next charge date and failed attempts, plus the two
// owner actions (BillingActions). Server component, service-role read after requirePlatformAdmin() has passed. The token reference is never read.

import type { SupabaseClient } from '@supabase/supabase-js'
import BillingActions from './BillingActions'

type Row = { id: string; tenant_id: string; price: number | string; status: string; next_charge_at: string | null; card_last4: string | null; failed_attempts: number; past_due_since: string | null; ends_at: string | null }

const STATUS_HE: Record<string, { label: string; color: string }> = {
  trialing: { label: 'בניסיון, כרטיס שמור', color: 'var(--ink-2)' },
  active: { label: 'פעיל', color: '#2F7D57' },
  past_due: { label: 'חיוב נכשל', color: '#B4453C' },
  canceled: { label: 'בוטל', color: '#9A6B00' },
}

const fmt = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short' }).format(d)
}

export default async function BillingAdmin({ db }: { db: SupabaseClient }) {
  const wrap = { direction: 'rtl' as const, fontFamily: "'Heebo','Assistant',sans-serif", marginTop: 28 }
  const note = { fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.7 }
  const { data, error } = await db
    .from('billing_subscriptions')
    .select('id, tenant_id, price, status, next_charge_at, card_last4, failed_attempts, past_due_since, ends_at')
    .order('next_charge_at', { ascending: true, nullsFirst: false })
    .limit(300)

  if (error) {
    return (
      <section style={wrap}>
        <h2 style={{ fontSize: 'var(--t-xl)', fontWeight: 600 }}>מנויים וחיובים</h2>
        <p style={note}>הרשימה עוד לא זמינה: צריך להריץ את add_kalmea_billing.sql.</p>
      </section>
    )
  }

  const rows = (data || []) as Row[]
  const ids = rows.map((r) => r.tenant_id)
  const names: Record<string, string> = {}
  if (ids.length) {
    const { data: ts } = await db.from('tenants').select('id, name').in('id', ids)
    for (const t of ts || []) names[String(t.id)] = String(t.name || '')
  }
  const td = { padding: '8px 10px', borderBottom: '1px solid var(--line)', verticalAlign: 'top' as const }

  return (
    <section id="billing" style={wrap}>
      <h2 style={{ fontSize: 'var(--t-xl)', fontWeight: 600, marginBottom: 6 }}>מנויים וחיובים</h2>
      <p style={note}>המנויים של קלמיה. אפשר לסמן תשלום ידני למי ששילמה ישירות, ולקבוע מחיר לכל עסק.</p>
      {rows.length === 0 ? (
        <p style={note}>עוד אין מנויים.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--t-sm)' }}>
            <thead>
              <tr>
                {['עסק', 'סטטוס', 'מחיר', 'חיוב הבא', 'כרטיס', 'ניסיונות כושלים', 'פעולות'].map((h) => (
                  <th key={h} style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid var(--line)', color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const s = STATUS_HE[r.status] || { label: r.status, color: 'var(--ink-2)' }
                return (
                  <tr key={r.id}>
                    <td style={td}>{names[r.tenant_id] || r.tenant_id.slice(0, 8)}</td>
                    <td style={{ ...td, color: s.color, fontWeight: 600 }}>{s.label}</td>
                    <td style={td}>₪{Number(r.price)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{r.status === 'canceled' ? `מסתיים ${fmt(r.ends_at)}` : fmt(r.next_charge_at)}</td>
                    <td style={td}>{r.card_last4 ? `•••• ${r.card_last4}` : 'אין כרטיס'}</td>
                    <td style={td}>{r.failed_attempts || 0}</td>
                    <td style={td}><BillingActions tenantId={r.tenant_id} price={Number(r.price)} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
