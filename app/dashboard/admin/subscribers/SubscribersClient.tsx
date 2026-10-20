'use client'

// app/dashboard/admin/subscribers/SubscribersClient.tsx
// The subscribers screen UI. Presentation only: it receives rows the server already built behind requirePlatformAdmin() and holds no
// authority of its own. Saving a note posts to /api/admin/tenant-contact, which repeats the admin check.
//
// Contacting a business is always a link the owner taps (her WhatsApp, her phone, her mail app). Nothing here sends anything.
// Hebrew, RTL, feminine second person.
//
// Design (2026-10-20 pass): the quiet in-app voice of the Kalmea ads. Cream page, white cards with the soft green shadow, Frank
// Ruhl for the title and the numbers, deep green only for text and the one primary action, petal pink for "new", sage for marks
// and chips. Brand tokens only (app/globals.css); no colour is invented here.

import { useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  SEGMENTS, SEGMENT_HE, CONTACT_STATUSES, CONTACT_STATUS_HE, NOTE_MAX,
  filterSubscribers, segmentCounts, needsFirstContact, agoHe, israelDate, isNewSignup,
} from '@/lib/subscribers'
import type { SubscriberRow, Filter, Segment, ContactStatus } from '@/lib/subscribers'
import { dateHe } from '@/lib/ownerControl'
import { buildDigest } from '@/lib/subscriberDigest'
import { daysHe } from '@/lib/planCopy'

// ── tokens (all from app/globals.css) ──────────────────────────────────────
const ink = 'var(--ink)'
const ink2 = 'var(--ink-2)'
const ink3 = 'var(--ink-3)'
const line = 'var(--line)'
const green = 'var(--brand-accent, #1F3A30)'
const cream = 'var(--brand-cream, #FBF8F1)'
const petal = 'var(--k-petal, #FBEDE9)'
const sageWash = 'var(--k-sage, #DCE4D5)'
const sageText = 'var(--brand-sage-text, #666C58)'
const rose = 'var(--brand-highlight-text, #9D5548)'
const roseMark = 'var(--k-pink, #E9A9A1)'
const display = 'var(--display-heavy)'

const SEGMENT_STYLE: Record<Segment, { fg: string; bg: string; border: string }> = {
  new: { fg: rose, bg: petal, border: petal },
  trial: { fg: sageText, bg: sageWash, border: sageWash },
  paying: { fg: cream, bg: green, border: green },
  past_due: { fg: rose, bg: 'var(--surface)', border: rose },
  churned: { fg: ink3, bg: 'var(--surface-2)', border: 'var(--surface-2)' },
}

const FILTERS: Array<'all' | Segment> = ['all', ...SEGMENTS]
/** One business, so the pill is singular (the filters keep the plural). */
const SEGMENT_ONE_HE: Record<Segment, string> = { new: 'חדשה', trial: 'בניסיון', paying: 'משלמת', past_due: 'תשלום בפיגור', churned: 'עזבה' }
const FILTER_HE: Record<'all' | Segment, string> = { all: 'הכל', ...SEGMENT_HE, past_due: 'בפיגור' }

const card: CSSProperties = {
  background: 'var(--surface)', border: `1px solid ${line}`, borderRadius: 'var(--r-lg)', padding: '16px 16px 14px',
  marginBottom: 12, boxShadow: 'var(--shadow-sm)',
}
const muted: CSSProperties = { fontSize: 13, color: ink2, lineHeight: 1.6, margin: 0 }

