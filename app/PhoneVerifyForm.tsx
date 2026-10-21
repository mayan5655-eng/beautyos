'use client'

// app/PhoneVerifyForm.tsx
//
// Her mobile, then the 6-digit code from the SMS. One component for both places it is asked:
//   purpose 'signup'  on /signup, before the account exists: a correct code hands back { phone, ticket }
//   purpose 'verify'  on the in-app prompt (app/PhoneGate.tsx): a correct code attaches the number to her account
// All rules (limits, uniqueness, the Hebrew) are the server's (lib/phoneVerify/*); this only shows them.
// Pre-auth brand only: --brand-*, never her accent.

import { useEffect, useRef, useState } from 'react'
import Spinner from './Spinner'
import { phoneErrorHe } from '@/lib/phone'
import { ACCENT, CREAM, DEEP, MUTED, ACCENT_LINE_2 } from '@/lib/brand'

export type PhoneVerified = { phone: string; ticket?: string }

export default function PhoneVerifyForm({
  purpose,
  onVerified,
  submitLabel = 'שלחי לי קוד',
}: {
  purpose: 'signup' | 'verify'
  onVerified: (v: PhoneVerified) => void
  submitLabel?: string
}) {
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [stage, setStage] = useState<'phone' | 'code'>('phone')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [taken, setTaken] = useState(false)
  const [note, setNote] = useState('')
  const [resendIn, setResendIn] = useState(0)
  const [mock, setMock] = useState(false)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  useEffect(() => { if (stage === 'code') codeRef.current?.focus() }, [stage])

  async function post(path: string, body: Record<string, unknown>) {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, purpose }) })
    const data = await res.json().catch(() => ({}))
    return { res, data: data as Record<string, unknown> }
  }

  async function send(e?: React.FormEvent) {
    e?.preventDefault()
    setError(''); setTaken(false); setNote('')
    const bad = phoneErrorHe(phone)
    if (bad) { setError(bad); return }
    setLoading(true)
    try {
      const { res, data } = await post('/api/phone/send', { phone })
      if (res.ok && data.alreadyVerified) { onVerified({ phone }); return }
      if (!res.ok || !data.ok) {
        setTaken(data.code === 'taken')
        setError(String(data.error || 'משהו נתקע אצלנו. נסי שוב בעוד רגע.'))
        return
      }
      setMock(!!data.mock)
      setStage('code')
      setCode('')
      setResendIn(Number(data.resendInSec) || 60)
      setNote(stage === 'code' ? 'שלחנו קוד חדש.' : '')
    } catch {
      setError('אין חיבור כרגע. בדקי את האינטרנט ונסי שוב.')
    } finally {
      setLoading(false)
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setTaken(false); setNote('')
    const digits = code.replace(/\D/g, '')
    if (digits.length !== 6) { setError('הקוד הוא 6 ספרות, כפי שהגיע בהודעה.'); return }
    setLoading(true)
    try {
      const { res, data } = await post('/api/phone/verify', { phone, code: digits })
      if (!res.ok || !data.ok) {
        setTaken(data.code === 'taken')
        setError(String(data.error || 'משהו נתקע אצלנו. נסי שוב בעוד רגע.'))
        return
      }
      onVerified({ phone: String(data.phone || phone), ...(data.ticket ? { ticket: String(data.ticket) } : {}) })
    } catch {
      setError('אין חיבור כרגע. בדקי את האינטרנט ונסי שוב.')
    } finally {
      setLoading(false)
    }
  }

  const errorBox = error && (
    <div role="alert" style={errorStyle}>
      {error}
      {taken && (
        <div style={{ marginTop: 8, display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="/login" className="signup-link" style={linkStyle}>להתחברות</a>
          <a href="/login?forgot=1" className="signup-link" style={linkStyle}>איפוס סיסמה</a>
        </div>
      )}
    </div>
  )

  if (stage === 'phone') {
    return (
      <form onSubmit={send}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
            <label htmlFor="pv-phone" style={labelStyle}>טלפון נייד</label>
            <span style={hintStyle}>הקוד יגיע בהודעת SMS</span>
          </div>
          <input
            id="pv-phone"
            className="signup-input"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="050-1234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            dir="ltr"
            style={{ ...inputStyle, textAlign: 'right' }}
          />
        </div>
        {errorBox}
        <button type="submit" disabled={loading} className="signup-btn" style={buttonStyle(loading)}>
          {loading ? <Spinner inline label="שולחת קוד" /> : submitLabel}
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={verify}>
      <p style={{ ...hintStyle, fontSize: 'var(--t-md)', textAlign: 'center', margin: '0 0 12px', lineHeight: 1.7 }}>
        שלחנו קוד בן 6 ספרות אל <span dir="ltr" style={{ color: DEEP, fontWeight: 700 }}>{phone}</span>
      </p>
      {mock && (
        <p style={{ ...hintStyle, textAlign: 'center', margin: '0 0 12px' }}>מצב בדיקה: לא נשלח SMS אמיתי.</p>
      )}
      <div style={{ marginBottom: 14 }}>
        <label htmlFor="pv-code" style={labelStyle}>הקוד מההודעה</label>
        <input
          id="pv-code"
          ref={codeRef}
          className="signup-input"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={7}
          placeholder="______"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          dir="ltr"
          style={{ ...inputStyle, marginTop: 6, textAlign: 'center', letterSpacing: '0.4em', fontVariantNumeric: 'tabular-nums' }}
        />
      </div>
      {note && !error && <p role="status" style={{ ...hintStyle, textAlign: 'center', margin: '0 0 10px' }}>{note}</p>}
      {errorBox}
      <button type="submit" disabled={loading} className="signup-btn" style={buttonStyle(loading)}>
        {loading ? <Spinner inline label="בודקת" /> : 'אימות'}
      </button>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => send()} disabled={resendIn > 0 || loading} className="signup-link" style={textButtonStyle(resendIn > 0 || loading)}>
          {resendIn > 0 ? `קוד חדש בעוד ${resendIn} שניות` : 'שלחי לי קוד חדש'}
        </button>
        <button type="button" onClick={() => { setStage('phone'); setError(''); setTaken(false); setNote('') }} className="signup-link" style={textButtonStyle(false)}>
          שינוי מספר
        </button>
      </div>
    </form>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '13px 15px',
  border: `1px solid ${ACCENT_LINE_2}`,
  borderRadius: 'var(--r-sm)',
  fontSize: 'var(--t-lg)',
  boxSizing: 'border-box',
  background: CREAM,
  color: DEEP,
  outline: 'none',
  fontFamily: 'inherit',
}

const labelStyle: React.CSSProperties = { fontSize: 'var(--t-sm)', color: DEEP, fontWeight: 600, letterSpacing: '0.3px' }
const hintStyle: React.CSSProperties = { fontSize: 'var(--t-xs)', color: MUTED }

const errorStyle: React.CSSProperties = {
  color: '#B25B52',
  background: '#F7ECEA',
  border: '1px solid #EAD3CF',
  padding: 11,
  borderRadius: 'var(--r-sm)',
  marginBottom: 16,
  fontSize: 'var(--t-md)',
  textAlign: 'center',
  lineHeight: 1.6,
}

const linkStyle: React.CSSProperties = { color: ACCENT, fontWeight: 700, textDecoration: 'underline' }

const buttonStyle = (loading: boolean): React.CSSProperties => ({
  width: '100%',
  padding: 15,
  marginTop: 6,
  background: loading ? '#5B6B63' : DEEP,
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--r-sm)',
  fontSize: 'var(--t-lg)',
  fontWeight: 600,
  cursor: loading ? 'not-allowed' : 'pointer',
  opacity: loading ? 0.8 : 1,
  fontFamily: 'inherit',
  minHeight: 48,
})

const textButtonStyle = (disabled: boolean): React.CSSProperties => ({
  background: 'none',
  border: 'none',
  padding: '10px 4px',
  minHeight: 44,
  color: disabled ? MUTED : ACCENT,
  fontWeight: 700,
  fontFamily: 'inherit',
  fontSize: 'var(--t-sm)',
  cursor: disabled ? 'default' : 'pointer',
})
