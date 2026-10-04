'use client'

import { useState } from 'react'
import Spinner from "../Spinner";
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '../supabase'
import BrandBackdrop from '../BrandBackdrop'

// Pre-auth page: carries the KALMEA BRAND, never a tenant accent. There is no
// tenant until after login, so every value reads --brand-*, never --pc-*.
// The tokens, the wash and the logo all come from lib/brand.ts so this page and
// its siblings cannot drift apart.
// GRAD (the two-hue gradient) is no longer used on this screen's button -
// the ad's pill is a solid fill - but stays exported from lib/brand for
// whatever else still wants it.
import {
  ACCENT, CREAM, SURFACE, MUTED,
  ACCENT_LINE, ACCENT_LINE_2, ACCENT_RING,
  BANNER_HEADER, BANNER_HEADER_W, BANNER_HEADER_H, FLOWER_MARK,
} from '@/lib/brand'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '13px 15px', marginBottom: 12,
  border: `1px solid ${ACCENT_LINE_2}`,
  borderRadius:"var(--r-md)", fontSize:"var(--t-lg)", boxSizing: 'border-box', background: CREAM,
  color: 'var(--brand-deep, #14261F)', outline: 'none', fontFamily: 'inherit',
  transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
}
const textLinkStyle: React.CSSProperties = {
  // Green, not pink: petal pink on paper is 1.9:1 and fails AA badly. Deep
  // green is 11.9:1. Same reasoning as before the rebrand, new numbers.
  background: 'none', border: 'none', color: ACCENT, fontSize:"var(--t-md)", cursor: 'pointer',
  textDecoration: 'underline', padding: 0, fontFamily: 'inherit', fontWeight: 600,
}
function noticeStyle(kind: 'error' | 'ok'): React.CSSProperties {
  return {
    color: kind === 'error' ? '#B25B52' : '#2E7D50',
    background: kind === 'error' ? '#F9EFEE' : '#EEF5F0',
    border: `1px solid ${kind === 'error' ? '#EBD5D2' : '#D4E7DB'}`,
    padding: 11, borderRadius:"var(--r-sm)", marginBottom: 16, fontSize:"var(--t-md)", textAlign: 'center',
  }
}
// Ad-aligned pass: the submit button is now .brand-pill-btn (solid green,
// cream text, gold hairline, chevron - see globals.css) - this just adds the
// full-width + letter-spacing this screen wants on top of that shared class.
function btnStyle(): React.CSSProperties {
  return {
    width: '100%', letterSpacing: '1px',
    boxShadow:"var(--shadow-accent)",
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
      setError('שליחת הקישור נכשלה. נסי שוב.')
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
      position: 'relative', zIndex: 0, overflow: 'hidden', minHeight: '100dvh',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 20px 40px',
      // Cream page lifting to a soft lavender halo behind the card.
      fontFamily: 'var(--sans)',
    }}>
      {/* The shared brand backdrop: cream-to-lavender wash plus blush/lilac
          florals. Every branded screen renders this same component, so none of
          them can drift into a lighter or different version. */}
      <BrandBackdrop density="full" idPrefix="auth" />
      <style>{`
        @keyframes authIn { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: translateY(0) } }
        .auth-card { animation: authIn 0.4s ease-out; }
        .auth-input:focus { border-color: ${ACCENT} !important; background: #fff !important; box-shadow: 0 0 0 3px ${ACCENT_RING} !important; }
        .auth-link:hover { text-decoration: underline; }
      `}</style>

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 400 }}>
        {/* Sits fully above the card, NOT overlapping it: the banner ends in
            the slogan/domain line, which a negative margin would crop.
            Ad-aligned pass: this used to be the bare wordmark; the banner
            carries the wordmark AND the slogan she asked to be the first
            thing a new cosmetician reads here, baked into one asset so
            there is no separate text layer to keep in sync with it. See
            BANNER_HEADER's comment in lib/brand.ts for why it's the cropped
            center, not the full banner. */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22 }}>
          <Image
            src={BANNER_HEADER}
            alt="קלמיה — עסק שפורח. חיים עם יותר שקט."
            width={BANNER_HEADER_W}
            height={BANNER_HEADER_H}
            priority
            style={{
              width: 'min(380px, 96%)', height: 'auto',
              filter: 'drop-shadow(0 10px 22px rgba(48,24,72,0.16))',
            }}
          />
        </div>

        <div className="auth-card" style={{
          background: SURFACE, padding: '38px 40px 42px',
          borderRadius:"var(--r-xl)",
          boxShadow:"var(--shadow-accent)",
          border: `1px solid ${ACCENT_LINE}`,
        }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <p style={{ margin: 0, color: MUTED, fontSize:"var(--t-xs)", letterSpacing: '2.5px', fontWeight: 600 }}>
              {mode === 'login' ? 'כניסה לחשבון' : 'איפוס סיסמה'}
            </p>
            {/* Hairline rule with the actual flower mark, echoing the logo's
                own flower now that there is one to echo. */}
            <div aria-hidden style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
              <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg, transparent, ${ACCENT_LINE_2})` }} />
              <img src={FLOWER_MARK} alt="" width={14} height={14} style={{ display: 'block' }} />
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

            <button type="submit" disabled={loading} className="brand-pill-btn" style={btnStyle()}>
              {mode === 'login'
                ? (loading ? <Spinner inline label="מתחבר" /> : <>כניסה<span className="chevron" aria-hidden> ←</span></>)
                : (loading ? <Spinner inline label="שולח" /> : <>שליחת קישור לאיפוס<span className="chevron" aria-hidden> ←</span></>)}
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
            <>
              <p style={{ marginTop: 16, textAlign: 'center', fontSize:"var(--t-md)", color: MUTED }}>
                אין לך חשבון?{' '}
                <a href="/signup" className="auth-link" style={{ color: ACCENT, fontWeight: 700, textDecoration: 'none' }}>
                  הירשמי
                </a>
              </p>
              <p style={{ marginTop: 8, textAlign: 'center', fontSize:"var(--t-sm)", color: MUTED }}>
                <a href="/demo" className="auth-link" style={{ color: MUTED, textDecoration: 'underline' }}>
                  רוצה לראות קודם? נסי דמו
                </a>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
