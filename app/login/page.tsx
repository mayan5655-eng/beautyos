'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '../supabase'
import FloralCorners from '../FloralCorners'

// === BloomOS pre-auth styling ===
// Pre-auth pages carry the BLOOMOS BRAND, never a tenant accent: there is no
// tenant until after login. Every value below therefore reads --brand-*, never
// --pc-*. Literal fallbacks keep the page correct if the stylesheet is slow.
//
// Palette is sampled from the logo: deep purple wordmark, purple-to-pink "OS",
// watercolor florals in lilac, rose and blush.
const ACCENT = 'var(--brand-accent, #4A2E5A)'   // deep purple
const ROSE = 'var(--brand-rose, #D28697)'       // pink
const LILAC = 'var(--brand-lilac, #BB84A7)'     // lilac florals
const BLUSH = 'var(--brand-blush, #FADDCF)'     // blush florals
const CREAM = 'var(--brand-cream, #FEFAF7)'     // page background
const TINT = 'var(--brand-tint, #EDE4F5)'       // lavender wash
const SURFACE = 'var(--brand-surface, #FAF6FC)' // card
const MUTED = 'var(--brand-muted, #98879B)'     // taglines
const CONTRAST = 'var(--brand-contrast, #FFFFFF)'
const GRAD = 'var(--brand-grad, linear-gradient(135deg, #4A2E5A 0%, #D28697 100%))'

// Alpha shades derived from --brand-accent #4A2E5A / --brand-deep #301848.
// Written literally because inline styles cannot take the alpha of a var().
const ACCENT_LINE = 'rgba(74,46,90,0.14)'
const ACCENT_LINE_2 = 'rgba(74,46,90,0.18)'
const ACCENT_RING = 'rgba(74,46,90,0.16)'
const DEEP_SHADOW = 'rgba(48,24,72,0.22)'

