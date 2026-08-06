'use client'

// Public page (no auth guard) that a user lands on from the Supabase password
// recovery email. Supabase appends the recovery credential to the URL — either
// as a PKCE `?code=` query param (the default for @supabase/ssr's browser
// client) or, on the implicit flow, as an `#access_token=...` hash fragment.
// We establish a recovery session from whichever form is present, then let the
// user set a new password via supabase.auth.updateUser.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '../supabase'
import BrandBackdrop from '../BrandBackdrop'

const MIN_PASSWORD_LENGTH = 8

// Pre-auth page: carries the BLOOMOS BRAND, never a tenant accent. There is no
// tenant on a reset link, so every value reads --brand-*, never --pc-*.
// Shared with /login and /signup via lib/brand.ts.
import {
  ACCENT, ROSE, CREAM, SURFACE, MUTED, DEEP, CONTRAST, GRAD,
  ACCENT_LINE, ACCENT_LINE_2, ACCENT_RING, DEEP_SHADOW,
  LOGO_FULL, LOGO_FULL_W, LOGO_FULL_H,
} from '@/lib/brand'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '13px 15px', marginBottom: 12, border: `1px solid ${ACCENT_LINE_2}`,
  borderRadius: 14, fontSize: 15, boxSizing: 'border-box', background: CREAM,
  color: DEEP, outline: 'none', fontFamily: 'inherit',
  transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
}
function noticeStyle(kind: 'error' | 'ok'): React.CSSProperties {
  // Semantic colours stay semantic: success/error must not become brand purple.
  return {
    color: kind === 'error' ? '#B25B52' : '#2E7D50',
    background: kind === 'error' ? '#F9EFEE' : '#EEF5F0',
    border: `1px solid ${kind === 'error' ? '#EBD5D2' : '#D4E7DB'}`,
    padding: 12, borderRadius: 12, marginBottom: 16, fontSize: 13.5, textAlign: 'center',
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

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [ready, setReady] = useState(false) // recovery session established
  const router = useRouter()

  // On mount, turn the recovery credential in the URL into a live session.
  // Supabase may deliver it as a PKCE `?code=` query param OR an implicit
  // `#access_token=…` hash, and the browser client's detectSessionInUrl may
  // auto-consume it before we look. So we check every source and only fall
  // back to /login when there is genuinely no recovery token at all — an
  // invalid/expired token shows a clear error rather than bouncing away.
  useEffect(() => {
    let active = true
    const BAD_LINK =
      'הקישור לאיפוס אינו תקין או שפג תוקפו. יש לבקש איפוס סיסמה חדש.'

    // Capture the URL credentials synchronously, before anything strips them.
    const search = new URLSearchParams(window.location.search)
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const errParam = search.get('error') || hash.get('error')
    const code = search.get('code')
    const accessToken = hash.get('access_token')
    const refreshToken = hash.get('refresh_token')
    // Is there ANY recovery credential present (a code, a token pair, or an
    // error Supabase attached to the redirect)?
    const hasRecoveryToken = Boolean(
      errParam || code || (accessToken && refreshToken)
    )

    const succeed = () => {
      if (!active) return
      setError('')
      setReady(true)
      setChecking(false)
    }
    const fail = (msg: string) => {
      if (!active) return
      setError(msg)
      setChecking(false)
    }

    // detectSessionInUrl can establish the recovery session for us and emit
    // PASSWORD_RECOVERY — treat that (or any resulting session) as success so
    // we never bounce a valid recovery link to login.
    const { data: authSub } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'PASSWORD_RECOVERY' || session) succeed()
      }
    )

    async function establish() {
      try {
        // Expired / denied link: Supabase reports it via error params. Show a
        // clear message instead of silently redirecting.
        if (errParam) {
          fail(BAD_LINK)
          return
        }

        // A recovery session may already exist — auto-detected on load, or the
        // hash was consumed before this ran. If so, show the form immediately.
        const { data: current } = await supabase.auth.getSession()
        if (!active) return
        if (current.session) {
          succeed()
          return
        }

        // No credential anywhere → genuine direct visit, send to login.
        if (!hasRecoveryToken) {
          router.replace('/login')
          return
        }

        // PKCE flow: exchange the code for a session (the code verifier was
        // stored in this browser when resetPasswordForEmail was called).
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (!active) return
          if (!error) {
            succeed()
            return
          }
          // The code may have been consumed by auto-detect between our two
          // calls — re-check for a session before declaring the link bad.
          const { data: retry } = await supabase.auth.getSession()
          if (!active) return
          if (retry.session) succeed()
          else fail(BAD_LINK)
          return
        }

        // Implicit flow: the tokens arrive in the URL hash.
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (!active) return
          if (!error) succeed()
          else fail(BAD_LINK)
          return
        }

        // A token was present but unusable.
        fail(BAD_LINK)
      } catch {
        fail(BAD_LINK)
      }
    }

    establish()

    return () => {
      active = false
      authSub.subscription.unsubscribe()
    }
  }, [router])

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
        position: 'relative', zIndex: 0, overflow: 'hidden', minHeight: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        // Wash comes from BrandBackdrop, identical on every branded screen.
        fontFamily: 'var(--sans)',
      }}
    >
      <BrandBackdrop density="full" idPrefix="reset" />
      <style>{`
        @keyframes authIn { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: translateY(0) } }
        .auth-card { animation: authIn 0.4s ease-out; }
        .auth-input:focus { border-color: ${ACCENT} !important; background: #fff !important; box-shadow: 0 0 0 3px ${ACCENT_RING} !important; }
        .auth-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 18px 36px -14px ${DEEP_SHADOW}; }
      `}</style>
      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 400 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22 }}>
          <Image
            src={LOGO_FULL}
            alt="BloomOS — המערכת שמצמיחה את הקליניקה שלך"
            width={LOGO_FULL_W}
            height={LOGO_FULL_H}
            priority
            style={{ width: 'min(300px, 84%)', height: 'auto', filter: 'drop-shadow(0 10px 22px rgba(48,24,72,0.16))' }}
          />
        </div>
      <div
        className="auth-card"
        style={{
          background: SURFACE, padding: '38px 40px 42px',
          borderRadius: 28, boxShadow: `0 26px 64px -32px ${DEEP_SHADOW}, 0 4px 14px rgba(48,24,72,0.05)`,
          border: `1px solid ${ACCENT_LINE}`,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <p style={{ margin: 0, color: MUTED, fontSize: 11, letterSpacing: '2.5px', fontWeight: 600 }}>
            בחירת סיסמה חדשה
          </p>
          <div aria-hidden style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
            <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg, transparent, ${ACCENT_LINE_2})` }} />
            <span style={{ color: ROSE, fontSize: 12, lineHeight: 1 }}>✦</span>
            <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${ACCENT_LINE_2}, transparent)` }} />
          </div>
        </div>

        {checking ? (
          <p style={{ textAlign: 'center', color: '#8A7A70', fontSize: 15, letterSpacing: '0.5px' }}>
            טוען...
          </p>
        ) : notice ? (
          <div style={noticeStyle('ok')}>{notice}</div>
        ) : ready ? (
          <form onSubmit={handleSubmit}>
            <input
              className="auth-input"
              type="password"
              placeholder="סיסמה חדשה"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={inputStyle}
            />
            <input
              className="auth-input"
              type="password"
              placeholder="אימות סיסמה חדשה"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              style={{ ...inputStyle, marginBottom: 16 }}
            />

            {error && <div style={noticeStyle('error')}>{error}</div>}

            <button type="submit" disabled={loading} className="auth-btn" style={btnStyle(loading)}>
              {loading ? 'מעדכן...' : 'עדכון סיסמה'}
            </button>
          </form>
        ) : (
          <>
            <div style={noticeStyle('error')}>{error || 'לא נמצא קישור איפוס תקין.'}</div>
            <button type="button" onClick={() => router.push('/login')} className="auth-btn" style={btnStyle(false)}>
              חזרה לכניסה
            </button>
          </>
        )}
      </div>
      </div>
    </div>
  )
}
