'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../supabase'
import FloralCorners from '../FloralCorners'

// === premium styles (BloomOS aesthetic — matches /book + /skin-scan) ===
const GOLD = '#D4945A'
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '13px 15px', marginBottom: 12, border: '1px solid #EADFD8',
  borderRadius: 12, fontSize: 15, boxSizing: 'border-box', background: '#FBF7F4',
  color: '#3A2B2B', outline: 'none', fontFamily: 'inherit',
  transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
}
const textLinkStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: GOLD, fontSize: 13.5, cursor: 'pointer',
  textDecoration: 'underline', padding: 0, fontFamily: 'inherit',
}
function noticeStyle(kind: 'error' | 'ok'): React.CSSProperties {
  return {
    color: kind === 'error' ? '#B25B52' : '#2E7D50',
    background: kind === 'error' ? '#F7ECEA' : '#EEF5F0',
    border: `1px solid ${kind === 'error' ? '#EAD3CF' : '#D4E7DB'}`,
    padding: 11, borderRadius: 10, marginBottom: 16, fontSize: 13.5, textAlign: 'center',
  }
}
function btnStyle(loading: boolean): React.CSSProperties {
  return {
    width: '100%', padding: 15, color: '#fff', border: 'none', borderRadius: 12,
    background: loading ? '#E6C3A3' : `linear-gradient(135deg, #E0A567 0%, ${GOLD} 100%)`,
    fontSize: 15.5, fontWeight: 600, letterSpacing: '1px', fontFamily: 'inherit',
    cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.8 : 1,
    boxShadow: '0 14px 30px -14px rgba(212,148,90,0.7)',
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
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      background: 'linear-gradient(180deg, #FBF7F4 0%, #F4ECE6 58%, #FBF9F7 100%)',
      fontFamily: "'Assistant', system-ui, -apple-system, sans-serif",
    }}>
      <FloralCorners idPrefix="auth" />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@500;600;700&family=Assistant:wght@300;400;500;600;700&display=swap');
        @keyframes authIn { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: translateY(0) } }
        .auth-card { animation: authIn 0.4s ease-out; }
        .auth-input:focus { border-color: ${GOLD} !important; background: #fff !important; box-shadow: 0 0 0 3px rgba(212,148,90,0.14) !important; }
        .auth-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 16px 32px -14px rgba(212,148,90,0.75); }
        .auth-link:hover { text-decoration: underline; }
      `}</style>
      <div className="auth-card" style={{
        position: 'relative', zIndex: 1, background: '#fff', padding: '42px 40px',
        borderRadius: 24, boxShadow: '0 26px 64px -32px rgba(120,90,70,0.34), 0 4px 14px rgba(0,0,0,0.04)',
        border: '1px solid #EFE6DF', width: '100%', maxWidth: 400,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <h1 style={{ margin: 0, color: GOLD, fontSize: 34, fontWeight: 600, letterSpacing: '2px', fontFamily: "'Frank Ruhl Libre', Georgia, serif" }}>BloomOS</h1>
          <p style={{ margin: '8px 0 0 0', color: '#B0998B', fontSize: 11, letterSpacing: '2.5px', fontWeight: 600 }}>{mode === 'login' ? 'כניסה לחשבון' : 'איפוס סיסמה'}</p>
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
          <p style={{ marginTop: 16, textAlign: 'center', fontSize: 13.5, color: '#8A7A70' }}>
            אין לך חשבון?{' '}
            <a href="/signup" className="auth-link" style={{ color: GOLD, fontWeight: 700, textDecoration: 'none' }}>
              הירשמי
            </a>
          </p>
        )}
      </div>
    </div>
  )
}