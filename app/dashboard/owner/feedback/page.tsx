// app/dashboard/owner/feedback/page.tsx
// What businesses answered in the feedback banner: the averages, then every answer, newest first.
import { loadFeedback } from '../loader'
import { OwnerShell, Unavailable, Row, card, muted, h2, bigNumber } from '../OwnerShell'
import { dateHe } from '@/lib/ownerControl'
import { FEEDBACK_QUESTIONS, NOT_YET, faceFor, feedbackSummary } from '@/lib/feedbackBanner'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n)

export default async function OwnerFeedbackPage() {
  const res = await loadFeedback()
  if (!res.ok) {
    return (
      <OwnerShell title="משובים">
        <Unavailable>
          {res.reason === 'table-missing'
            ? 'עוד אין לאן לשמור משובים: צריך להריץ את קובץ ה-SQL add_product_feedback_2026-10-30. עד אז הבאנר לא קופץ לאף אחת.'
            : 'לא הצלחנו לקרוא את המשובים כרגע.'}
        </Unavailable>
      </OwnerShell>
    )
  }
  const summary = feedbackSummary(res.rows)
  return (
    <OwnerShell title="משובים">
      <section style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={bigNumber}>{summary.count}</div>
            <p style={muted}>ענו</p>
          </div>
          <div>
            <div style={bigNumber}>{summary.avgRating ?? '-'}</div>
            <p style={muted}>ממוצע כוכבים</p>
          </div>
        </div>
      </section>

      <section style={card}>
        <h2 style={h2}>לפי שאלה (מתוך 5)</h2>
        {summary.questions.map((q) => (
          <Row key={q.id} left={q.label} right={q.avg === null ? 'אין תשובות' : `${q.avg} · ${q.answered} ענו${q.notYet ? ` · ${q.notYet} לא צפו` : ''}`} />
        ))}
      </section>

      {res.rows.length === 0 ? <p style={muted}>עוד אף אחת לא ענתה.</p> : res.rows.map((r) => (
        <section key={r.tenant_id} style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
            <strong style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{r.name}</strong>
            <span style={{ ...muted, whiteSpace: 'nowrap' }}>{dateHe(r.created_at)}</span>
          </div>
          <div aria-label={`${r.rating} כוכבים`} style={{ color: '#183024', fontSize: 18, marginBottom: 6 }}>{stars(r.rating)}</div>
          {FEEDBACK_QUESTIONS.map((q) => {
            const a = r.answers?.[q.id]
            return <Row key={q.id} left={q.shortLabel} right={a === NOT_YET ? 'עוד לא צפתה' : faceFor(a) || 'דילגה'} />
          })}
          {r.free_text && <p style={{ ...muted, marginTop: 10, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{r.free_text}</p>}
        </section>
      ))}
    </OwnerShell>
  )
}
