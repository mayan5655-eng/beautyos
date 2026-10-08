'use client'

import { useState } from 'react'
import Spinner from "../Spinner";
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '../supabase'
import BrandBackdrop from '../BrandBackdrop'

// Pre-auth page: carries the KALMEA BRAND, never a tenant accent. There is no
// tenant until after signup, so every value reads --brand-*, never --pc-*.
// Shared with /login and /reset-password via lib/brand.ts.
import {
  ACCENT, CREAM, SURFACE, MUTED, DEEP, GRAD,
  ACCENT_LINE, ACCENT_LINE_2, ACCENT_RING, DEEP_SHADOW,
  BANNER_HEADER, BANNER_HEADER_W, BANNER_HEADER_H, FLOWER_MARK,
} from '@/lib/brand'
import BrandImage from "@/app/BrandImage";

export default function SignupPage() {
  const [businessName, setBusinessName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // Set once Supabase accepted the sign-up but is waiting for her to confirm her email (no session yet).
  const [sentTo, setSentTo] = useState('')
  const [resendNote, setResendNote] = useState('')
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

    // Which ad brought her: the first-party cookie the landing left (app/AttributionCapture.jsx), kept in her account too, so it survives
    // confirming her email in another browser. Bounded (it is re-parsed and reduced to a label by /api/attribution); never blocks sign-up.
    let attr = ''
    try { attr = (document.cookie.split('; ').find((c) => c.startsWith('kl_attr='))?.slice('kl_attr='.length) || '').slice(0, 600) } catch { /* nicety */ }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // The confirmation link lands on /auth/callback, which trades the code for a session and continues to onboarding.
        // This URL must be in Supabase > Authentication > URL Configuration > Redirect URLs.
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
        data: {
          business_name: businessName.trim(),
          ...(attr ? { kl_attr: attr } : {}),
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

    // With email confirmation ON, Supabase answers an already-registered address with a fake user (no error, no identities)
    // so that nobody can probe which emails exist. Treat it as what it is.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      setError('האימייל כבר רשום במערכת')
      setLoading(false)
      return
    }

    if (data.session) {
      // Confirmation is off (or already done): straight in, as before.
      router.push('/onboarding')
      router.refresh()
      return
    }

    if (data.user) {
      setSentTo(email)
      setLoading(false)
    }
  }

  async function handleResend() {
    setResendNote('')
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: sentTo,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding` },
    })
    setResendNote(error ? 'לא הצלחנו לשלוח שוב כרגע. נסי עוד כמה דקות.' : 'שלחנו שוב. כדאי לבדוק גם בספאם.')
  }

  return (
    <div dir="rtl" style={pageStyle}>
      <BrandBackdrop density="full" idPrefix="signup" />

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
        {/* Brand — the banner already carries the wordmark and slogan, same
            asset as /login (BANNER_HEADER, see its comment in lib/brand.ts). */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22 }}>
          <Image
            src={BANNER_HEADER}
            alt="קלמיה — עסק שפורח. חיים עם יותר שקט."
            width={BANNER_HEADER_W}
            height={BANNER_HEADER_H}
            priority
            fetchPriority="high"
            sizes="(max-width: 420px) 96vw, 380px"
            style={logoStyle}
          />
        </div>

        {/* Welcome */}
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <h2 style={welcomeTitleStyle}>נעים להכיר 🌸</h2>
          <p style={welcomeSubtitleStyle}>
            פתחי את חשבון היופי שלך — כל מה שצריך לניהול העסק, במקום אחד.
          </p>
          {/* Hairline with the actual flower mark, echoing the logo's own
              flower. Matches the same divider on /login. */}
          <div aria-hidden style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
            <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg, transparent, ${ACCENT_LINE_2})` }} />
            <BrandImage src={FLOWER_MARK} alt="" width={14} height={14} style={{ display: 'block' }} />
            <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${ACCENT_LINE_2}, transparent)` }} />
          </div>
        </div>

        {sentTo ? (
          <div role="status" style={{ textAlign: 'center' }}>
            <h2 style={{ ...welcomeTitleStyle, marginTop: 0 }}>בדקי את המייל 🌸</h2>
            <p style={welcomeSubtitleStyle}>שלחנו קישור אישור אל</p>
            <p dir="ltr" style={{ ...welcomeSubtitleStyle, color: DEEP, fontWeight: 700, margin: '4px 0 14px' }}>{sentTo}</p>
            <p style={welcomeSubtitleStyle}>
              לחצי עליו וניכנס יחד להקמת העסק. אם הוא לא הגיע תוך דקה, כדאי להסתכל בספאם.
            </p>
            <button type="button" onClick={handleResend} className="signup-btn" style={{ ...buttonStyle(false), marginTop: 18 }}>
              שלחי לי שוב
            </button>
            {resendNote && <p style={footerStyle}>{resendNote}</p>}
            <p style={footerStyle}>
              טעות באימייל?{' '}
              <button type="button" onClick={() => { setSentTo(''); setResendNote('') }} className="signup-link" style={{ ...linkStyle, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>
                חזרה להרשמה
              </button>
            </p>
          </div>
        ) : (
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
            {loading ? <Spinner inline label="יוצרת חשבון" /> : 'הרשמה'}
          </button>

          {/* The two pages exist and say that using the service is agreeing to them, but nothing on sign-up pointed to either (found
              2026-10-07, the legal review). A pointer, not a consent mechanism: whether a ticked box with a stored version is needed is
              a question for her lawyer (marketing/out/OVERNIGHT-REPORT.md, item 9). */}
          <p style={{ ...footerStyle, marginTop: 14 }}>
            בהרשמה את מאשרת את{' '}
            <a href="/terms" target="_blank" rel="noreferrer" className="signup-link" style={linkStyle}>תנאי השימוש</a>
            {' '}ואת{' '}
            <a href="/privacy" target="_blank" rel="noreferrer" className="signup-link" style={linkStyle}>מדיניות הפרטיות</a>.
          </p>

          <p style={footerStyle}>
            כבר יש לך חשבון?{' '}
            <a href="/login" className="signup-link" style={linkStyle}>
              התחברי
            </a>
          </p>
        </form>
        )}
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

// === Styles (premium Kalmea aesthetic — matches /book + /skin-scan) ===
const pageStyle: React.CSSProperties = {
  position: 'relative',
  zIndex: 0,
  overflow: 'hidden',
  minHeight: '100dvh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  // Wash comes from BrandBackdrop, so it is identical on every branded screen.
  fontFamily: 'var(--sans)',
  padding: 20,
}

const cardStyle: React.CSSProperties = {
  position: 'relative',
  zIndex: 1,
  background: SURFACE,
  padding: '38px 40px 42px',
  borderRadius:"var(--r-xl)",
  boxShadow:"var(--shadow-accent)",
  border: `1px solid ${ACCENT_LINE}`,
  width: '100%',
  maxWidth: 430,
}

const logoStyle: React.CSSProperties = {
  width: 'min(380px, 96%)',
  height: 'auto',
  filter: 'drop-shadow(0 10px 22px rgba(48,24,72,0.16))',
}

const welcomeTitleStyle: React.CSSProperties = {
  margin: '0 0 6px 0',
  color: DEEP,
  fontSize:"var(--t-2xl)",
  fontWeight: 600,
  letterSpacing: '0.3px',
  fontFamily: "'Frank Ruhl Libre', Georgia, serif",
}

const welcomeSubtitleStyle: React.CSSProperties = {
  margin: 0,
  color: MUTED,
  fontSize:"var(--t-md)",
  lineHeight: 1.7,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '13px 15px',
  border: `1px solid ${ACCENT_LINE_2}`,
  borderRadius:"var(--r-sm)",
  fontSize:"var(--t-lg)",
  boxSizing: 'border-box',
  background: CREAM,
  color: DEEP,
  outline: 'none',
  fontFamily: 'inherit',
  transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
}

const labelStyle: React.CSSProperties = {
  fontSize:"var(--t-sm)",
  color: DEEP,
  fontWeight: 600,
  letterSpacing: '0.3px',
}

const hintStyle: React.CSSProperties = {
  fontSize:"var(--t-xs)",
  color: MUTED,
}

const errorStyle: React.CSSProperties = {
  color: '#B25B52',
  background: '#F7ECEA',
  border: '1px solid #EAD3CF',
  padding: 11,
  borderRadius:"var(--r-sm)",
  marginBottom: 16,
  fontSize:"var(--t-md)",
  textAlign: 'center',
}

const buttonStyle = (loading: boolean): React.CSSProperties => ({
  width: '100%',
  padding: 15,
  marginTop: 6,
  background: loading ? 'linear-gradient(135deg, #8C7396 0%, #E0B3BE 100%)' : GRAD,
  color: '#fff',
  border: 'none',
  borderRadius:"var(--r-sm)",
  fontSize:"var(--t-lg)",
  fontWeight: 600,
  letterSpacing: '1px',
  cursor: loading ? 'not-allowed' : 'pointer',
  opacity: loading ? 0.8 : 1,
  fontFamily: 'inherit',
  boxShadow:"var(--shadow-accent)",
  transition: 'transform 0.15s, box-shadow 0.15s',
})

const footerStyle: React.CSSProperties = {
  textAlign: 'center',
  fontSize:"var(--t-md)",
  color: MUTED,
  margin: '20px 0 0 0',
}

const linkStyle: React.CSSProperties = {
  // Green, not pink: petal pink on paper is 1.9:1 and fails AA badly. Deep
  // green is 11.9:1. Same reasoning as before the rebrand, new numbers.
  color: ACCENT,
  fontWeight: 700,
  textDecoration: 'none',
}
