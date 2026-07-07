'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../supabase'
import FloralCorners from '../FloralCorners'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
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

  return (
    <div dir="rtl" style={{
      position: 'relative',
      zIndex: 0,
      overflow: 'hidden',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #fef3f3 0%, #f9e1e6 100%)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <FloralCorners idPrefix="auth" />
      <div style={{
        position: 'relative',
        zIndex: 1,
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
        }}>BloomOS</h1>
        <p style={{
          margin: '0 0 32px 0',
          color: '#666',
          textAlign: 'center',
          fontSize: '14px',
        }}>כניסה לחשבון</p>

        <form onSubmit={handleLogin}>
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
            }}>
            {loading ? 'מתחבר...' : 'כניסה'}
          </button>
        </form>
      </div>
    </div>
  )
}