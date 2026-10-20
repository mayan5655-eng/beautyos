// app/dashboard/admin/subscribers/page.tsx
// "מעקב מנויות": every business that signed up to Kalmea, its stage, its setup, and one-tap ways for the owner to reach her
// (WhatsApp with a prepared message she edits and sends herself, a call, an email), with her own follow-up note per business.
// Platform admins only: loadSubscribers() runs requirePlatformAdmin() first and gives anyone else the same plain 404 as
// /dashboard/admin. This file reads nothing itself.
import { loadSubscribers } from './loader'
import SubscribersClient from './SubscribersClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function SubscribersPage() {
  const r = await loadSubscribers()
  if (!r.ok) {
    return (
      <div dir="rtl" style={{ maxWidth: 640, margin: '0 auto', padding: '16px', fontFamily: 'var(--sans)', color: 'var(--ink)' }}>
        <a href="/dashboard/admin" style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-2)', textDecoration: 'none' }}>→ ניהול מנויים</a>
        <h1 style={{ fontFamily: 'var(--display-heavy)', fontSize: 30, fontWeight: 800, color: 'var(--brand-accent)', margin: '8px 0 12px' }}>מעקב מנויות</h1>
        <p style={{ fontSize: 15, color: 'var(--brand-highlight-text)', background: 'var(--k-petal)', borderRadius: 'var(--r-lg)', padding: '12px 14px', margin: 0 }}>
          לא הצלחנו לטעון את הנתונים כרגע. אפשר לנסות שוב בעוד רגע.
        </p>
      </div>
    )
  }
  return <SubscribersClient rows={r.rows} notesAvailable={r.notesAvailable} metricsAvailable={r.metricsAvailable} nowIso={r.now} />
}
