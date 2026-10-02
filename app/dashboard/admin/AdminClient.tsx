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
import { ConfirmDialog } from '../../MiniToast'
import type { InstanceState } from '@/lib/greenApi/health'
import ChromeFlowerBg from '../../ChromeFlowerBg'

export interface AdminTenantRow {
  id: string
  name: string | null
  plan_status: string | null
  trial_started_at: string | null
  trial_ends_at: string | null
  plan_price: number | string | null
  signup_source: string | null
  // Everything below only exists when platform_tenant_metrics() is live
  // (supabase/migrations/pending/platform-admin-view.sql). Optional so the
  // plain-tenants fallback in page.tsx still satisfies this type without
  // a second interface, and the UI treats an absent field as "unknown", not
  // as zero - a tenant who genuinely has never spent a cent must read the
  // same as one this panel simply cannot see the number for yet.
  client_count?: number | null
  appointment_count?: number | null
  last_activity_at?: string | null
  setup_score?: number | null
  setup_total?: number | null
  ai_cost_usd_30d?: number | string | null
  whatsapp_sent_30d?: number | null
  whatsapp_failed_30d?: number | null
}

type Action = 'extend' | 'activate' | 'pause'

const STATUS_HE: Record<PlanStatus, string> = {
  trial: 'בהתנסות',
  active: 'פעיל',
  expired: 'הסתיים',
  paused: 'בהשהיה',
}

// Muted, Kalmea-ish palette. Expired and paused read as calm states, not
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

function fmtUsd(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : '—'
}

function fmtCount(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : value.toLocaleString('he-IL')
}

/** Days since a timestamp, for "how long has it been quiet" colouring. null
 *  when there is nothing to measure yet (a genuinely absent value, not zero). */
function daysSince(value: string | null | undefined): number | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / 86_400_000)
}

function fmtActivity(value: string | null | undefined): string {
  const days = daysSince(value)
  if (days === null) return '—'
  if (days <= 0) return 'היום'
  if (days === 1) return 'אתמול'
  return `לפני ${days} ימים`
}

