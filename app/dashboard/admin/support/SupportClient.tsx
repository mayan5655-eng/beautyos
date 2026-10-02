'use client'

// app/dashboard/admin/support/SupportClient.tsx
// The support inbox UI. Presentation only, same rule as AdminClient.tsx:
// every action posts to /api/admin/support, which re-checks platform admin
// membership server-side.
//
// Hebrew, RTL, no em-dashes, second person feminine, matching the tenants panel.

import { useMemo, useState } from 'react'
import ChromeFlowerBg from '../../../ChromeFlowerBg'

export interface SupportMessageRow {
  id: string
  tenant_id: string
  tenant_name: string | null
  message: string
  tab: string | null
  app_version: string | null
  sentry_event_id: string | null
  created_at: string
  handled_at: string | null
}

const ink = '#3D3640'
const ink2 = '#6E6672'
const line = '#E7E2E4'
const surface = '#FFFFFF'
const cream = '#FBF9F8'

function fmtDateTime(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function daysSince(value: string): number {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 0
  return Math.floor((Date.now() - d.getTime()) / 86_400_000)
}

export default function SupportClient({ initialMessages }: { initialMessages: SupportMessageRow[] }) {
  const [messages, setMessages] = useState<SupportMessageRow[]>(initialMessages)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [showAll, setShowAll] = useState(false)

  const rows = useMemo(() => {
    const list = showAll ? messages : messages.filter((m) => !m.handled_at)
    return [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [messages, showAll])

  const unhandledCount = useMemo(() => messages.filter((m) => !m.handled_at).length, [messages])
  const staleCount = useMemo(
    () => messages.filter((m) => !m.handled_at && daysSince(m.created_at) >= 2).length,
    [messages]
  )

  async function toggleHandled(id: string, handled: boolean) {
    setBusyId(id)
    setError('')
    try {
      const res = await fetch('/api/admin/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, handled }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.message) {
        setError(data?.error || 'העדכון נכשל. נסי שוב.')
        return
      }
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, handled_at: data.message.handled_at } : m)))
    } catch {
      setError('העדכון נכשל. בדקי את החיבור ונסי שוב.')
    } finally {
      setBusyId(null)
    }
  }

  const btn: React.CSSProperties = {
    fontSize:"var(--t-sm)", fontWeight: 500, padding: '6px 14px', borderRadius:"var(--r-full)",
    border: `1px solid ${line}`, background: surface, color: ink,
    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  }

  return (
    <div style={{ direction: 'rtl', fontFamily: "'Heebo','Assistant',sans-serif", color: ink }}>
      <ChromeFlowerBg/>
      <div style={{ marginBottom: 22, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize:"var(--t-3xl)", fontWeight: 600, letterSpacing: '-0.01em', margin: 0 }}>
            פניות תמיכה
          </h1>
          <p style={{ fontSize:"var(--t-md)", color: ink2, marginTop: 6, lineHeight: 1.6 }}>
            כל הודעה שנכתבה דרך כפתור &quot;תקועה?&quot; - מי, מתי, מאיזה מסך, ומה היא כתבה.
          </p>
        </div>
        <a href="/dashboard/admin" style={{
          fontSize:"var(--t-sm)", fontWeight: 600, color: ink, background: surface,
          border: `1px solid ${line}`, borderRadius:"var(--r-full)", padding: '9px 16px',
          textDecoration: 'none', whiteSpace: 'nowrap',
        }}>→ ניהול מנויים</a>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ padding: '10px 16px', borderRadius:"var(--r-md)", background: staleCount ? '#FAEDEB' : cream, border: `1px solid ${staleCount ? '#EBD4D0' : line}`, minWidth: 96 }}>
          <div style={{ fontSize:"var(--t-xl)", fontWeight: 600, color: staleCount ? '#9A5148' : ink }}>{staleCount}</div>
          <div style={{ fontSize:"var(--t-xs)", color: staleCount ? '#9A5148' : ink2 }}>יומיים+ ללא טיפול</div>
        </div>
        <div style={{ padding: '10px 16px', borderRadius:"var(--r-md)", background: '#FBF3E2', border: '1px solid #EADFC4', minWidth: 96 }}>
          <div style={{ fontSize:"var(--t-xl)", fontWeight: 600, color: '#8A6A2F' }}>{unhandledCount}</div>
          <div style={{ fontSize:"var(--t-xs)", color: '#8A6A2F' }}>לא טופלו</div>
        </div>
        <div style={{ padding: '10px 16px', borderRadius:"var(--r-md)", background: cream, border: `1px solid ${line}`, minWidth: 96 }}>
          <div style={{ fontSize:"var(--t-xl)", fontWeight: 600 }}>{messages.length}</div>
          <div style={{ fontSize:"var(--t-xs)", color: ink2 }}>סך הכל</div>
        </div>
        <button onClick={() => setShowAll((v) => !v)} style={{ ...btn, alignSelf: 'center' }}>
          {showAll ? 'הצג רק לא טופלו' : 'הצג את כל ההיסטוריה'}
        </button>
      </div>

      {error && (
        <div style={{
          padding: '11px 15px', borderRadius:"var(--r-sm)", background: '#FAEDEB',
          border: '1px solid #EBD4D0', color: '#9A5148', fontSize:"var(--t-md)", marginBottom: 14,
        }}>{error}</div>
      )}

      {rows.length === 0 ? (
        <p style={{ fontSize:"var(--t-md)", color: ink2 }}>
          {showAll ? 'אין עדיין פניות תמיכה.' : 'אין פניות שממתינות לטיפול.'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((m) => {
            const busy = busyId === m.id
            const stale = !m.handled_at && daysSince(m.created_at) >= 2
            return (
              <div key={m.id} style={{
                background: surface, border: `1px solid ${stale ? '#EBD4D0' : line}`, borderRadius:"var(--r-lg)",
                padding: '14px 16px', opacity: busy ? 0.55 : 1,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                  <div>
                    <span style={{ fontSize:"var(--t-md)", fontWeight: 700, color: ink }}>{m.tenant_name || 'עסק ללא שם'}</span>
                    <span style={{ fontSize:"var(--t-sm)", color: ink2, marginRight: 10 }}>{fmtDateTime(m.created_at)}</span>
                    {stale && (
                      <span style={{ fontSize:"var(--t-xs)", fontWeight: 700, color: '#9A5148', background: '#FAEDEB', border: '1px solid #EBD4D0', borderRadius:"var(--r-full)", padding: '2px 9px', marginRight: 8 }}>
                        {daysSince(m.created_at)} ימים ללא מענה
                      </span>
                    )}
                  </div>
                  <button
                    disabled={busy}
                    onClick={() => toggleHandled(m.id, !m.handled_at)}
                    style={{
                      ...btn,
                      color: m.handled_at ? '#5F5A6B' : '#4E7A55',
                      borderColor: m.handled_at ? '#DEDCE4' : '#D3E5D6',
                      background: m.handled_at ? '#F1F0F4' : '#EDF4EE',
                      cursor: busy ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {m.handled_at ? `טופל ✓ (${fmtDateTime(m.handled_at)}) - בטל` : 'סמן כטופל'}
                  </button>
                </div>
                <p style={{ fontSize:"var(--t-md)", color: ink, lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: m.tab || m.app_version ? 8 : 0 }}>
                  {m.message}
                </p>
                {(m.tab || m.app_version) && (
                  <p style={{ fontSize:"var(--t-xs)", color: ink2 }}>
                    {m.tab && <>מסך: {m.tab}</>}
                    {m.tab && m.app_version && ' · '}
                    {m.app_version && <>גרסה: {m.app_version}</>}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
