// app/dashboard/owner/OwnerShell.tsx
//
// The frame shared by the owner screens: a back link, a title and a phone-width column. Server component, no data.
import type { ReactNode, CSSProperties } from 'react'

export const card: CSSProperties = {
  background: '#fff', border: '1px solid #E7DFEC', borderRadius: 16, padding: '14px 16px', marginBottom: 12,
}
export const muted: CSSProperties = { fontSize: 14, color: '#5C4F63', lineHeight: 1.7, margin: 0 }
export const h2: CSSProperties = { fontSize: 17, fontWeight: 700, color: '#2A2233', margin: '0 0 8px' }
export const bigNumber: CSSProperties = { fontSize: 28, fontWeight: 700, color: '#183024', lineHeight: 1.1 }

export function OwnerShell({ title, back = { href: '/dashboard/owner', label: 'חזרה לבקרה' }, children }: {
  title: string
  back?: { href: string; label: string }
  children: ReactNode
}) {
  return (
    <div dir="rtl" style={{ maxWidth: 640, margin: '0 auto', padding: '8px 16px 48px', fontFamily: "'Heebo','Assistant',sans-serif", color: '#2A2233' }}>
      <a href={back.href} style={{ display: 'inline-block', padding: '8px 0', fontSize: 15, fontWeight: 600, color: '#183024', textDecoration: 'none' }}>
        ← {back.label}
      </a>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: '4px 0 16px' }}>{title}</h1>
      {children}
    </div>
  )
}

export function Unavailable({ children }: { children: ReactNode }) {
  return <div style={{ ...card, background: '#FBF3E2', borderColor: '#EADFC4' }}><p style={{ ...muted, color: '#6B5326' }}>{children}</p></div>
}

export function Row({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderBottom: '1px solid #F1EBF4', fontSize: 15 }}>
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{left}</span>
      <span style={{ color: '#5C4F63', whiteSpace: 'nowrap' }}>{right}</span>
    </div>
  )
}
