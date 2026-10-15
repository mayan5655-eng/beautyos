// app/dashboard/owner/signups/page.tsx
// Screen A, "הרשמות": signups today / 7 days / 30 days, by source, and the newest ones. Tenant-level metadata only.
import { loadTenants } from '../loader'
import { OwnerShell, Unavailable, Row, card, muted, h2, bigNumber } from '../OwnerShell'
import { signupWindows, signupsBySource, newestSignups, dateHe } from '@/lib/ownerControl'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function OwnerSignupsPage() {
  const r = await loadTenants()
  if (!r.ok) {
    return <OwnerShell title="הרשמות"><Unavailable>לא הצלחנו לטעון את הנתונים כרגע. אפשר לנסות שוב בעוד רגע.</Unavailable></OwnerShell>
  }
  const now = new Date()
  const w = signupWindows(r.rows, now)
  const sources = signupsBySource(r.rows, now)
  const newest = newestSignups(r.rows, 20)

  return (
    <OwnerShell title="הרשמות">
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        {[['היום', w.today], ['7 ימים', w.last7], ['30 ימים', w.last30]].map(([label, n]) => (
          <div key={String(label)} style={{ ...card, flex: 1, marginBottom: 0, textAlign: 'center' }}>
            <div style={bigNumber}>{n}</div>
            <div style={{ ...muted, fontSize: 13 }}>{label}</div>
          </div>
        ))}
      </div>
      <p style={{ ...muted, marginBottom: 14 }}>בסך הכל {w.total} עסקים אמיתיים (בלי הדמו ובלי העסק שלך).</p>

      <section style={card}>
        <h2 style={h2}>מאיפה הגיעו</h2>
        {sources.length === 0 ? <p style={muted}>עוד אין הרשמות.</p> : (
          <>
            <Row left={<b>מקור</b>} right={<b>30 ימים · סך הכל</b>} />
            {sources.map((s) => <Row key={s.source} left={s.source} right={`${s.last30} · ${s.total}`} />)}
          </>
        )}
      </section>

      <section style={card}>
        <h2 style={h2}>ההרשמות האחרונות</h2>
        {newest.length === 0 ? <p style={muted}>עוד אין הרשמות.</p> : newest.map((n) => (
          <div key={n.id} style={{ padding: '9px 0', borderBottom: '1px solid #F1EBF4' }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{n.name}</div>
            <div style={{ ...muted, fontSize: 13 }}>{dateHe(n.created_at)} · {n.source}</div>
          </div>
        ))}
      </section>
    </OwnerShell>
  )
}
