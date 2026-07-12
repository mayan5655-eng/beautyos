'use client'

// Public page (no auth guard) that a user lands on from the Supabase password
// recovery email. Supabase appends the recovery credential to the URL — either
// as a PKCE `?code=` query param (the default for @supabase/ssr's browser
// client) or, on the implicit flow, as an `#access_token=...` hash fragment.
// We establish a recovery session from whichever form is present, then let the
// user set a new password via supabase.auth.updateUser.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../supabase'

const MIN_PASSWORD_LENGTH = 8

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px',
  marginBottom: '12px',
  border: '1px solid #ddd',
  borderRadius: '8px',
  fontSize: '15px',
  boxSizing: 'border-box',
}

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [ready, setReady] = useState(false) // recovery session established
  const router = useRouter()

  // On mount, turn the credential in the URL into a live session.
  useEffect(() => {
    let active = true
    const BAD_LINK =
      'הקישור לאיפוס אינו תקין או שפג תוקפו. יש לבקש איפוס סיסמה חדש.'

    async function establish() {
      try {
        const search = new URLSearchParams(window.location.search)
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))

        // Supabase reports failures (e.g. expired link) via error params.
        if (search.get('error') || hash.get('error')) {
          if (active) setError(BAD_LINK)
          return
        }

        // PKCE flow: exchange the code for a session (the code verifier was
        // stored in this browser when resetPasswordForEmail was called).
        const code = search.get('code')
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (!active) return
          if (error) setError(BAD_LINK)
          else setReady(true)
          return
        }

        // Implicit flow: the tokens arrive in the URL hash.
        const accessToken = hash.get('access_token')
        const refreshToken = hash.get('refresh_token')
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (!active) return
          if (error) setError(BAD_LINK)
          else setReady(true)
          return
        }

        // Fallback: the browser client may have auto-detected the session.
        const { data } = await supabase.auth.getSession()
        if (!active) return
        if (data.session) setReady(true)
        else setError(BAD_LINK)
      } finally {
        if (active) setChecking(false)
      }
    }

    establish()
    return () => {
      active = false
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`הסיסמה חייבת להכיל לפחות ${MIN_PASSWORD_LENGTH} תווים`)
      return
    }
    if (password !== confirm) {
      setError('הסיסמאות אינן תואמות')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      const sameAsOld = /should be different|New password/i.test(error.message)
      setError(
        sameAsOld
          ? 'יש לבחור סיסמה חדשה, שונה מהקודמת.'
          : 'לא ניתן לעדכן את הסיסמה. נסה/י שוב.'
      )
      setLoading(false)
      return
    }

    setNotice('הסיסמה עודכנה בהצלחה! מעביר/ה אותך לכניסה...')
    // Clear the recovery session so the user logs in fresh with the new password.
    await supabase.auth.signOut()
    setTimeout(() => router.push('/login'), 2000)
  }

  return (
    <div
      dir="rtl"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #fef3f3 0%, #f9e1e6 100%)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        style={{
          background: 'white',
          padding: '40px',
          borderRadius: '16px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          width: '100%',
          maxWidth: '400px',
        }}
      >
        <h1
          style={{
            margin: '0 0 8px 0',
            color: '#D4945A',
            fontSize: '28px',
            textAlign: 'center',
          }}
        >
          BeautyOS
        </h1>
        <p
          style={{
            margin: '0 0 32px 0',
            color: '#666',
            textAlign: 'center',
            fontSize: '14px',
          }}
        >
          בחירת סיסמה חדשה
        </p>

        {checking ? (
          <p style={{ textAlign: 'center', color: '#666', fontSize: '15px' }}>
            טוען...
          </p>
        ) : notice ? (
          <div
            style={{
              color: '#276749',
              background: '#c6f6d5',
              padding: '12px',
              borderRadius: '6px',
              fontSize: '14px',
              textAlign: 'center',
            }}
          >
            {notice}
          </div>
        ) : ready ? (
          <form onSubmit={handleSubmit}>
            <input
              type="password"
              placeholder="סיסמה חדשה"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={inputStyle}
            />
            <input
              type="password"
              placeholder="אימות סיסמה חדשה"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              style={{ ...inputStyle, marginBottom: '16px' }}
            />

            {error && (
              <div
                style={{
                  color: '#c53030',
                  background: '#fed7d7',
                  padding: '10px',
                  borderRadius: '6px',
                  marginBottom: '16px',
                  fontSize: '14px',
                  textAlign: 'center',
                }}
              >
                {error}
              </div>
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
              }}
            >
              {loading ? 'מעדכן...' : 'עדכון סיסמה'}
            </button>
          </form>
        ) : (
          <>
            <div
              style={{
                color: '#c53030',
                background: '#fed7d7',
                padding: '10px',
                borderRadius: '6px',
                marginBottom: '16px',
                fontSize: '14px',
                textAlign: 'center',
              }}
            >
              {error || 'לא נמצא קישור איפוס תקין.'}
            </div>
            <button
              type="button"
              onClick={() => router.push('/login')}
              style={{
                width: '100%',
                padding: '14px',
                background: '#D4945A',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              חזרה לכניסה
            </button>
          </>
        )}
      </div>
    </div>
  )
}
