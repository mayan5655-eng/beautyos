// app/dashboard/owner/trials/page.tsx
// Screen B, "ניסיונות": trials ending within 7 days, plan status counts, and who keeps the 349 launch price.
// Read-only: activating or extending is done on /dashboard/admin, linked below.
import { loadTenants } from '../loader'
import { OwnerShell, Unavailable, Row, card, muted, h2, bigNumber } from '../OwnerShell'
import { trialsEndingSoon, planStatusCounts, launchPriceQualifiers, dateHe } from '@/lib/ownerControl'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const metadata = { title: 'ניסיונות · בקרה', robots: { index: false, follow: false } }

const STATUS_HE = { trial: 'בניסיון', active: 'פעיל', expired: 'הסתיים', paused: 'מושהה' } as const

export default async function OwnerTrialsPage() {
  const r = await loadTenants()
  if (!r.ok) {
    return <OwnerShell title="ניסיונות"><Unavailable>לא הצלחנו לטעון את הנתונים כרגע. אפשר לנסות שוב בעוד רגע.</Unavailable></OwnerShell>
  }
  const now = new Date()
  const counts = planStatusCounts(r.rows, now)
  const ending = trialsEndingSoon(r.rows, now, 7)
  const offer = launchPriceQualifiers(r.rows, now)

  return (
    <OwnerShell title="ניסיונות">
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {(['trial', 'active', 'expired', 'paused'] as const).map((s) => (
          <div key={s} style={{ ...card, flex: '1 1 70px', marginBottom: 0, textAlign: 'center', padding: '12px 8px' }}>
            <div style={bigNumber}>{counts[s]}</div>
            <div style={{ ...muted, fontSize: 13 }}>{STATUS_HE[s]}</div>
          </div>
        ))}
      </div>

      <section style={card}>
        <h2 style={h2}>מסיימות את הניסיון בשבוע הקרוב</h2>
        {ending.length === 0 ? <p style={muted}>אף אחת לא מסיימת בשבוע הקרוב.</p> : ending.map((e) => (
          <Row key={e.id} left={e.name} right={e.daysLeft <= 1 ? 'עד מחר' : `עוד ${e.daysLeft} ימים`} />
        ))}
      </section>

      <section style={card}>
        <h2 style={h2}>זכאיות למחיר 349</h2>
        <p style={{ ...muted, marginBottom: 8 }}>
          נרשמו עד 20.10.2026 (סוף היום, שעון ישראל). {offer.length} עסקים. הרשימה לעיון בלבד, ההחלטה נשארת אצלך.
        </p>
        {offer.length === 0 ? <p style={muted}>עוד אין.</p> : offer.map((o) => (
          <Row key={o.id} left={o.name} right={`${dateHe(o.created_at)} · ${STATUS_HE[o.status]}`} />
        ))}
      </section>

      <p style={muted}>
        להפעלת מנוי או הארכת ניסיון: <a href="/dashboard/admin" style={{ color: '#183024', fontWeight: 600 }}>ניהול מנויים</a>
      </p>
    </OwnerShell>
  )
}
