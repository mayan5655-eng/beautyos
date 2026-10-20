// app/dashboard/owner/page.tsx
// The owner control hub: three tiles, each its own screen. Platform admins only; anyone else gets the same plain 404 as
// /dashboard/admin. No data is read here beyond the admin check.
import { requireOwner } from './loader'
import { OwnerShell, card, muted } from './OwnerShell'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const TILES = [
  { href: '/dashboard/admin/subscribers', title: 'מעקב מנויות', body: 'כל עסק שנרשם: שלב, הגדרה, פעילות, ויצירת קשר בלחיצה עם הערות מעקב.' },
  { href: '/dashboard/owner/signups', title: 'הרשמות', body: 'כמה נרשמו היום, בשבוע ובחודש, ומאיפה הן הגיעו.' },
  { href: '/dashboard/owner/trials', title: 'ניסיונות', body: 'מי מסיימת את החודש החינם בקרוב, ומי זכאית למחיר 349.' },
  { href: '/dashboard/owner/activity', title: 'פעילות', body: 'מתי כל עסק יצר משהו לאחרונה בקלמיה.' },
]

export default async function OwnerHubPage() {
  await requireOwner()
  return (
    <OwnerShell title="בקרה" back={{ href: '/', label: 'חזרה לאפליקציה' }}>
      <p style={{ ...muted, marginBottom: 14 }}>מבט שקט על העסקים בקלמיה. רק נתוני חשבון, בלי תוכן של לקוחות.</p>
      {TILES.map((t) => (
        <a key={t.href} href={t.href} style={{ ...card, display: 'block', textDecoration: 'none', color: 'inherit' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#183024', marginBottom: 4 }}>{t.title}</div>
          <p style={muted}>{t.body}</p>
        </a>
      ))}
      <p style={{ ...muted, marginTop: 16 }}>
        להפעלת מנוי או הארכת ניסיון: <a href="/dashboard/admin" style={{ color: '#183024', fontWeight: 600 }}>ניהול מנויים</a>
      </p>
    </OwnerShell>
  )
}