// ── icons (stroke, currentColor) ───────────────────────────────────────────
const Icon = ({ d, size = 20 }: { d: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
)
const IconChat = () => <Icon d={<path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 21l2.1-5.6A8.4 8.4 0 1 1 21 11.5Z" />} />
const IconPhone = () => <Icon d={<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z" />} />
const IconMail = () => <Icon d={<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>} />
const IconNote = () => <Icon d={<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>} />
const IconSearch = () => <Icon size={18} d={<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>} />

/** A sage check in a pale circle (the ads' checklist mark), or an empty ring for "not yet". */
function Mark({ done, label, unknown }: { done: boolean; label: ReactNode; unknown?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: done ? ink : ink3, whiteSpace: 'nowrap' }}>
      <span aria-hidden style={{
        width: 18, height: 18, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: done ? sageWash : 'transparent', border: done ? 'none' : `1.5px ${unknown ? 'dotted' : 'solid'} var(--line-2)`, color: green,
      }}>
        {done && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7" /></svg>}
      </span>
      {label}
    </span>
  )
}

function Pill({ segment }: { segment: Segment }) {
  const c = SEGMENT_STYLE[segment]
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color: c.fg, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 999, padding: '3px 10px', whiteSpace: 'nowrap', flexShrink: 0 }}>
      {SEGMENT_ONE_HE[segment]}
    </span>
  )
}

/** Tap the number or address to copy it; says so for two seconds. */
function CopyText({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <button type="button" aria-label={`העתקת ${label}`} title="לחיצה מעתיקה"
      onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800) } catch { /* nothing to say */ } }}
      style={{ background: 'none', border: 0, padding: 0, font: 'inherit', fontSize: 13, color: done ? sageText : ink2, cursor: 'copy', direction: 'ltr', unicodeBidi: 'isolate' }}>
      {done ? 'הועתק ✓' : text}
    </button>
  )
}