// Single place to swap the logo. Full lockup: florals, wordmark and tagline,
// transparent, 760x394. Intrinsic dimensions are passed to next/image and the
// rendered width is capped in CSS, so the aspect ratio is never squashed.
const LOGO_SRC = '/bloomos-logo-full.png'
const LOGO_W = 760
const LOGO_H = 394

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '13px 15px', marginBottom: 12,
  border: `1px solid ${ACCENT_LINE_2}`,
  borderRadius: 14, fontSize: 15, boxSizing: 'border-box', background: CREAM,
  color: 'var(--brand-deep, #301848)', outline: 'none', fontFamily: 'inherit',
  transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
}
const textLinkStyle: React.CSSProperties = {
  // Purple, not pink: pink on cream is 2.66:1 and fails AA. Purple is 11.1:1.
  background: 'none', border: 'none', color: ACCENT, fontSize: 13.5, cursor: 'pointer',
  textDecoration: 'underline', padding: 0, fontFamily: 'inherit', fontWeight: 600,
}
function noticeStyle(kind: 'error' | 'ok'): React.CSSProperties {
  return {
    color: kind === 'error' ? '#B25B52' : '#2E7D50',
    background: kind === 'error' ? '#F9EFEE' : '#EEF5F0',
    border: `1px solid ${kind === 'error' ? '#EBD5D2' : '#D4E7DB'}`,
    padding: 11, borderRadius: 12, marginBottom: 16, fontSize: 13.5, textAlign: 'center',
  }
}
function btnStyle(loading: boolean): React.CSSProperties {
  return {
    width: '100%', padding: 15, color: CONTRAST, border: 'none', borderRadius: 14,
    // Text sits over the purple end of the gradient: 11.5:1.
    background: loading ? 'linear-gradient(135deg, #8C7396 0%, #E0B3BE 100%)' : GRAD,
    fontSize: 15.5, fontWeight: 600, letterSpacing: '1px', fontFamily: 'inherit',
    cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.85 : 1,
    boxShadow: `0 14px 30px -14px ${DEEP_SHADOW}`,
    transition: 'transform 0.15s, box-shadow 0.15s',
  }
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'login' | 'forgot'>('login')
  const [resetNotice, setResetNotice] = useState('')
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError('אימייל או סיסמה שגויים')
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setResetNotice('')

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    setLoading(false)
    if (error) {
      setError('שליחת הקישור נכשלה. נסה/י שוב.')
    } else {
      // Neutral message either way, so we don't reveal whether the email exists.
      setResetNotice('אם קיים חשבון עם כתובת זו, נשלח אליו קישור לאיפוס הסיסמה.')
    }
  }

  function showForgot() {
    setMode('forgot')
    setError('')
    setResetNotice('')
    setPassword('')
  }

  function showLogin() {
    setMode('login')
    setError('')
    setResetNotice('')
  }

  return (
    <div dir="rtl" style={{
      position: 'relative', zIndex: 0, overflow: 'hidden', minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 20px 40px',
      // Cream page lifting to a soft lavender halo behind the card.
      background: `radial-gradient(120% 90% at 50% 22%, ${CREAM} 0%, ${CREAM} 38%, ${TINT} 100%)`,
      fontFamily: 'var(--sans)',
    }}>
      {/* Retinted to the logo: blush petals, lilac accents. The component
          already accepts these, so nothing inside it changes. */}
      <FloralCorners idPrefix="auth" blush="#FADDCF" gold="#BB84A7" opacity={0.9} />
      <style>{`
        @keyframes authIn { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: translateY(0) } }
        .auth-card { animation: authIn 0.4s ease-out; }
        .auth-input:focus { border-color: ${ACCENT} !important; background: #fff !important; box-shadow: 0 0 0 3px ${ACCENT_RING} !important; }
        .auth-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 18px 36px -14px ${DEEP_SHADOW}; }
        .auth-link:hover { text-decoration: underline; }
      `}</style>

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 400 }}>
        {/* Sits fully above the card, NOT overlapping it: the lockup ends in
            the Hebrew tagline, which a negative margin would crop. */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22 }}>
          <Image
            src={LOGO_SRC}
            alt="BloomOS — המערכת שמצמיחה את הקליניקה שלך"
            width={LOGO_W}
            height={LOGO_H}
            priority
            style={{
              width: 'min(300px, 84%)', height: 'auto',
              filter: 'drop-shadow(0 10px 22px rgba(48,24,72,0.16))',
            }}
          />
        </div>

        <div className="auth-card" style={{
          background: SURFACE, padding: '38px 40px 42px',
          borderRadius: 28,
          boxShadow: `0 26px 64px -32px ${DEEP_SHADOW}, 0 4px 14px rgba(48,24,72,0.05)`,
          border: `1px solid ${ACCENT_LINE}`,
        }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <p style={{ margin: 0, color: MUTED, fontSize: 11, letterSpacing: '2.5px', fontWeight: 600 }}>
              {mode === 'login' ? 'כניסה לחשבון' : 'איפוס סיסמה'}
            </p>
            {/* Hairline rule with a small rose glyph, echoing the lotus mark
                above the wordmark in the logo. */}
            <div aria-hidden style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
              <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg, transparent, ${ACCENT_LINE_2})` }} />
              <span style={{ color: ROSE, fontSize: 12, lineHeight: 1 }}>✦</span>
              <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${ACCENT_LINE_2}, transparent)` }} />
            </div>
          </div>

          <form onSubmit={mode === 'login' ? handleLogin : handleForgot}>
            <input
              className="auth-input"
              type="email"
              placeholder="אימייל"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ ...inputStyle, direction: 'ltr', textAlign: 'right' }}
            />
            {mode === 'login' && (
              <input
                className="auth-input"
                type="password"
                placeholder="סיסמה"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ ...inputStyle, marginBottom: 16 }}
              />
            )}

            {error && <div style={noticeStyle('error')}>{error}</div>}
            {resetNotice && <div style={noticeStyle('ok')}>{resetNotice}</div>}

            <button type="submit" disabled={loading} className="auth-btn" style={btnStyle(loading)}>
              {mode === 'login'
                ? (loading ? 'מתחבר...' : 'כניסה')
                : (loading ? 'שולח...' : 'שליחת קישור לאיפוס')}
            </button>
          </form>

          <div style={{ marginTop: 18, textAlign: 'center' }}>
            {mode === 'login' ? (
              <button type="button" onClick={showForgot} className="auth-link" style={textLinkStyle}>
                שכחת סיסמה?
              </button>
            ) : (
              <button type="button" onClick={showLogin} className="auth-link" style={textLinkStyle}>
                חזרה לכניסה
              </button>
            )}
          </div>

          {mode === 'login' && (
            <p style={{ marginTop: 16, textAlign: 'center', fontSize: 13.5, color: MUTED }}>
              אין לך חשבון?{' '}
              <a href="/signup" className="auth-link" style={{ color: ACCENT, fontWeight: 700, textDecoration: 'none' }}>
                הירשמי
              </a>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
