'use client'

// app/dashboard/admin/BillingActions.tsx
//
// The two owner actions on one subscription row: "mark paid manually" (a client who paid her directly) and "set price" (349 launch or 499 regular).
// Each calls /api/admin/billing, which checks the platform-admin gate on the server. Nothing here deletes anything.
import { useState } from 'react'

export default function BillingActions({ tenantId, price }: { tenantId: string; price: number }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [newPrice, setNewPrice] = useState(String(price))

  const call = async (body: Record<string, unknown>, ok: string) => {
    if (busy) return
    setBusy(true)
    setMsg('')
    try {
      const r = await fetch('/api/admin/billing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenantId, ...body }) })
      const j = await r.json().catch(() => null)
      setMsg(r.ok && j?.success ? ok : j?.error || 'הפעולה נכשלה')
      if (r.ok && j?.success) setTimeout(() => window.location.reload(), 700)
    } finally {
      setBusy(false)
    }
  }

  const btn = { minHeight: 36, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'inherit', fontWeight: 600, cursor: 'pointer' } as const
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <button type="button" style={btn} disabled={busy} onClick={() => { if (window.confirm('לסמן שהעסק שילם ישירות? זה מאריך את התקופה בחודש ומשחרר חסימה.')) call({ action: 'mark-paid' }, 'סומן כשולם') }}>סימון כשולם ידנית</button>
      <input value={newPrice} onChange={(e) => setNewPrice(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" aria-label="מחיר חודשי" style={{ width: 64, minHeight: 36, borderRadius: 8, border: '1px solid var(--line-2)', padding: '0 8px', fontFamily: 'inherit', direction: 'ltr' }} />
      <button type="button" style={btn} disabled={busy || !(Number(newPrice) > 0) || Number(newPrice) === price} onClick={() => call({ action: 'set-price', price: Number(newPrice) }, 'המחיר עודכן')}>עדכון מחיר</button>
      {msg && <span style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)' }}>{msg}</span>}
    </div>
  )
}
