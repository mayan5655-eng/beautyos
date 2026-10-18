// app/dashboard/owner/signups/page.tsx
// Screen A, "הרשמות": signups today / 7 days / 30 days, by source, and the newest ones. Tenant-level metadata, plus (for platform admins
// only, built on the server in ../loader.ts) each new business's phone and account email with copy buttons, and one contact link.
// Nothing is sent from here: the link opens her own WhatsApp or mail, and copying only puts the text on her clipboard.
import { loadSignupsPage } from '../loader'
import { OwnerShell, Unavailable, Row, card, muted, h2, bigNumber } from '../OwnerShell'
import { signupWindows, signupsBySource, dateHe } from '@/lib/ownerControl'
import CopyButton from './CopyButton'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function OwnerSignupsPage() {
  const r = await loadSignupsPage()
  if (!r.ok) {
    return <OwnerShell title="הרשמות"><Unavailable>לא הצלחנו לטעון את הנתונים כרגע. אפשר לנסות שוב בעוד רגע.</Unavailable></OwnerShell>
  }
  const now = new Date()
  const w = signupWindows(r.rows, now)
  const sources = signupsBySource(r.rows, now)
  const { newest, contacts } = r

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
        {newest.length === 0 ? <p style={muted}>עוד אין הרשמות.</p> : newest.map((n) => {
          const c = contacts[n.id]
          // One line with everything, for pasting into a note or a spreadsheet.
          const all = [n.name, c?.phone, c?.email].filter(Boolean).join(' · ')
          return (
            <div key={n.id} style={{ padding: '10px 0', borderBottom: '1px solid #F1EBF4' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, overflowWrap: 'anywhere' }}>{n.name}</div>
                  <div style={{ ...muted, fontSize: 13 }}>{dateHe(n.created_at)} · {n.source}</div>
                </div>
                {c?.link && (
                  <a href={c.link.href} target="_blank" rel="noreferrer" style={{ flexShrink: 0, padding: '8px 14px', borderRadius: 999, border: '1px solid #183024', color: '#183024', fontSize: 14, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                    {c.link.kind === 'whatsapp' ? 'לכתוב בוואטסאפ' : 'לכתוב במייל'}
                  </a>
                )}
              </div>
              {c && (c.phone || c.email) ? (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {c.phone && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ ...muted, fontSize: 13, width: 44, flexShrink: 0 }}>טלפון</span>
                      <span dir="ltr" style={{ flex: 1, minWidth: 0, fontSize: 14, textAlign: 'right', overflowWrap: 'anywhere' }}>{c.phone}</span>
                      <CopyButton text={c.phone} ariaLabel={`העתקת הטלפון של ${n.name}`} />
                    </div>
                  )}
                  {c.email && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ ...muted, fontSize: 13, width: 44, flexShrink: 0 }}>מייל</span>
                      <span dir="ltr" style={{ flex: 1, minWidth: 0, fontSize: 14, textAlign: 'right', overflowWrap: 'anywhere' }}>{c.email}</span>
                      <CopyButton text={c.email} ariaLabel={`העתקת המייל של ${n.name}`} />
                    </div>
                  )}
                  <div><CopyButton text={all} label="העתקת כל הפרטים" ariaLabel={`העתקת כל הפרטים של ${n.name}`} /></div>
                </div>
              ) : (
                // Demo, test-looking names and her own business are skipped on purpose; anyone else simply left nothing to reach.
                <p style={{ ...muted, fontSize: 13, marginTop: 4 }}>אין פרטי קשר.</p>
              )}
            </div>
          )
        })}
      </section>
    </OwnerShell>
  )
}
