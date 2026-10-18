// app/dashboard/admin/WaCloudCosts.tsx
//
// The WhatsApp Cloud API cost log, on the admin panel. Server component, READ ONLY, through the service-role client
// the admin page holds after requirePlatformAdmin() passed. Written by lib/waCloud/send.ts (one row per decision) and
// app/api/wa-cloud/webhook (Meta's delivery status and pricing).
//
// Honest columns: "accepted" is what Meta took (it returned a message id), "billable" is what Meta's own status
// webhook said it will charge for, and the dollar figure is an ESTIMATE (accepted live x WA_CLOUD_UTILITY_COST_USD),
// labelled as one. Mock rows are shown apart: they cost nothing and reached nobody.

import type { SupabaseClient } from '@supabase/supabase-js'
import { waCloudStatus, tenantDailyCap, utilityCostUsd } from '@/lib/waCloud/config'

type Row = {
  tenant_id: string
  mode: 'live' | 'mock'
  status: 'accepted' | 'refused' | 'failed'
  reason: string | null
  cost_estimate_usd: number | null
  billable: boolean | null
  delivery_status: string | null
}

type Agg = { live: number; mock: number; refused: number; failed: number; billable: number; delivered: number; cost: number; reasons: Record<string, number> }

const REASON_HE: Record<string, string> = {
  quiet_hours: 'שעות שקט',
  tenant_capped: 'תקרה יומית',
  cap_unreadable: 'יומן לא נקרא',
  bad_params: 'פרטים חסרים',
  meta_error: 'שגיאת Meta',
}

export default async function WaCloudCosts({ db }: { db: SupabaseClient }) {
  const st = waCloudStatus()
  const since = new Date(Date.now() - 30 * 86400_000).toISOString()
  const { data, error } = await db
    .from('wa_cloud_messages')
    .select('tenant_id, mode, status, reason, cost_estimate_usd, billable, delivery_status')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(10000)

  const box: React.CSSProperties = { marginTop: 28, padding: 16, border: '1px solid #E4DED3', borderRadius: 12, background: '#fff', direction: 'rtl' }
  const muted: React.CSSProperties = { color: '#4A5B54', fontSize: 'var(--t-sm)' }
  const stateLine = (
    <p style={{ ...muted, marginBottom: 12 }}>
      ערוץ רשמי: <strong>{st.enabled ? 'פעיל' : 'כבוי'}</strong> · מצב: <strong dir="ltr">{st.mode}</strong>
      {st.mode === 'mock' ? ' (רישום בלבד, השליחה בפועל ממשיכה דרך GreenAPI)' : ''}
      {' '}· תקרה לעסק ליום: {tenantDailyCap()} · שעות שקט 21:00–08:00 (חוץ מאישור תור)
      {st.missing.length ? <> · חסר: <span dir="ltr">{st.missing.join(', ')}</span></> : null}
    </p>
  )
  const title = <h2 style={{ fontSize: 'var(--t-xl)', fontWeight: 600, marginBottom: 6 }}>וואטסאפ רשמי (Cloud API) - עלויות 30 יום</h2>

  if (error) {
    const missing = /wa_cloud_messages|PGRST205|42P01/.test(`${error.code} ${error.message}`)
    return (
      <section style={box}>
        {title}
        {stateLine}
        <p style={{ color: '#B4453C', fontSize: 'var(--t-md)' }}>
          {missing
            ? 'יומן העלויות עדיין לא קיים בבסיס הנתונים - צריך להריץ את add_wa_cloud.sql. עד אז הערוץ הרשמי לא ישלח במצב live.'
            : `לא הצלחנו לקרוא את יומן העלויות: ${error.message}`}
        </p>
      </section>
    )
  }

  const rows = (data || []) as Row[]
  const byTenant = new Map<string, Agg>()
  for (const r of rows) {
    const a = byTenant.get(r.tenant_id) || { live: 0, mock: 0, refused: 0, failed: 0, billable: 0, delivered: 0, cost: 0, reasons: {} }
    if (r.status === 'accepted') {
      if (r.mode === 'live') { a.live++; a.cost += Number(r.cost_estimate_usd) || 0 } else a.mock++
    } else if (r.status === 'refused') a.refused++
    else a.failed++
    if (r.reason) a.reasons[r.reason] = (a.reasons[r.reason] || 0) + 1
    if (r.billable === true) a.billable++
    if (r.delivery_status === 'delivered' || r.delivery_status === 'read') a.delivered++
    byTenant.set(r.tenant_id, a)
  }

  const ids = [...byTenant.keys()]
  const names = new Map<string, string>()
  if (ids.length) {
    const { data: t } = await db.from('tenants').select('id, name').in('id', ids)
    for (const x of (t || []) as { id: string; name: string | null }[]) names.set(x.id, x.name || x.id.slice(0, 8))
  }
  const total = [...byTenant.values()].reduce((s, a) => s + a.cost, 0)
  const cell: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid #EFEAE0', textAlign: 'start', fontSize: 'var(--t-sm)' }

  return (
    <section style={box}>
      {title}
      {stateLine}
      {rows.length === 0 ? (
        <p style={{ color: '#4A5B54', fontSize: 'var(--t-md)' }}>עדיין לא עברה אף הודעה בערוץ הרשמי.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                {['עסק', 'נשלחו (live)', 'הגיעו', 'לחיוב לפי Meta', 'הערכת עלות $', 'mock', 'נדחו', 'נכשלו'].map((h) => <th key={h} style={{ ...cell, fontWeight: 600 }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {ids.map((id) => {
                const a = byTenant.get(id)!
                const why = Object.entries(a.reasons).map(([k, v]) => `${REASON_HE[k] || k}: ${v}`).join(' · ')
                return (
                  <tr key={id}>
                    <td style={cell}>{names.get(id) || id.slice(0, 8)}</td>
                    <td style={cell}>{a.live}</td>
                    <td style={cell}>{a.delivered}</td>
                    <td style={cell}>{a.billable}</td>
                    <td style={cell} dir="ltr">{a.cost.toFixed(4)}</td>
                    <td style={cell}>{a.mock}</td>
                    <td style={cell} title={why}>{a.refused}{why ? ` (${why})` : ''}</td>
                    <td style={cell}>{a.failed}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p style={{ ...muted, marginTop: 8 }}>
            סה״כ הערכה: <span dir="ltr">${total.toFixed(4)}</span> (לפי ${utilityCostUsd()} להודעת שירות שנשלחה; החיוב האמיתי הוא מה ש-Meta מסמנת &quot;לחיוב&quot;, ומופיע בחשבון ב-Meta Business).
          </p>
        </div>
      )}
    </section>
  )
}
