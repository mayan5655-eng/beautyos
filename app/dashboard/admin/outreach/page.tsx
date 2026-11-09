// app/dashboard/admin/outreach/page.tsx
// "פניות לקוסמטיקאיות": the owner's list of cosmeticians she may offer Kalmea to, each with one WhatsApp message she opens on
// her own phone and sends herself. Platform admins only: loadOutreach() runs requirePlatformAdmin() first and gives anyone
// else the same plain 404 as /dashboard/admin. This file reads nothing itself.
import { loadOutreach } from './loader'
import OutreachClient from './OutreachClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function OutreachPage() {
  const r = await loadOutreach()
  if (!r.ok) {
    return (
      <div dir="rtl" style={{ maxWidth: 640, margin: '0 auto', padding: '16px', fontFamily: 'var(--sans)', color: 'var(--ink)' }}>
        <a href="/dashboard/admin" style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-2)', textDecoration: 'none' }}>→ ניהול מנויים</a>
        <h1 style={{ fontFamily: 'var(--display-heavy)', fontSize: 30, fontWeight: 800, color: 'var(--brand-accent)', margin: '8px 0 12px' }}>פניות לקוסמטיקאיות</h1>
        <p style={{ fontSize: 15, color: 'var(--brand-highlight-text)', background: 'var(--k-petal)', borderRadius: 'var(--r-lg)', padding: '12px 14px', margin: 0 }}>
          לא הצלחנו לטעון את הרשימה כרגע. אפשר לנסות שוב בעוד רגע.
        </p>
      </div>
    )
  }
  return <OutreachClient rows={r.rows} available={r.available} nowIso={r.now} />
}
