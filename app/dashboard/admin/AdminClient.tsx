'use client'

// app/dashboard/admin/AdminClient.tsx
// The admin panel UI. Presentation only: it holds NO authority of its own.
// Every action posts to /api/admin/tenants, which re-checks platform admin
// membership server-side. Hiding a button here proves nothing and is not
// relied upon.
//
// Hebrew, RTL, no em-dashes, second person feminine, matching lib/planCopy.

import { useMemo, useState } from 'react'
import { planState, type PlanStatus } from '@/lib/planState'
import { daysHe } from '@/lib/planCopy'

export interface AdminTenantRow {
  id: string
  name: string | null
  plan_status: string | null
  trial_started_at: string | null
  trial_ends_at: string | null
  plan_price: number | string | null
  signup_source: string | null
}

type Action = 'extend' | 'activate' | 'pause'

const STATUS_HE: Record<PlanStatus, string> = {
  trial: 'בהתנסות',
  active: 'פעיל',
  expired: 'הסתיים',
  paused: 'בהשהיה',
}

// Muted, BloomOS-ish palette. Expired and paused read as calm states, not
// alarms: an expired tenant is a conversation to have, not a fire.
const STATUS_COLOR: Record<PlanStatus, { fg: string; bg: string; border: string }> = {
  trial: { fg: '#8A6A2F', bg: '#FBF3E2', border: '#EADFC4' },
  active: { fg: '#4E7A55', bg: '#EDF4EE', border: '#D3E5D6' },
  expired: { fg: '#9A5148', bg: '#FAEDEB', border: '#EBD4D0' },
  paused: { fg: '#5F5A6B', bg: '#F1F0F4', border: '#DEDCE4' },
}

const EXTEND_PRESETS = [7, 14, 30]

const ink = '#3D3640'
const ink2 = '#6E6672'
const line = '#E7E2E4'
const surface = '#FFFFFF'
const cream = '#FBF9F8'

function fmtDate(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('he-IL')
}

function fmtPrice(value: number | string | null): string {
  if (value === null || value === undefined || value === '') return '—'
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? `₪${n.toLocaleString('he-IL')}` : '—'
}

