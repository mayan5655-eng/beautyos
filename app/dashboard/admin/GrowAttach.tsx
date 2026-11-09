'use client'
// app/dashboard/admin/GrowAttach.tsx
//
// The "attach to business" control for each unmatched Grow onboarding update (GrowUnmatched.tsx). She searches a business by
// name, picks it, confirms, and the route (/api/admin/grow-onboarding) writes what a matched update writes. The server repeats
// every check; this file only collects the choice.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { searchTenants, type AttachRow, type AttachTenant } from '@/lib/grow/adminOnboarding'

function RowAttach({ row, tenants }: { row: AttachRow; tenants: AttachTenant[] }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<AttachTenant | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const matches = picked ? [] : searchTenants(tenants, q)

  const attach = async () => {
    if (!picked || busy) return
    setBusy(true)
    setMsg(null)
    try {
      const r = await fetch('/api/admin/grow-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updateId: row.id, tenantId: picked.id }),
      })
      const j = await r.json().catch(() => null)
      if (r.ok && j?.success) {
        setMsg({ ok: true, text: j.message || 'שויך' })
        router.refresh()
      } else {
        setMsg({ ok: false, text: j?.error || 'השיוך נכשל, אפשר לנסות שוב' })
      }
    } catch {
      setMsg({ ok: false, text: 'אין חיבור כרגע, אפשר לנסות שוב' })
    } finally {
      setBusy(false)
    }
  }

  const btn = { padding: '8px 12px', minHeight: 40, borderRadius: 'var(--r-sm)', border: '1px solid #D9D2C4', background: '#fff', color: '#1F3A30', fontWeight: 600, fontSize: 'var(--t-sm)', cursor: 'pointer', fontFamily: 'inherit' }
  const field = (label: string, value: string, ltr = false) =>
    value ? (
      <span style={{ whiteSpace: 'nowrap' }}>
        <span style={{ color: '#5C4F63' }}>{label}: </span>
        <b style={ltr ? { direction: 'ltr', unicodeBidi: 'isolate' } : undefined}>{value}</b>
      </span>
    ) : null

  return (
    <div data-testid="grow-unmatched-row" style={{ border: '1px solid #E4DED3', borderRadius: 'var(--r-md)', padding: '10px 12px', background: '#fff', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 'var(--t-sm)', color: '#1F3A30' }}>
        {field('התקבל', row.receivedAt)}
        {field('מזהה עסק', row.businessCode || 'לא נשלח', true)}
        {field('קוד מעקב', row.trackingCode || 'לא נשלח', true)}
        {field('שם העסק', row.businessTitle)}
        {field('שם', row.name)}
        {field('חבילה', row.packageName)}
        {field('סטטוס אצל Grow', row.statusWords)}
        {field('מפתח', row.hadKey ? 'נשלח (לא נשמר)' : 'לא נשלח')}
      </div>
      {!row.businessCode && (
        <p style={{ fontSize: 'var(--t-xs)', color: '#9A6B00', margin: 0 }}>בלי מזהה עסק אפשר לשייך רק את הסטטוס. החיבור עצמו יקרה כשיגיע עדכון עם מזהה.</p>
      )}
      {picked ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 'var(--t-sm)' }}>לשייך ל: <b>{picked.name || picked.id}</b></span>
          <button type="button" disabled={busy} onClick={attach} style={{ ...btn, background: '#1F3A30', color: '#FBF8F1', border: 'none', opacity: busy ? 0.6 : 1 }}>{busy ? 'משייכת…' : 'שיוך'}</button>
          <button type="button" disabled={busy} onClick={() => { setPicked(null); setMsg(null) }} style={btn}>החלפה</button>
        </div>
      ) : (
        <div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש עסק לפי שם" aria-label="חיפוש עסק לשיוך" style={{ width: '100%', maxWidth: 360, boxSizing: 'border-box', border: '1px solid #D9D2C4', borderRadius: 'var(--r-sm)', padding: '8px 10px', fontSize: 'var(--t-md)', fontFamily: 'inherit', minHeight: 40 }} />
          {matches.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6, maxWidth: 360 }}>
              {matches.map((t) => (
                <button key={t.id} type="button" onClick={() => { setPicked(t); setQ('') }} style={{ ...btn, textAlign: 'right' }}>{t.name || t.id}</button>
              ))}
            </div>
          )}
          {q.trim() && matches.length === 0 && <p style={{ fontSize: 'var(--t-xs)', color: '#5C4F63', marginTop: 6 }}>לא נמצא עסק בשם הזה.</p>}
        </div>
      )}
      {msg && <p role="status" style={{ fontSize: 'var(--t-sm)', margin: 0, color: msg.ok ? '#2F7D57' : '#B4453C' }}>{msg.text}</p>}
    </div>
  )
}

export default function GrowAttach({ rows, tenants }: { rows: AttachRow[]; tenants: AttachTenant[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((r) => <RowAttach key={r.id} row={r} tenants={tenants} />)}
    </div>
  )
}
