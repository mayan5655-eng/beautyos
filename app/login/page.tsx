'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../supabase'

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
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #fef3f3 0%, #f9e1e6 100%)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{
        background: 'white',
        padding: '40px',
        borderRadius: '16px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        width: '100%',
        maxWidth: '400px',
      }}>
        <h1 style={{
          margin: '0 0 8px 0',
          color: '#D4945A',
          fontSize: '28px',
          textAlign: 'center',
        }}>BeautyOS</h1>
        <p style={{
          margin: '0 0 32px 0',
          color: '#666',
          textAlign: 'center',
          fontSize: '14px',
        }}>{mode === 'login' ? 'כניסה לחשבון' : 'איפוס סיסמה'}</p>

        <form onSubmit={mode === 'login' ? handleLogin : handleForgot}>
          <input
            type="email"
            placeholder="אימייל"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '12px',
              marginBottom: '12px',
              border: '1px solid #ddd',
              borderRadius: '8px',
              fontSize: '15px',
              boxSizing: 'border-box',
            }}
          />
          {mode === 'login' && (
            <input
              type="password"
              placeholder="סיסמה"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '12px',
                marginBottom: '16px',
                border: '1px solid #ddd',
                borderRadius: '8px',
                fontSize: '15px',
                boxSizing: 'border-box',
              }}
            />
          )}

          {error && (
            <div style={{
              color: '#c53030',
              background: '#fed7d7',
              padding: '10px',
              borderRadius: '6px',
              marginBottom: '16px',
              fontSize: '14px',
              textAlign: 'center',
            }}>{error}</div>
          )}

          {resetNotice && (
            <div style={{
              color: '#276749',
              background: '#c6f6d5',
              padding: '10px',
              borderRadius: '6px',
              marginBottom: '16px',
              fontSize: '14px',
              textAlign: 'center',
            }}>{resetNotice}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              background: '#D4945A',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}>
            {mode === 'login'
              ? (loading ? 'מתחבר...' : 'כניסה')
              : (loading ? 'שולח...' : 'שליחת קישור לאיפוס')}
          </button>
        </form>

        <div style={{ marginTop: '16px', textAlign: 'center' }}>
          {mode === 'login' ? (
            <button
              type="button"
              onClick={showForgot}
              style={{
                background: 'none',
                border: 'none',
                color: '#D4945A',
                fontSize: '14px',
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: 0,
                fontFamily: 'inherit',
              }}
            >
              שכחת סיסמה?
            </button>
          ) : (
            <button
              type="button"
              onClick={showLogin}
              style={{
                background: 'none',
                border: 'none',
                color: '#D4945A',
                fontSize: '14px',
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: 0,
                fontFamily: 'inherit',
              }}
            >
              חזרה לכניסה
            </button>
          )}
        </div>
      </div>
    </div>
  )
}