export default function AdminClient({
  initialTenants,
  ownTenantId,
}: {
  initialTenants: AdminTenantRow[]
  ownTenantId: string | null
}) {
  const [tenants, setTenants] = useState<AdminTenantRow[]>(initialTenants)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [extendDays, setExtendDays] = useState<Record<string, number>>({})

  // Derive plan state once per render, then sort so the rows that need a
  // decision float to the top: blocked first, then trials by urgency, then the
  // paying tenants who need nothing.
  const rows = useMemo(() => {
    const withState = tenants.map((t) => ({ tenant: t, plan: planState(t) }))
    const rank = (s: PlanStatus) => (s === 'expired' ? 0 : s === 'paused' ? 1 : s === 'trial' ? 2 : 3)
    return withState.sort((a, b) => {
      const r = rank(a.plan.status) - rank(b.plan.status)
      if (r !== 0) return r
      if (a.plan.status === 'trial' && b.plan.status === 'trial') {
        return (a.plan.daysRemaining ?? 9999) - (b.plan.daysRemaining ?? 9999)
      }
      return (a.tenant.name || '').localeCompare(b.tenant.name || '', 'he')
    })
  }, [tenants])

  const counts = useMemo(() => {
    const c = { trial: 0, active: 0, expired: 0, paused: 0 }
    rows.forEach((r) => { c[r.plan.status] += 1 })
    return c
  }, [rows])

  async function run(tenantId: string, action: Action, days?: number) {
    const row = tenants.find((t) => t.id === tenantId)
    const label = row?.name || 'העסק'

    const question =
      action === 'extend'
        ? `להאריך את ההתנסות של ${label} ב-${daysHe(days || 0)}?`
        : action === 'activate'
          ? `להעביר את ${label} למצב פעיל?`
          : `להעביר את ${label} להשהיה? החשבון יעבור למצב צפייה בלבד.`

    // Pausing her own business would put her own dashboard into read-only.
    // Worth one extra beat, but not worth forbidding: she may want to test it.
    const ownWarning =
      tenantId === ownTenantId && action !== 'activate'
        ? '\n\nשימי לב: זה העסק שלך. הפעולה תשפיע על החשבון שאת עובדת בו עכשיו.'
        : ''

    if (!window.confirm(question + ownWarning)) return

    setBusyId(tenantId)
    setError('')
    setNotice('')
    try {
      const res = await fetch('/api/admin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, action, days }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok || !data?.tenant) {
        setError(data?.error || 'הפעולה נכשלה. נסי שוב.')
        return
      }

      setTenants((prev) => prev.map((t) => (t.id === tenantId ? (data.tenant as AdminTenantRow) : t)))
      setNotice(`${label}: העדכון נשמר.`)
    } catch {
      setError('הפעולה נכשלה. בדקי את החיבור ונסי שוב.')
    } finally {
      setBusyId(null)
    }
  }

  const th: React.CSSProperties = {
    textAlign: 'right', fontSize: 11, fontWeight: 600, color: ink2,
    letterSpacing: '0.3px', padding: '10px 12px', whiteSpace: 'nowrap',
    borderBottom: `1px solid ${line}`,
  }
  const td: React.CSSProperties = {
    fontSize: 13, color: ink, padding: '13px 12px', verticalAlign: 'middle',
    borderBottom: `1px solid ${line}`,
  }
  const btn: React.CSSProperties = {
    fontSize: 11.5, fontWeight: 500, padding: '6px 12px', borderRadius: 999,
    border: `1px solid ${line}`, background: surface, color: ink,
    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  }

  return (
    <div style={{ direction: 'rtl', fontFamily: "'Heebo','Assistant',sans-serif", color: ink }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.01em', margin: 0 }}>
          ניהול מנויים
        </h1>
        <p style={{ fontSize: 13, color: ink2, marginTop: 6, lineHeight: 1.6 }}>
          כל העסקים במערכת, מצב המנוי שלהם והפעולות הזמינות. שינוי כאן משפיע מיד על
          מה שהעסק יכול לעשות. שום פעולה כאן לא מוחקת נתונים.
        </p>
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        {(['expired', 'paused', 'trial', 'active'] as PlanStatus[]).map((s) => (
          <div key={s} style={{
            padding: '10px 16px', borderRadius: 14, background: STATUS_COLOR[s].bg,
            border: `1px solid ${STATUS_COLOR[s].border}`, minWidth: 96,
          }}>
            <div style={{ fontSize: 20, fontWeight: 600, color: STATUS_COLOR[s].fg }}>
              {counts[s]}
            </div>
            <div style={{ fontSize: 11, color: STATUS_COLOR[s].fg, opacity: 0.85 }}>
              {STATUS_HE[s]}
            </div>
          </div>
        ))}
        <div style={{
          padding: '10px 16px', borderRadius: 14, background: cream,
          border: `1px solid ${line}`, minWidth: 96,
        }}>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{rows.length}</div>
          <div style={{ fontSize: 11, color: ink2 }}>סך הכל</div>
        </div>
      </div>

      {notice && (
        <div style={{
          padding: '11px 15px', borderRadius: 12, background: '#EDF4EE',
          border: '1px solid #D3E5D6', color: '#4E7A55', fontSize: 13, marginBottom: 14,
        }}>{notice}</div>
      )}
      {error && (
        <div style={{
          padding: '11px 15px', borderRadius: 12, background: '#FAEDEB',
          border: '1px solid #EBD4D0', color: '#9A5148', fontSize: 13, marginBottom: 14,
        }}>{error}</div>
      )}

      {rows.length === 0 ? (
        <p style={{ fontSize: 14, color: ink2 }}>אין עדיין עסקים במערכת.</p>
      ) : (
        <div style={{
          overflowX: 'auto', background: surface, borderRadius: 18,
          border: `1px solid ${line}`,
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr style={{ background: cream }}>
                <th style={th}>עסק</th>
                <th style={th}>מצב</th>
                <th style={th}>נותרו</th>
                <th style={th}>תחילת התנסות</th>
                <th style={th}>סיום התנסות</th>
                <th style={th}>מחיר</th>
                <th style={th}>מקור</th>
                <th style={th}>פעולות</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ tenant, plan }) => {
                const c = STATUS_COLOR[plan.status]
                const busy = busyId === tenant.id
                const isOwn = tenant.id === ownTenantId
                const days = extendDays[tenant.id] ?? 30
                return (
                  <tr key={tenant.id} style={{ opacity: busy ? 0.55 : 1 }}>
                    <td style={td}>
                      <div style={{ fontWeight: 500 }}>{tenant.name || 'ללא שם'}</div>
                      {isOwn && (
                        <span style={{
                          fontSize: 10, color: ink2, background: cream,
                          border: `1px solid ${line}`, borderRadius: 999,
                          padding: '2px 8px', display: 'inline-block', marginTop: 4,
                        }}>העסק שלך</span>
                      )}
                    </td>
                    <td style={td}>
                      <span style={{
                        fontSize: 11.5, fontWeight: 600, color: c.fg, background: c.bg,
                        border: `1px solid ${c.border}`, borderRadius: 999, padding: '4px 12px',
                      }}>{STATUS_HE[plan.status]}</span>
                    </td>
                    <td style={{ ...td, color: plan.daysRemaining !== null && plan.daysRemaining <= 7 ? '#9A5148' : ink }}>
                      {plan.daysRemaining !== null ? daysHe(plan.daysRemaining) : '—'}
                    </td>
                    <td style={{ ...td, color: ink2 }}>{fmtDate(tenant.trial_started_at)}</td>
                    <td style={{ ...td, color: ink2 }}>{fmtDate(tenant.trial_ends_at)}</td>
                    <td style={td}>{fmtPrice(tenant.plan_price)}</td>
                    <td style={{ ...td, color: ink2, fontSize: 12 }}>{tenant.signup_source || '—'}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        {EXTEND_PRESETS.map((d) => (
                          <button
                            key={d}
                            disabled={busy}
                            onClick={() => run(tenant.id, 'extend', d)}
                            style={{ ...btn, cursor: busy ? 'not-allowed' : 'pointer' }}
                            title={`הארכת ההתנסות ב-${daysHe(d)}`}
                          >+{d}</button>
                        ))}
                        <input
                          type="number" min={1} max={365} value={days}
                          disabled={busy}
                          onChange={(e) => setExtendDays((p) => ({ ...p, [tenant.id]: Number(e.target.value) }))}
                          style={{
                            width: 58, fontSize: 11.5, padding: '6px 8px', borderRadius: 10,
                            border: `1px solid ${line}`, fontFamily: 'inherit', textAlign: 'center',
                          }}
                          aria-label="מספר ימים להארכה"
                        />
                        <button
                          disabled={busy}
                          onClick={() => run(tenant.id, 'extend', days)}
                          style={{ ...btn, cursor: busy ? 'not-allowed' : 'pointer' }}
                        >הארכה</button>

                        <span style={{ width: 1, height: 20, background: line, margin: '0 2px' }} />

                        <button
                          disabled={busy || plan.rawStatus === 'active'}
                          onClick={() => run(tenant.id, 'activate')}
                          style={{
                            ...btn,
                            color: '#4E7A55', borderColor: '#D3E5D6', background: '#EDF4EE',
                            opacity: plan.rawStatus === 'active' ? 0.45 : 1,
                            cursor: busy || plan.rawStatus === 'active' ? 'not-allowed' : 'pointer',
                          }}
                        >הפעלה</button>
                        <button
                          disabled={busy || plan.rawStatus === 'paused'}
                          onClick={() => run(tenant.id, 'pause')}
                          style={{
                            ...btn,
                            color: '#5F5A6B', borderColor: '#DEDCE4', background: '#F1F0F4',
                            opacity: plan.rawStatus === 'paused' ? 0.45 : 1,
                            cursor: busy || plan.rawStatus === 'paused' ? 'not-allowed' : 'pointer',
                          }}
                        >השהיה</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: 11.5, color: ink2, marginTop: 16, lineHeight: 1.7 }}>
        הארכה מוסיפה ימים מהיום או מתאריך הסיום הקיים, לפי המאוחר מביניהם, ומחזירה
        את העסק למצב התנסות. הפעלה משאירה את תאריכי ההתנסות כפי שהם, כתיעוד.
        השהיה מעבירה למצב צפייה בלבד: העסק ממשיך לראות הכל, ודף ההזמנות הציבורי
        של הלקוחות שלו ממשיך לעבוד כרגיל.
      </p>
    </div>
  )
}
