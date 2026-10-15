// app/dashboard/owner/activity/page.tsx
// Screen C, "פעילות": when each business last CREATED something (an appointment, a client or a receipt), as one
// timestamp per business. This is the same signal the admin panel already shows in its "פעילות אחרונה" column; it is not
// a login or a page view, and the screen says so. If the database function behind it has not been run, the screen says the
// signal is not available yet and shows nothing else - it never substitutes a guess.
import { loadActivity } from '../loader'
import { OwnerShell, Unavailable, Row, card, muted, h2 } from '../OwnerShell'
import { dateHe } from '@/lib/ownerControl'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const metadata = { title: 'פעילות · בקרה', robots: { index: false, follow: false } }

export default async function OwnerActivityPage() {
  const r = await loadActivity()
  return (
    <OwnerShell title="פעילות">
      {!r.ok ? (
        <Unavailable>הנתון על פעילות אחרונה עוד לא זמין. הוא יופיע כאן כשהחיבור שלו לבסיס הנתונים יושלם.</Unavailable>
      ) : (
        <section style={card}>
          <h2 style={h2}>פעילות אחרונה לפי עסק</h2>
          <p style={{ ...muted, marginBottom: 8 }}>התאריך האחרון שבו נוצר בעסק תור, לקוחה או קבלה. זו לא כניסה למערכת.</p>
          {r.rows.length === 0 ? <p style={muted}>עוד אין עסקים.</p> : r.rows.map((a) => (
            <Row key={a.id} left={a.name} right={a.lastActivityAt ? dateHe(a.lastActivityAt) : 'עוד לא נוצר כלום'} />
          ))}
        </section>
      )}
      <p style={muted}>
        עדכוני ההצטרפות מ-Grow: <a href="/dashboard/admin#grow-onboarding" style={{ color: '#183024', fontWeight: 600 }}>הרשימה בניהול מנויים</a>
      </p>
    </OwnerShell>
  )
}