export default function SubscribersClient({ rows: initialRows, notesAvailable, metricsAvailable, nowIso }: {
  rows: SubscriberRow[]
  notesAvailable: boolean
  metricsAvailable: boolean
  nowIso: string
}) {
  const now = useMemo(() => new Date(nowIso), [nowIso])
  const [rows, setRows] = useState(initialRows)
  const [filter, setFilter] = useState<'all' | Segment>('all')
  const [onlyWaiting, setOnlyWaiting] = useState(false)
  const [query, setQuery] = useState('')

  const counts = useMemo(() => segmentCounts(rows), [rows])
  const visible = useMemo(() => {
    const f = filterSubscribers(rows, filter as Filter, query)
    return onlyWaiting ? f.filter((r) => r.contact.status === 'not_contacted') : f
  }, [rows, filter, query, onlyWaiting])
  const waiting = useMemo(() => rows.filter((r) => needsFirstContact(r, now)).length, [rows, now])
  // The same summary as her morning digest (/api/owner-digest), live: what is due today besides the new signups.
  const today = useMemo(() => buildDigest(rows, now), [rows, now])
  const kpis = useMemo(() => {
    const newThisWeek = rows.filter((r) => isNewSignup(r, now)).length
    const endingSoon = rows.filter((r) => r.trialDaysLeft !== null && r.trialDaysLeft <= 7).length
    const prices = rows.filter((r) => r.segment === 'paying').map((r) => r.planPrice)
    const mrr = prices.length === 0 ? 0 : prices.every((p) => p === null) ? null : prices.reduce<number>((s, p) => s + (p || 0), 0)
    return { newThisWeek, endingSoon, pastDue: counts.past_due, mrr }
  }, [rows, now, counts])

  const onSaved = (id: string, contact: SubscriberRow['contact']) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, contact } : r)))

  return (
    <div dir="rtl" style={{ maxWidth: 780, margin: '0 auto', padding: '8px 16px 56px', fontFamily: 'var(--sans)', color: ink }}>
      <a href="/dashboard/admin" style={{ display: 'inline-block', padding: '8px 0', fontSize: 14, fontWeight: 600, color: ink2, textDecoration: 'none' }}>
        → ניהול מנויים
      </a>
      <h1 style={{ fontFamily: display, fontSize: 30, fontWeight: 800, letterSpacing: '-0.01em', margin: '2px 0 6px', color: green }}>מעקב מנויות</h1>
      <p style={{ ...muted, fontSize: 14, marginBottom: 18, maxWidth: 560 }}>
        כל מי שנרשמה לקלמיה, באיזה שלב היא, ודרך קצרה לדבר איתה. ההודעה נפתחת אצלך מוכנה, ואת שולחת אותה בעצמך.
      </p>

      {(!notesAvailable || !metricsAvailable) && (
        <div style={{ ...card, background: petal, borderColor: petal, boxShadow: 'none' }}>
          {!notesAvailable && <p style={{ ...muted, color: rose }}>שמירת הערות עוד לא זמינה: צריך להריץ את kalmea-sql-admin-tenant-contacts. עד אז כולן מופיעות כ&quot;עוד לא דיברנו&quot;.</p>}
          {!metricsAvailable && <p style={{ ...muted, color: rose, marginTop: notesAvailable ? 0 : 6 }}>נתוני הגדרה ופעילות באפליקציה עוד לא זמינים (platform-admin-view.sql). הפעילות מוצגת לפי הכניסה האחרונה.</p>}
        </div>
      )}

      {/* At a glance: four numbers in Frank Ruhl, the way the ads set a number. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
        {[
          { n: String(kpis.newThisWeek), label: 'נרשמו השבוע', tone: green },
          { n: String(kpis.endingSoon), label: 'ניסיון נגמר השבוע', tone: kpis.endingSoon ? rose : green },
          { n: String(kpis.pastDue), label: 'תשלום בפיגור', tone: kpis.pastDue ? rose : green },
          { n: kpis.mrr === null ? '—' : `₪${kpis.mrr.toLocaleString('he-IL')}`, label: 'הכנסה חודשית', tone: green },
        ].map((k) => (
          <div key={k.label} style={{ ...card, marginBottom: 0, padding: '14px 16px' }}>
            <div style={{ fontFamily: display, fontSize: 28, fontWeight: 800, lineHeight: 1.1, color: k.tone }}>{k.n}</div>
            <div style={{ ...muted, fontSize: 12, marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {waiting > 0 && (
        <button type="button" onClick={() => { setOnlyWaiting(true); setFilter('all') }}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'right', fontFamily: 'inherit', cursor: 'pointer',
            background: petal, border: 0, borderRadius: 'var(--r-lg)', padding: '12px 14px', marginBottom: 14,
          }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand-icons/icon-flower.png" alt="" width={34} height={34} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: ink }}>
              {waiting === 1 ? 'הרשמה חדשה אחת מחכה להיכרות' : `${waiting} הרשמות חדשות מחכות להיכרות`}
            </span>
            <span style={{ ...muted, fontSize: 12 }}>עוד לא דיברת איתן. הן מופיעות ראשונות.</span>
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: green, whiteSpace: 'nowrap' }}>להציג ←</span>
        </button>
      )}

      {/* What is due today besides the new signups: the same lists as her morning digest. A name filters the list to her. */}
      {(today.followUps.length > 0 || today.trialsEnding.length > 0 || today.pastDue.length > 0) && (
        <section aria-label="מה מחכה לך היום" style={{ ...card, background: cream, boxShadow: 'none' }}>
          <div style={{ fontFamily: display, fontSize: 18, fontWeight: 800, color: green, marginBottom: 4 }}>מה מחכה לך היום</div>
          {([
            ['לחזור אליהן', today.followUps.map((x) => ({ id: x.id, name: x.name, note: x.overdueDays > 0 ? `באיחור ${x.overdueDays === 1 ? 'יום' : `${x.overdueDays} ימים`}` : '', alert: x.overdueDays > 0 }))],
            ['הניסיון מסתיים בקרוב', today.trialsEnding.map((x) => ({ id: x.id, name: x.name, note: x.daysLeft <= 0 ? 'היום' : `עוד ${daysHe(x.daysLeft)}`, alert: x.daysLeft <= 1 }))],
            ['תשלום שלא עבר', today.pastDue.map((x) => ({ id: x.id, name: x.name, note: '', alert: true }))],
          ] as Array<[string, Array<{ id: string; name: string; note: string; alert: boolean }>]>).filter(([, items]) => items.length > 0).map(([label, items]) => (
            <div key={label} style={{ marginTop: 8 }}>
              <div style={{ ...muted, fontSize: 12, fontWeight: 700, color: sageText }}>{label} · {items.length}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
                {items.map((x) => (
                  <button key={x.id} type="button" onClick={() => { setFilter('all'); setOnlyWaiting(false); setQuery(x.name) }}
                    style={{ padding: '6px 12px', borderRadius: 999, border: `1px solid ${line}`, background: 'var(--surface)', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', color: ink }}>
                    {x.name}{x.note ? <span style={{ color: x.alert ? rose : ink3 }}> · {x.note}</span> : null}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Search, one scrollable row of stages, and the one toggle that matters. */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)', border: `1px solid ${line}`, borderRadius: 999, padding: '0 14px', marginBottom: 10, color: ink3 }}>
        <IconSearch />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש לפי שם, טלפון או מייל" aria-label="חיפוש מנויות"
          style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent', padding: '11px 0', fontSize: 15, fontFamily: 'inherit', color: ink }} />
      </label>
      <div role="tablist" aria-label="סינון לפי שלב"
        style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', margin: '0 -16px 8px', padding: '0 16px 4px' }}>
        {FILTERS.map((f) => {
          const on = filter === f
          const n = f === 'all' ? counts.all : counts[f]
          return (
            <button key={f} type="button" role="tab" aria-selected={on} onClick={() => setFilter(f)}
              style={{
                flexShrink: 0, padding: '7px 14px', borderRadius: 999, fontSize: 14, fontWeight: on ? 700 : 500, fontFamily: 'inherit', cursor: 'pointer',
                border: `1px solid ${on ? green : line}`, background: on ? green : 'var(--surface)', color: on ? cream : ink2,
              }}>
              {FILTER_HE[f]}<span style={{ opacity: 0.7, marginInlineStart: 6 }}>{n}</span>
            </button>
          )
        })}
      </div>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: ink2, marginBottom: 14, cursor: 'pointer' }}>
        <input type="checkbox" checked={onlyWaiting} onChange={(e) => setOnlyWaiting(e.target.checked)} style={{ accentColor: 'var(--k-green)', width: 16, height: 16 }} />
        רק מי שעוד לא דיברנו איתה ({counts.not_contacted})
      </label>

      {visible.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '28px 16px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand-icons/icon-flower.png" alt="" width={40} height={40} style={{ opacity: 0.7 }} />
          <p style={{ ...muted, fontSize: 15, marginTop: 8 }}>{rows.length === 0 ? 'עוד אין הרשמות.' : 'אין מי שמתאימה לסינון הזה.'}</p>
        </div>
      ) : visible.map((r) => (
        <SubscriberCard key={r.id} row={r} now={now} notesAvailable={notesAvailable} onSaved={onSaved} />
      ))}
    </div>
  )
}

function SubscriberCard({ row: r, now, notesAvailable, onSaved }: {
  row: SubscriberRow
  now: Date
  notesAvailable: boolean
  onSaved: (id: string, contact: SubscriberRow['contact']) => void
}) {
  const [open, setOpen] = useState(false)
  const firstContact = needsFirstContact(r, now)
  const activity = agoHe(r.lastActivityAt, now)
  const quiet = r.lastActivityAt ? (now.getTime() - Date.parse(r.lastActivityAt)) / 86_400_000 > 14 : false
  const due = r.contact.status === 'follow_up' && !!r.contact.followUpOn && r.contact.followUpOn <= israelDate(now)
  const signedUp = agoHe(r.createdAt, now)

  const circle: CSSProperties = {
    width: 44, height: 44, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--surface-2)', color: green, border: 0, cursor: 'pointer', textDecoration: 'none', flexShrink: 0,
  }

  return (
    <section style={card}>
      {/* Who, and one stage pill. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: display, fontSize: 19, fontWeight: 700, color: green, overflowWrap: 'anywhere', lineHeight: 1.25 }}>{r.businessName}</div>
          {r.ownerName && <div style={{ ...muted, fontSize: 14 }}>{r.ownerName}</div>}
        </div>
        <Pill segment={r.segment} />
      </div>

      {(firstContact || due) && (
        <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: rose, margin: '8px 0 0' }}>
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: roseMark }} />
          {due ? 'לחזור אליה היום' : 'עוד לא דיברנו'}
        </p>
      )}

      {/* One quiet line of facts. */}
      <p style={{ ...muted, marginTop: 8 }}>
        {signedUp ? `נרשמה ${signedUp}` : `נרשמה ${dateHe(r.createdAt) || '—'}`}
        {r.source ? ` · ${r.source}` : ''}
        {r.trialDaysLeft !== null && (
          <span style={{ color: r.trialDaysLeft <= 7 ? rose : ink2, fontWeight: r.trialDaysLeft <= 7 ? 700 : 400 }}>
            {' · '}{r.trialDaysLeft === 0 ? 'הניסיון נגמר היום' : `נותרו ${daysHe(r.trialDaysLeft)} לניסיון`}
          </span>
        )}
        {r.segment === 'paying' && r.planPrice !== null && ` · ₪${r.planPrice.toLocaleString('he-IL')} לחודש`}
        <span style={{ color: quiet ? rose : ink2 }}>{' · '}{activity ? `פעילה ${activity}` : 'פעילות לא ידועה'}</span>
      </p>

      {/* The ads' checklist: what she has set up. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 16, rowGap: 6, marginTop: 10 }}>
        {r.setupScore !== null && r.setupTotal ? (
          <Mark done={r.setupScore >= r.setupTotal} label={`הגדרה ${r.setupScore}/${r.setupTotal}`} />
        ) : null}
        <Mark done={!!r.whatsappSet} unknown={r.whatsappSet === null} label="וואטסאפ" />
        <Mark done={!!r.bookingLinkSet} unknown={r.bookingLinkSet === null}
          label={r.bookingLinkSet && r.bookingUrl ? <a href={r.bookingUrl} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>דף הזמנות</a> : 'דף הזמנות'} />
        {r.appointmentCount !== null && <span style={{ fontSize: 13, color: ink3 }}>{r.appointmentCount.toLocaleString('he-IL')} תורים</span>}
        {/* What her messages cost: the central number's count, and the official channel's estimated cost to Kalmea. */}
        {(r.whatsappSent30d || r.cloudMessages30d) ? (
          <span style={{ fontSize: 13, color: ink3 }} title="הודעות וואטסאפ ב-30 הימים האחרונים">
            {((r.whatsappSent30d || 0) + (r.cloudMessages30d || 0)).toLocaleString('he-IL')} הודעות ב-30 יום
            {r.cloudCostUsd30d ? <span dir="ltr"> · ~${r.cloudCostUsd30d.toFixed(2)}</span> : null}
          </span>
        ) : null}
      </div>

      {(r.phone || r.email) && (
        <p style={{ ...muted, marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: '2px 14px' }}>
          {r.phone && <CopyText text={r.phone} label={`הטלפון של ${r.businessName}`} />}
          {r.email && <CopyText text={r.email} label={`המייל של ${r.businessName}`} />}
        </p>
      )}

      {/* One primary action, the rest as quiet round icons. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
        {r.links.whatsapp ? (
          <a href={r.links.whatsapp} target="_blank" rel="noreferrer"
            style={{
              flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, borderRadius: 999,
              background: green, color: cream, fontSize: 15, fontWeight: 700, textDecoration: 'none',
            }}>
            <IconChat /> וואטסאפ
          </a>
        ) : (
          <span style={{ flex: 1, ...muted }}>{r.links.call || r.links.email ? 'אין נייד לוואטסאפ' : 'אין פרטי קשר'}</span>
        )}
        {r.links.call && <a href={r.links.call} style={circle} aria-label={`שיחה ל${r.businessName}`} title="שיחה"><IconPhone /></a>}
        {r.links.email && <a href={r.links.email} style={circle} aria-label={`מייל ל${r.businessName}`} title="מייל"><IconMail /></a>}
        {notesAvailable && (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="מעקב והערות" title="מעקב והערות"
            style={{ ...circle, background: open ? sageWash : 'var(--surface-2)' }}>
            <IconNote />
          </button>
        )}
      </div>

      {notesAvailable && !open && (r.contact.status !== 'not_contacted' || r.contact.note) && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${line}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: ink }}>
            {CONTACT_STATUS_HE[r.contact.status]}
            {r.contact.status === 'follow_up' && r.contact.followUpOn ? ` · ${dateHe(`${r.contact.followUpOn}T12:00:00Z`)}` : ''}
            {r.contact.updatedAt ? <span style={{ fontWeight: 400, color: ink3 }}> · עודכן {dateHe(r.contact.updatedAt)}</span> : null}
          </div>
          {r.contact.note && <p style={{ ...muted, marginTop: 2, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{r.contact.note}</p>}
        </div>
      )}

      {notesAvailable && open && <ContactEditor row={r} onSaved={(c) => { onSaved(r.id, c); setOpen(false) }} />}
    </section>
  )
}

function ContactEditor({ row, onSaved }: { row: SubscriberRow; onSaved: (c: SubscriberRow['contact']) => void }) {
  const [status, setStatus] = useState<ContactStatus>(row.contact.status === 'not_contacted' ? 'contacted' : row.contact.status)
  const [note, setNote] = useState(row.contact.note)
  const [followUpOn, setFollowUpOn] = useState(row.contact.followUpOn || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/tenant-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: row.id, status, note, followUpOn: status === 'follow_up' ? followUpOn : '' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.contact) { setError(data?.error || 'השמירה נכשלה. נסי שוב.'); return }
      onSaved(data.contact as SubscriberRow['contact'])
    } catch {
      setError('השמירה נכשלה. בדקי את החיבור ונסי שוב.')
    } finally {
      setSaving(false)
    }
  }

  const field: CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 'var(--r-sm)', border: `1px solid ${line}`,
    fontSize: 15, fontFamily: 'inherit', background: 'var(--surface)', color: ink,
  }
  const lbl: CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: ink2, marginBottom: 6 }

  return (
    <div style={{ marginTop: 12, padding: 14, background: 'var(--surface-2)', borderRadius: 'var(--r-md)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <span style={lbl}>איפה זה עומד</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} role="radiogroup" aria-label="סטטוס מעקב">
          {CONTACT_STATUSES.map((s) => {
            const on = status === s
            return (
              <button key={s} type="button" role="radio" aria-checked={on} onClick={() => setStatus(s)}
                style={{
                  padding: '6px 12px', borderRadius: 999, fontSize: 13, fontWeight: on ? 700 : 500, fontFamily: 'inherit', cursor: 'pointer',
                  border: `1px solid ${on ? green : 'var(--line-2)'}`, background: on ? green : 'var(--surface)', color: on ? cream : ink2,
                }}>{CONTACT_STATUS_HE[s]}</button>
            )
          })}
        </div>
      </div>
      {status === 'follow_up' && (
        <label>
          <span style={lbl}>מתי לחזור אליה</span>
          <input type="date" value={followUpOn} onChange={(e) => setFollowUpOn(e.target.value)} style={field} />
        </label>
      )}
      <label>
        <span style={lbl}>הערה</span>
        <textarea value={note} maxLength={NOTE_MAX} rows={3} onChange={(e) => setNote(e.target.value)}
          placeholder="למשל: דיברנו, ביקשה עזרה בהגדרת השירותים. לחזור אחרי החג."
          style={{ ...field, resize: 'vertical', lineHeight: 1.6 }} />
      </label>
      {error && <p style={{ fontSize: 14, color: rose, margin: 0 }}>{error}</p>}
      <button type="button" onClick={save} disabled={saving}
        style={{
          alignSelf: 'flex-start', minHeight: 44, padding: '0 26px', borderRadius: 999, border: 0, background: green, color: cream,
          fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
        }}>
        {saving ? 'שומרת…' : 'שמירה'}
      </button>
    </div>
  )
}
