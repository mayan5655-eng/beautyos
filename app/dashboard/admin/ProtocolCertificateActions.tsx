'use client'

// app/dashboard/admin/ProtocolCertificateActions.tsx — approve or reject one cosmetician certificate.
// Calls /api/admin/protocol-certificate, which checks the platform-admin gate on the server. Deletes nothing.
import { useState } from 'react'

export default function ProtocolCertificateActions({ tenantId, status }: { tenantId: string; status: string }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const call = async (next: 'approved' | 'rejected') => {
    if (busy) return
    setBusy(true)
    setMsg('')
    try {
      const r = await fetch('/api/admin/protocol-certificate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenantId, status: next }) })
      const j = await r.json().catch(() => null)
      if (r.ok && j?.success) window.location.reload()
      else setMsg(j?.error || 'הפעולה נכשלה')
    } finally {
      setBusy(false)
    }
  }
  const btn = { minHeight: 36, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'inherit', fontWeight: 600, cursor: 'pointer' } as const
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      {status !== 'approved' && <button type="button" disabled={busy} onClick={() => call('approved')} style={btn}>אישור</button>}
      {status !== 'rejected' && <button type="button" disabled={busy} onClick={() => call('rejected')} style={btn}>דחייה</button>}
      {msg && <span role="alert" style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)' }}>{msg}</span>}
    </span>
  )
}