export default function AdminClient({
  initialTenants,
  ownTenantId,
  metricsAvailable,
  greenApiState,
}: {
  initialTenants: AdminTenantRow[]
  ownTenantId: string | null
  /** False when platform_tenant_metrics() has not been applied yet (see
   *  page.tsx's fallback) - the extra columns are hidden rather than shown
   *  full of dashes, so the panel reads as "not built yet" and not "broken". */
  metricsAvailable: boolean
  /** Checked live on every load - see page.tsx's own comment on why this
   *  can't be a WhatsApp alert: a message about WhatsApp being down is
   *  exactly the message that wouldn't arrive either. */
  greenApiState: InstanceState
}) {
  const [tenants, setTenants] = useState<AdminTenantRow[]>(initialTenants)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  // These actions change what another business can do with its own account, so
  // they ask first. window.confirm did that, but as an unstyled LTR system
  // dialog that renders the Hebrew question and the "this is your own business"
  // warning as one run-on line with no emphasis on the part that matters.
  const [pending, setPending] = useState<
    { tenantId: string; action: Action; days?: number; question: string; own: boolean } | null
  >(null)
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
    const own = tenantId === ownTenantId && action !== 'activate'

    setPending({ tenantId, action, days, question, own })
  }

  async function doRun() {
    if (!pending) return
    const { tenantId, action, days } = pending
    // Resolved here rather than carried on `pending`: the row is the source of
    // truth for the name, and it may have been renamed since the dialog opened.
    const label = tenants.find((t) => t.id === tenantId)?.name || 'העסק'
    setPending(null)

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
    textAlign: 'right', fontSize:"var(--t-xs)", fontWeight: 600, color: ink2,
    letterSpacing: '0.3px', padding: '10px 12px', whiteSpace: 'nowrap',
    borderBottom: `1px solid ${line}`,
  }
  const td: React.CSSProperties = {
    fontSize:"var(--t-md)", color: ink, padding: '13px 12px', verticalAlign: 'middle',
    borderBottom: `1px solid ${line}`,
  }
  const btn: React.CSSProperties = {
    fontSize:"var(--t-sm)", fontWeight: 500, padding: '6px 12px', borderRadius:"var(--r-full)",
    border: `1px solid ${line}`, background: surface, color: ink,
    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  }

  // Loud on purpose, and first on the page: this is checked live against
  // GreenAPI itself (not our own database) every time this page loads. A
  // false here means every automated WhatsApp in the product - reminders,
  // confirmations, receipts, review requests, the nightly ops alert, all of
  // it - is being silently swallowed, because GreenAPI's /sendMessage
  // returns 200 regardless of whether the session behind it is logged in.
  const greenApiDown = !greenApiState.ok || !greenApiState.authorized

  return (
    <div style={{ direction: 'rtl', fontFamily: "'Heebo','Assistant',sans-serif", color: ink }}>
      <ChromeFlowerBg/>
      {greenApiDown && (
        <div style={{
          padding: '16px 20px', borderRadius:"var(--r-md)", background: '#FAEDEB',
          border: '2px solid #9A5148', marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <span style={{ fontSize:"var(--t-2xl)", flexShrink: 0 }}>⚠</span>
          <div>
            <p style={{ fontSize:"var(--t-lg)", fontWeight: 700, color: '#9A5148', marginBottom: 4 }}>
              וואטסאפ לא מחובר - שום הודעה אוטומטית לא יוצאת בפועל
            </p>
            <p style={{ fontSize:"var(--t-sm)", color: '#9A5148', lineHeight: 1.6 }}>
              {greenApiState.ok
                ? `GreenAPI מחזירה stateInstance = "${greenApiState.stateInstance}" (לא authorized). תזכורות, אישורי תור, קבלות, בקשות ביקורת וההתראה היומית - כולן "נשלחות" בלוג אבל לא מגיעות, עד שהחיבור יתחדש בקונסולת GreenAPI.`
                : `הבדיקה עצמה נכשלה: ${greenApiState.error}`}
            </p>
          </div>
        </div>
      )}
      <div style={{ marginBottom: 22, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize:"var(--t-3xl)", fontWeight: 600, letterSpacing: '-0.01em', margin: 0 }}>
            ניהול מנויים
          </h1>
          <p style={{ fontSize:"var(--t-md)", color: ink2, marginTop: 6, lineHeight: 1.6 }}>
            כל העסקים במערכת, מצב המנוי שלהם והפעולות הזמינות. שינוי כאן משפיע מיד על
            מה שהעסק יכול לעשות. שום פעולה כאן לא מוחקת נתונים.
          </p>
        </div>
        <a href="/dashboard/admin/support" style={{
          fontSize:"var(--t-sm)", fontWeight: 600, color: ink, background: surface,
          border: `1px solid ${line}`, borderRadius:"var(--r-full)", padding: '9px 16px',
          textDecoration: 'none', whiteSpace: 'nowrap',
        }}>פניות תמיכה ←</a>
      </div>

      {!metricsAvailable && (
        <div style={{
          padding: '11px 15px', borderRadius:"var(--r-sm)", background: '#FBF3E2',
          border: '1px solid #EADFC4', color: '#8A6A2F', fontSize:"var(--t-sm)", marginBottom: 16, lineHeight: 1.6,
        }}>
          נתוני שימוש (לקוחות, תורים, פעילות אחרונה, הגדרה, עלות AI, וואטסאפ) עדיין לא זמינים -
          המיגרציה platform-admin-view.sql לא הורצה עדיין. ניהול המנויים למטה עובד כרגיל.
        </div>
      )}

      {/* Summary */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        {(['expired', 'paused', 'trial', 'active'] as PlanStatus[]).map((s) => (
          <div key={s} style={{
            padding: '10px 16px', borderRadius:"var(--r-md)", background: STATUS_COLOR[s].bg,
            border: `1px solid ${STATUS_COLOR[s].border}`, minWidth: 96,
          }}>
            <div style={{ fontSize:"var(--t-xl)", fontWeight: 600, color: STATUS_COLOR[s].fg }}>
              {counts[s]}
            </div>
            <div style={{ fontSize:"var(--t-xs)", color: STATUS_COLOR[s].fg, opacity: 0.85 }}>
              {STATUS_HE[s]}
            </div>
          </div>
        ))}
        <div style={{
          padding: '10px 16px', borderRadius:"var(--r-md)", background: cream,
          border: `1px solid ${line}`, minWidth: 96,
        }}>
          <div style={{ fontSize:"var(--t-xl)", fontWeight: 600 }}>{rows.length}</div>
          <div style={{ fontSize:"var(--t-xs)", color: ink2 }}>סך הכל</div>
        </div>
      </div>

      {notice && (
        <div style={{
          padding: '11px 15px', borderRadius:"var(--r-sm)", background: '#EDF4EE',
          border: '1px solid #D3E5D6', color: '#4E7A55', fontSize:"var(--t-md)", marginBottom: 14,
        }}>{notice}</div>
      )}
      {error && (
        <div style={{
          padding: '11px 15px', borderRadius:"var(--r-sm)", background: '#FAEDEB',
          border: '1px solid #EBD4D0', color: '#9A5148', fontSize:"var(--t-md)", marginBottom: 14,
        }}>{error}</div>
      )}

      {rows.length === 0 ? (
        <p style={{ fontSize:"var(--t-md)", color: ink2 }}>אין עדיין עסקים במערכת.</p>
      ) : (
        <div style={{
          overflowX: 'auto', background: surface, borderRadius:"var(--r-lg)",
          border: `1px solid ${line}`,
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: metricsAvailable ? 1300 : 900 }}>
            <thead>
              <tr style={{ background: cream }}>
                <th style={th}>עסק</th>
                <th style={th}>מצב</th>
                <th style={th}>נותרו</th>
                <th style={th}>תחילת התנסות</th>
                <th style={th}>סיום התנסות</th>
                <th style={th}>מחיר</th>
                <th style={th}>מקור</th>
                {metricsAvailable && (<>
                  <th style={th}>לקוחות</th>
                  <th style={th}>תורים</th>
                  <th style={th}>פעילות אחרונה</th>
                  <th style={th}>הגדרה</th>
                  <th style={th} title="עלות Claude ותמונות AI, 30 יום אחרונים">AI (30 יום)</th>
                  <th style={th} title="הודעות וואטסאפ שנשלחו/נכשלו, 30 יום אחרונים">וואטסאפ (30 יום)</th>
                </>)}
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
                          fontSize:"var(--t-sm)", color: ink2, background: cream,
                          border: `1px solid ${line}`, borderRadius:"var(--r-full)",
                          padding: '2px 8px', display: 'inline-block', marginTop: 4,
                        }}>העסק שלך</span>
                      )}
                    </td>
                    <td style={td}>
                      <span style={{
                        fontSize:"var(--t-sm)", fontWeight: 600, color: c.fg, background: c.bg,
                        border: `1px solid ${c.border}`, borderRadius:"var(--r-full)", padding: '4px 12px',
                      }}>{STATUS_HE[plan.status]}</span>
                    </td>
                    <td style={{ ...td, color: plan.daysRemaining !== null && plan.daysRemaining <= 7 ? '#9A5148' : ink }}>
                      {plan.daysRemaining !== null ? daysHe(plan.daysRemaining) : '—'}
                    </td>
                    <td style={{ ...td, color: ink2 }}>{fmtDate(tenant.trial_started_at)}</td>
                    <td style={{ ...td, color: ink2 }}>{fmtDate(tenant.trial_ends_at)}</td>
                    <td style={td}>{fmtPrice(tenant.plan_price)}</td>
                    <td style={{ ...td, color: ink2, fontSize:"var(--t-sm)" }}>{tenant.signup_source || '—'}</td>
                    {metricsAvailable && (<>
                      <td style={td}>{fmtCount(tenant.client_count)}</td>
                      <td style={td}>{fmtCount(tenant.appointment_count)}</td>
                      <td style={{ ...td, color: (daysSince(tenant.last_activity_at) ?? 0) > 14 ? '#9A5148' : ink2 }}>
                        {fmtActivity(tenant.last_activity_at)}
                      </td>
                      <td style={td}>
                        {tenant.setup_score == null || tenant.setup_total == null ? '—' : (
                          <span style={{ color: tenant.setup_score < tenant.setup_total ? '#8A6A2F' : '#4E7A55', fontWeight: 600 }}>
                            {tenant.setup_score}/{tenant.setup_total}
                          </span>
                        )}
                      </td>
                      <td style={td}>{fmtUsd(tenant.ai_cost_usd_30d)}</td>
                      <td style={td}>
                        {tenant.whatsapp_sent_30d == null && tenant.whatsapp_failed_30d == null ? '—' : (
                          <>
                            {fmtCount(tenant.whatsapp_sent_30d)}
                            {!!tenant.whatsapp_failed_30d && (
                              <span style={{ color: '#9A5148', fontWeight: 600 }}> · {tenant.whatsapp_failed_30d} נכשלו</span>
                            )}
                          </>
                        )}
                      </td>
                    </>)}
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
                            width: 58, fontSize:"var(--t-sm)", padding: '6px 8px', borderRadius:"var(--r-sm)",
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

      <p style={{ fontSize:"var(--t-sm)", color: ink2, marginTop: 16, lineHeight: 1.7 }}>
        הארכה מוסיפה ימים מהיום או מתאריך הסיום הקיים, לפי המאוחר מביניהם, ומחזירה
        את העסק למצב התנסות. הפעלה משאירה את תאריכי ההתנסות כפי שהם, כתיעוד.
        השהיה מעבירה למצב צפייה בלבד: העסק ממשיך לראות הכל, ודף ההזמנות הציבורי
        של הלקוחות שלו ממשיך לעבוד כרגיל.
      </p>

      <ConfirmDialog
        open={!!pending}
        title={pending?.question || ''}
        message={pending?.own ? 'שימי לב: זה העסק שלך. הפעולה תשפיע על החשבון שאת עובדת בו עכשיו.' : undefined}
        confirmText="אישור"
        danger={pending?.action !== 'activate'}
        busy={!!busyId}
        onConfirm={doRun}
        onCancel={() => setPending(null)}
      />
    </div>
  )
}
