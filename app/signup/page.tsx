'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '../supabase'
import FloralCorners from '../FloralCorners'

// Pre-auth page: carries the BLOOMOS BRAND, never a tenant accent. There is no
// tenant until after signup, so every value reads --brand-*, never --pc-*.
const ACCENT = 'var(--brand-accent, #4A2E5A)'
const ROSE = 'var(--brand-rose, #D28697)'
const CREAM = 'var(--brand-cream, #FEFAF7)'
const TINT = 'var(--brand-tint, #EDE4F5)'
const SURFACE = 'var(--brand-surface, #FAF6FC)'
const MUTED = 'var(--brand-muted, #98879B)'
const DEEP = 'var(--brand-deep, #301848)'
const GRAD = 'var(--brand-grad, linear-gradient(135deg, #4A2E5A 0%, #D28697 100%))'

// Alpha shades of --brand-accent / --brand-deep. Written literally because
// inline styles cannot take the alpha channel of a var().
const ACCENT_LINE = 'rgba(74,46,90,0.14)'
const ACCENT_LINE_2 = 'rgba(74,46,90,0.18)'
const ACCENT_RING = 'rgba(74,46,90,0.16)'
const DEEP_SHADOW = 'rgba(48,24,72,0.22)'

// Matches /login. Full lockup: florals, wordmark, tagline. 760x394.
const LOGO_SRC = '/bloomos-logo-full.png'
const LOGO_W = 760
const LOGO_H = 394

export default function SignupPage() {
  const [businessName, setBusinessName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('הסיסמאות לא תואמות')
      return
    }

    if (password.length < 6) {
      setError('הסיסמה חייבת להיות לפחות 6 תווים')
      return
    }

    if (!businessName.trim()) {
      setError('יש להזין שם עסק')
      return
    }

    setLoading(true)

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          business_name: businessName.trim(),
        },
      },
    })

    if (error) {
      if (error.message.includes('already registered')) {
        setError('האימייל כבר רשום במערכת')
      } else {
        setError('שגיאה בהרשמה: ' + error.message)
      }
      setLoading(false)
      return
    }

    if (data.user) {
      router.push('/onboarding')
      router.refresh()
    }
  }

  return (
    <div dir="rtl" style={pageStyle}>
      <FloralCorners idPrefix="signup" />

      <style>{`
        @keyframes signupIn { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: translateY(0) } }
        .signup-card { animation: signupIn 0.4s ease-out; }
        .signup-input:focus {
          border-color: ${ACCENT} !important;
          background: #fff !important;
          box-shadow: 0 0 0 3px ${ACCENT_RING} !important;
        }
        .signup-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 18px 36px -14px ${DEEP_SHADOW}; }
        .signup-link:hover { text-decoration: underline; }
      `}</style>

      <div className="signup-card" style={cardStyle}>
        {/* Brand — the logo lockup already carries the wordmark and tagline. */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22 }}>
          <Image
            src={LOGO_SRC}
            alt="BloomOS — המערכת שמצמיחה את הקליניקה שלך"
            width={LOGO_W}
            height={LOGO_H}
            priority
            style={logoStyle}
          />
        </div>

        {/* Welcome */}
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <h2 style={welcomeTitleStyle}>נעים להכיר 🌸</h2>
          <p style={welcomeSubtitleStyle}>
            פתחי את חשבון היופי שלך — כל מה שצריך לניהול העסק, במקום אחד.
          </p>
          {/* Hairline with a rose glyph, echoing the lotus mark in the logo.
              Matches the same divider on /login. */}
          <div aria-hidden style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
            <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg, transparent, ${ACCENT_LINE_2})` }} />
            <span style={{ color: ROSE, fontSize: 12, lineHeight: 1 }}>✦</span>
            <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${ACCENT_LINE_2}, transparent)` }} />
          </div>
        </div>

        <form onSubmit={handleSignup}>
          <Field label="שם העסק">
            <input
              className="signup-input"
              type="text"
              placeholder="למשל: סטודיו רונית"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              required
              style={inputStyle}
            />
          </Field>

          <Field label="אימייל">
            <input
              className="signup-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ ...inputStyle, direction: 'ltr', textAlign: 'right' }}
            />
          </Field>

          <Field label="סיסמה" hint="לפחות 6 תווים">
            <input
              className="signup-input"
              type="password"
              placeholder="בחרי סיסמה"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              style={inputStyle}
            />
          </Field>

          <Field label="אישור סיסמה">
            <input
              className="signup-input"
              type="password"
              placeholder="הקלידי שוב את הסיסמה"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              style={inputStyle}
            />
          </Field>

          {error && <div style={errorStyle}>{error}</div>}

          <button type="submit" disabled={loading} className="signup-btn" style={buttonStyle(loading)}>
            {loading ? 'יוצרת חשבון...' : 'הרשמה'}
          </button>

          <p style={footerStyle}>
            כבר יש לך חשבון?{' '}
            <a href="/login" className="signup-link" style={linkStyle}>
              התחברי
            </a>
          </p>
        </form>
      </div>
    </div>
  )
}

