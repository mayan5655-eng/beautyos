// app/dashboard/owner/OwnerEntry.tsx
//
// The "בקרה" tile in the app's "עוד" sheet. A server component: the platform-admin check runs here, on the server, and
// for everyone else it renders nothing at all - no link, no label, no hidden markup - so a cosmetician's page and bundle
// never contain it (the app only has an empty slot to put a ReactNode in).
//
// It is streamed inside a Suspense boundary, so the admin lookup never delays the first paint of the app for anyone.
import { Suspense } from 'react'
import { requirePlatformAdmin } from '@/lib/adminGuard'

async function OwnerEntryInner() {
  const admin = await requirePlatformAdmin()
  if (!admin.ok) return null
  return (
    <a
      href="/dashboard/owner"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 7,
        padding: '14px 6px', borderRadius: 'var(--r-md)', textDecoration: 'none', fontFamily: 'inherit',
        border: '1px solid var(--line)', background: 'var(--surface-2)', color: 'var(--ink-2)',
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
        <path d="M5 20V10M12 20V4M19 20v-7" />
      </svg>
      <span style={{ fontSize: 'var(--t-sm)', fontWeight: 600 }}>בקרה</span>
    </a>
  )
}

export default function OwnerEntry() {
  return (
    <Suspense fallback={null}>
      <OwnerEntryInner />
    </Suspense>
  )
}
