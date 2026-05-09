'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../supabase'

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
      router.push("/onboarding")
      router.refresh()
    }
  }

  return (
    <div dir="rtl" style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #fef3f3 0%, #f9e1e6 100%)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '20px',
    }}>
      <div style={{
        background: 'white',
        padding: '40px',
        borderRadius: '16px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        width: '100%',
        maxWidth: '420px',
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
        }}>פתיחת חשבון חדש</p>

        <form onSubmit={handleSignup}>
          <input
            type="text"
            placeholder="שם העסק"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
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
          <input
            type="password"
            placeholder="סיסמה (לפחות 6 תווים)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
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
          <input
            type="password"
            placeholder="אישור סיסמה"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
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
              marginBottom: '16px',
            }}>
            {loading ? 'יוצר חשבון...' : 'הרשמה'}
          </button>

          <p style={{
            textAlign: 'center',
            fontSize: '14px',
            color: '#666',
            margin: 0,
          }}>
            כבר יש לך חשבון?{' '}
            <a href="/login" style={{ color: '#D4945A', fontWeight: 600 }}>
              התחברות
            </a>
          </p>
        </form>
      </div>
    </div>
  )
}