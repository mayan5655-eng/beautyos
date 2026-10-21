'use client'

// app/PhoneGate.tsx
//
// Asks a signed-in account to verify her mobile, over whatever screen she is on (the app, onboarding). The server
// decides (POST /api/phone/status, lib/phoneVerify/policy.ts decidePhoneGate):
//   none      renders nothing - the default, and the answer to every error
//   prompt    an account from before the rule: asked once per login, "אחר כך" always there, never locked out
//   required  an account created after the rule without a verified number (e.g. made around the signup page)
// The same call claims the number she verified on the signup page, so a phone-first signup never sees this at all.

import { useEffect, useState } from 'react'
import PhoneVerifyForm from './PhoneVerifyForm'
import { DEEP, MUTED, SURFACE, ACCENT, ACCENT_LINE } from '@/lib/brand'

type Gate = 'none' | 'prompt' | 'required'
const LATER_KEY = 'kl_phone_later'
const OK_KEY = 'kl_phone_ok'

export default function PhoneGate() {
  const [gate, setGate] = useState<Gate>('none')
  const [done, setDone] = useState(false)

  useEffect(() => {
    let alive = true
    // Verified once in this browser session: no need to ask the server on every screen load.
    try { if (sessionStorage.getItem(OK_KEY) === '1') return } catch { /* private mode */ }
    fetch('/api/phone/status', { method: 'POST' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d) return
        if (d.verified === true) { try { sessionStorage.setItem(OK_KEY, '1') } catch { /* fine */ } }
        const g: Gate = d.gate === 'required' || d.gate === 'prompt' ? d.gate : 'none'
        // "Later" lasts for this browser session: the next login asks again, as promised.
        let later = false
        try { later = sessionStorage.getItem(LATER_KEY) === '1' } catch { /* private mode */ }
        setGate(g === 'prompt' && later ? 'none' : g)
      })
      .catch(() => { /* never block on a failed check */ })
    return () => { alive = false }
  }, [])

  if (gate === 'none') return null

  function later() {
    try { sessionStorage.setItem(LATER_KEY, '1') } catch { /* fine */ }
    setGate('none')
  }

  async function signOut() {
    try {
      const { supabase } = await import('./supabase')
      await supabase.auth.signOut()
    } finally {
      window.location.href = '/login'
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="phone-gate-title" dir="rtl" style={backdrop}>
      <div style={card}>
        {done ? (
          <div role="status" style={{ textAlign: 'center' }}>
            <h2 id="phone-gate-title" style={title}>הנייד אומת 🌸</h2>
            <p style={text}>תודה! המספר מחובר עכשיו לחשבון שלך.</p>
            <button type="button" onClick={() => setGate('none')} style={primary}>המשך</button>
          </div>
        ) : (
          <>
            <h2 id="phone-gate-title" style={title}>אימות טלפון נייד</h2>
            <p style={{ ...text, marginBottom: 16 }}>
              {gate === 'required'
                ? 'כדי להיכנס לחשבון צריך לאמת את הנייד שלך. נשלח קוד בהודעת SMS, זה לוקח רגע.'
                : 'עוד צעד קטן: נאמת את הנייד שלך בקוד בהודעת SMS. כך כל חשבון מחובר למספר אחד, שלך.'}
            </p>
            <PhoneVerifyForm purpose="verify" submitLabel="שלחי לי קוד" onVerified={() => { try { sessionStorage.setItem(OK_KEY, '1') } catch { /* fine */ } setDone(true) }} />
            <div style={{ textAlign: 'center', marginTop: 10 }}>
              {gate === 'prompt' ? (
                <button type="button" onClick={later} style={quiet}>אחר כך</button>
              ) : (
                <button type="button" onClick={signOut} style={quiet}>יציאה מהחשבון</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const backdrop: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(31,58,48,0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflowY: 'auto',
  fontFamily: 'var(--sans)',
}
const card: React.CSSProperties = {
  background: SURFACE, borderRadius: 'var(--r-xl)', border: `1px solid ${ACCENT_LINE}`,
  boxShadow: 'var(--shadow-accent)', width: '100%', maxWidth: 400, padding: '28px 22px 20px', boxSizing: 'border-box',
}
const title: React.CSSProperties = {
  margin: '0 0 8px', color: DEEP, fontSize: 'var(--t-xl)', fontWeight: 600, textAlign: 'center',
  fontFamily: "'Frank Ruhl Libre', Georgia, serif",
}
const text: React.CSSProperties = { margin: 0, color: MUTED, fontSize: 'var(--t-md)', lineHeight: 1.7, textAlign: 'center' }
const primary: React.CSSProperties = {
  width: '100%', marginTop: 18, padding: 14, minHeight: 48, background: DEEP, color: '#fff', border: 'none',
  borderRadius: 'var(--r-sm)', fontSize: 'var(--t-lg)', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
}
const quiet: React.CSSProperties = {
  background: 'none', border: 'none', color: ACCENT, fontWeight: 700, fontFamily: 'inherit',
  fontSize: 'var(--t-sm)', padding: '10px 8px', minHeight: 44, cursor: 'pointer',
}
