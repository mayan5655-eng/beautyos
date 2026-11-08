'use client'

// app/dashboard/admin/ReferralActions.tsx
//
// The owner's one action on a referral: void it (a refund she gave in Grow, the same person under two businesses, abuse). Calls
// /api/admin/referrals, which checks the platform-admin gate on the server. A month already used stays used; nothing is deleted.
import { useState } from 'react'

export default function ReferralActions({ referralId }: { referralId: string }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const voidIt = async () => {
    if (busy) return
    const reason = window.prompt('לבטל את ההפניה ואת החודשים שעוד לא נוצלו? אפשר לכתוב סיבה (למשל: החזר כספי)', 'החזר כספי')
    if (reason === null) return
    setBusy(true)
    setMsg('')
    try {
      const r = await fetch('/api/admin/referrals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ referralId, action: 'void', reason }) })
      const j = await r.json().catch(() => null)
      setMsg(r.ok && j?.success ? 'בוטל' : j?.error || 'הפעולה נכשלה')
      if (r.ok && j?.success) setTimeout(() => window.location.reload(), 700)
    } finally {
      setBusy(false)
    }
  }
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <button type="button" disabled={busy} onClick={voidIt} style={{ minHeight: 36, padding: '6px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'inherit', fontWeight: 600, cursor: 'pointer' }}>ביטול התגמול</button>
      {msg && <span style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)' }}>{msg}</span>}
    </span>
  )
}
