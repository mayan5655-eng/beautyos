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
      <div dir="rtl" style={{ maxWidth: 640, margin: '0 auto', padding: '16px', fontFamily: "'Heebo','Assistant',sans-serif" }}>
        <a href="/dashboard/admin" style={{ fontSize: 15, fontWeight: 600, color: '#183024', textDecoration: 'none' }}>← חזרה לניהול מנויים</a>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '8px 0 12px' }}>מעקב מנויות</h1>
        <p style={{ fontSize: 15, color: '#9A5148' }}>לא הצלחנו לטעון את הנתונים כרגע. אפשר לנסות שוב בעוד רגע.</p>
      </div>
    )
  }
  return <SubscribersClient rows={r.rows} notesAvailable={r.notesAvailable} metricsAvailable={r.metricsAvailable} nowIso={r.now} />
}