// === Sub-component ===
function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <label style={labelStyle}>{label}</label>
        {hint && <span style={hintStyle}>{hint}</span>}
      </div>
      {children}
    </div>
  )
}

// === Styles (premium BloomOS aesthetic — matches /book + /skin-scan) ===
const pageStyle: React.CSSProperties = {
  position: 'relative',
  zIndex: 0,
  overflow: 'hidden',
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: `radial-gradient(120% 90% at 50% 22%, ${CREAM} 0%, ${CREAM} 38%, ${TINT} 100%)`,
  fontFamily: 'var(--sans)',
  padding: 20,
}

const cardStyle: React.CSSProperties = {
  position: 'relative',
  zIndex: 1,
  background: SURFACE,
  padding: '38px 40px 42px',
  borderRadius: 28,
  boxShadow: `0 26px 64px -32px ${DEEP_SHADOW}, 0 4px 14px rgba(48,24,72,0.05)`,
  border: `1px solid ${ACCENT_LINE}`,
  width: '100%',
  maxWidth: 430,
}

const logoStyle: React.CSSProperties = {
  width: 'min(280px, 84%)',
  height: 'auto',
  filter: 'drop-shadow(0 10px 22px rgba(48,24,72,0.16))',
}

const welcomeTitleStyle: React.CSSProperties = {
  margin: '0 0 6px 0',
  color: DEEP,
  fontSize: 22,
  fontWeight: 600,
  letterSpacing: '0.3px',
  fontFamily: "'Frank Ruhl Libre', Georgia, serif",
}

const welcomeSubtitleStyle: React.CSSProperties = {
  margin: 0,
  color: MUTED,
  fontSize: 13.5,
  lineHeight: 1.7,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '13px 15px',
  border: `1px solid ${ACCENT_LINE_2}`,
  borderRadius: 12,
  fontSize: 15,
  boxSizing: 'border-box',
  background: CREAM,
  color: DEEP,
  outline: 'none',
  fontFamily: 'inherit',
  transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: DEEP,
  fontWeight: 600,
  letterSpacing: '0.3px',
}

const hintStyle: React.CSSProperties = {
  fontSize: 11,
  color: MUTED,
}

const errorStyle: React.CSSProperties = {
  color: '#B25B52',
  background: '#F7ECEA',
  border: '1px solid #EAD3CF',
  padding: 11,
  borderRadius: 10,
  marginBottom: 16,
  fontSize: 13.5,
  textAlign: 'center',
}

const buttonStyle = (loading: boolean): React.CSSProperties => ({
  width: '100%',
  padding: 15,
  marginTop: 6,
  background: loading ? 'linear-gradient(135deg, #8C7396 0%, #E0B3BE 100%)' : GRAD,
  color: '#fff',
  border: 'none',
  borderRadius: 12,
  fontSize: 15.5,
  fontWeight: 600,
  letterSpacing: '1px',
  cursor: loading ? 'not-allowed' : 'pointer',
  opacity: loading ? 0.8 : 1,
  fontFamily: 'inherit',
  boxShadow: `0 14px 30px -14px ${DEEP_SHADOW}`,
  transition: 'transform 0.15s, box-shadow 0.15s',
})

const footerStyle: React.CSSProperties = {
  textAlign: 'center',
  fontSize: 13.5,
  color: MUTED,
  margin: '20px 0 0 0',
}

const linkStyle: React.CSSProperties = {
  // Purple, not pink: pink on cream is 2.66:1 and fails AA. Purple is 11.1:1.
  color: ACCENT,
  fontWeight: 700,
  textDecoration: 'none',
}
