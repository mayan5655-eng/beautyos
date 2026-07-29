'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../supabase'
import FloralCorners from '../FloralCorners'

const GOLD = '#D4945A'

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
        @import url('https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@500;600;700&family=Assistant:wght@300;400;500;600;700&display=swap');
        @keyframes signupIn { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: translateY(0) } }
        .signup-card { animation: signupIn 0.4s ease-out; }
        .signup-input:focus {
          border-color: ${GOLD} !important;
          background: #fff !important;
          box-shadow: 0 0 0 3px rgba(212,148,90,0.14) !important;
        }
        .signup-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 10px 24px rgba(212,148,90,0.35); }
        .signup-link:hover { text-decoration: underline; }
      `}</style>

      <div className="signup-card" style={cardStyle}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <h1 style={wordmarkStyle}>BloomOS</h1>
          <p style={taglineStyle}>מערכת ההפעלה לעסקי היופי</p>
        </div>

        {/* Welcome */}
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <h2 style={welcomeTitleStyle}>נעים להכיר 🌸</h2>
          <p style={welcomeSubtitleStyle}>
            פתחי את חשבון היופי שלך — כל מה שצריך לניהול העסק, במקום אחד.
          </p>
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
  background: 'linear-gradient(180deg, #FBF7F4 0%, #F4ECE6 58%, #FBF9F7 100%)',
  fontFamily: "'Assistant', system-ui, -apple-system, sans-serif",
  padding: 20,
}

const cardStyle: React.CSSProperties = {
  position: 'relative',
  zIndex: 1,
  background: '#fff',
  padding: '42px 40px',
  borderRadius: 24,
  boxShadow: '0 26px 64px -32px rgba(120,90,70,0.34), 0 4px 14px rgba(0,0,0,0.04)',
  border: '1px solid #EFE6DF',
  width: '100%',
  maxWidth: 430,
}

const wordmarkStyle: React.CSSProperties = {
  margin: 0,
  color: GOLD,
  fontSize: 34,
  fontWeight: 600,
  letterSpacing: '2px',
  fontFamily: "'Frank Ruhl Libre', Georgia, serif",
}

const taglineStyle: React.CSSProperties = {
  margin: '6px 0 0 0',
  color: '#B0998B',
  fontSize: 11,
  letterSpacing: '2.5px',
  fontWeight: 600,
}

const welcomeTitleStyle: React.CSSProperties = {
  margin: '0 0 6px 0',
  color: '#4A3B33',
  fontSize: 22,
  fontWeight: 600,
  letterSpacing: '0.3px',
  fontFamily: "'Frank Ruhl Libre', Georgia, serif",
}

const welcomeSubtitleStyle: React.CSSProperties = {
  margin: 0,
  color: '#8A7A70',
  fontSize: 13.5,
  lineHeight: 1.7,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '13px 15px',
  border: '1px solid #EADFD8',
  borderRadius: 12,
  fontSize: 15,
  boxSizing: 'border-box',
  background: '#FBF7F4',
  color: '#3A2B2B',
  outline: 'none',
  fontFamily: 'inherit',
  transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#6B5B56',
  fontWeight: 600,
  letterSpacing: '0.3px',
}

const hintStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#B0A099',
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
  background: loading ? '#E6C3A3' : `linear-gradient(135deg, #E0A567 0%, ${GOLD} 100%)`,
  color: '#fff',
  border: 'none',
  borderRadius: 12,
  fontSize: 15.5,
  fontWeight: 600,
  letterSpacing: '1px',
  cursor: loading ? 'not-allowed' : 'pointer',
  opacity: loading ? 0.8 : 1,
  fontFamily: 'inherit',
  boxShadow: '0 14px 30px -14px rgba(212,148,90,0.7)',
  transition: 'transform 0.15s, box-shadow 0.15s',
})

const footerStyle: React.CSSProperties = {
  textAlign: 'center',
  fontSize: 13.5,
  color: '#8A7A70',
  margin: '20px 0 0 0',
}

const linkStyle: React.CSSProperties = {
  color: GOLD,
  fontWeight: 700,
  textDecoration: 'none',
}
