'use client'

// app/dashboard/admin/subscribers/SubscribersClient.tsx
// The subscribers screen UI. Presentation only: it receives rows the server already built behind requirePlatformAdmin() and holds no
// authority of its own. Saving a note posts to /api/admin/tenant-contact, which repeats the admin check.
//
// Contacting a business is always a link the owner taps (her WhatsApp, her phone, her mail app). Nothing here sends anything.
// Hebrew, RTL, feminine second person.

import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  SEGMENTS, SEGMENT_HE, CONTACT_STATUSES, CONTACT_STATUS_HE, NOTE_MAX,
  filterSubscribers, segmentCounts, needsFirstContact, agoHe, israelDate,
} from '@/lib/subscribers'
import type { SubscriberRow, Filter, Segment, ContactStatus } from '@/lib/subscribers'
import { dateHe } from '@/lib/ownerControl'
import { daysHe } from '@/lib/planCopy'
import CopyButton from '../../owner/signups/CopyButton'

const ink = '#2A2233'
const ink2 = '#5C4F63'
const line = '#E7DFEC'
const green = '#183024'

const SEGMENT_COLOR: Record<Segment, { fg: string; bg: string; border: string }> = {
  new: { fg: '#2F5E8A', bg: '#EAF2FA', border: '#CFE0F0' },
  trial: { fg: '#8A6A2F', bg: '#FBF3E2', border: '#EADFC4' },
  paying: { fg: '#4E7A55', bg: '#EDF4EE', border: '#D3E5D6' },
  past_due: { fg: '#9A5148', bg: '#FAEDEB', border: '#EBD4D0' },
  churned: { fg: '#5F5A6B', bg: '#F1F0F4', border: '#DEDCE4' },
}

const FILTERS: Filter[] = ['all', 'not_contacted', ...SEGMENTS]
const FILTER_HE: Record<Filter, string> = { all: 'הכל', not_contacted: 'עוד לא דיברנו', ...SEGMENT_HE }

const card: CSSProperties = { background: '#fff', border: `1px solid ${line}`, borderRadius: 16, padding: '14px 16px', marginBottom: 12 }
const pill = (c: { fg: string; bg: string; border: string }): CSSProperties => ({
  fontSize: 13, fontWeight: 600, color: c.fg, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 999, padding: '3px 10px', whiteSpace: 'nowrap',
})
const actionBtn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 14px', borderRadius: 999,
  border: `1px solid ${green}`, color: green, background: '#fff', fontSize: 14, fontWeight: 600, textDecoration: 'none',
  whiteSpace: 'nowrap', fontFamily: 'inherit', cursor: 'pointer', minHeight: 40,
}
const muted: CSSProperties = { fontSize: 13, color: ink2, lineHeight: 1.6 }

export default function SubscribersClient({ rows: initialRows, notesAvailable, metricsAvailable, nowIso }: {
  rows: SubscriberRow[]
  notesAvailable: boolean
  metricsAvailable: boolean
  nowIso: string
}) {
  const now = useMemo(() => new Date(nowIso), [nowIso])
  const [rows, setRows] = useState(initialRows)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  const counts = useMemo(() => segmentCounts(rows), [rows])
  const visible = useMemo(() => filterSubscribers(rows, filter, query), [rows, filter, query])
  const waiting = useMemo(() => rows.filter((r) => needsFirstContact(r, now)).length, [rows, now])

  const onSaved = (id: string, contact: SubscriberRow['contact']) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, contact } : r)))

  return (
    <div dir="rtl" style={{ maxWidth: 760, margin: '0 auto', padding: '8px 16px 48px', fontFamily: "'Heebo','Assistant',sans-serif", color: ink }}>
      <a href="/dashboard/admin" style={{ display: 'inline-block', padding: '8px 0', fontSize: 15, fontWeight: 600, color: green, textDecoration: 'none' }}>
        ← חזרה לניהול מנויים
      </a>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: '4px 0 6px' }}>מעקב מנויות</h1>
      <p style={{ ...muted, fontSize: 14, marginBottom: 14 }}>
        כל העסקים שנרשמו לקלמיה, באיזה שלב הן, ודרך מהירה לדבר עם כל אחת. ההודעה בוואטסאפ נפתחת אצלך מוכנה, ואת שולחת אותה בעצמך.
      </p>

      {!notesAvailable && (
        <div style={{ ...card, background: '#FBF3E2', borderColor: '#EADFC4' }}>
          <p style={{ ...muted, color: '#6B5326', margin: 0 }}>
            שמירת הערות ומעקב "דיברנו" עוד לא זמינים: צריך להריץ את קובץ ה-SQL kalmea-sql-admin-tenant-contacts. עד אז כולן מופיעות כ"עוד לא דיברנו".
          </p>
        </div>
      )}
      {!metricsAvailable && (
        <div style={{ ...card, background: '#FBF3E2', borderColor: '#EADFC4' }}>
          <p style={{ ...muted, color: '#6B5326', margin: 0 }}>
            נתוני הגדרה ופעילות בתוך האפליקציה עוד לא זמינים (platform-admin-view.sql). הפעילות מוצגת לפי הכניסה האחרונה בלבד.
          </p>
        </div>
      )}

      {waiting > 0 && (
        <button type="button" onClick={() => setFilter('not_contacted')}
          style={{ ...card, width: '100%', textAlign: 'right', background: '#EAF2FA', borderColor: '#CFE0F0', cursor: 'pointer', fontFamily: 'inherit', display: 'block' }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#2F5E8A' }}>
            {waiting === 1 ? 'הרשמה חדשה אחת שעוד לא דיברת איתה' : `${waiting} הרשמות חדשות שעוד לא דיברת איתן`}
          </span>
          <span style={{ ...muted, display: 'block' }}>הן מופיעות ראשונות ברשימה.</span>
        </button>
      )}

      <input
        type="search" value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder="חיפוש לפי שם עסק, שם, טלפון או מייל"
        aria-label="חיפוש מנויות"
        style={{ width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 12, border: `1px solid ${line}`, fontSize: 15, fontFamily: 'inherit', marginBottom: 10, background: '#fff' }}
      />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }} role="tablist" aria-label="סינון לפי שלב">
        {FILTERS.map((f) => {
          const on = filter === f
          return (
            <button key={f} type="button" role="tab" aria-selected={on} onClick={() => setFilter(f)}
              style={{
                padding: '7px 12px', borderRadius: 999, fontSize: 14, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                border: `1px solid ${on ? green : line}`, background: on ? green : '#fff', color: on ? '#fff' : ink,
              }}>
              {FILTER_HE[f]} · {counts[f]}
            </button>
          )
        })}
      </div>

      {visible.length === 0 ? (
        <p style={{ ...muted, fontSize: 15 }}>{rows.length === 0 ? 'עוד אין הרשמות.' : 'אין עסקים שמתאימים לסינון הזה.'}</p>
      ) : visible.map((r) => (
        <SubscriberCard key={r.id} row={r} now={now} notesAvailable={notesAvailable} onSaved={onSaved} />
      ))}
    </div>
  )
}

function Check({ ok, label, unknown }: { ok: boolean; label: string; unknown?: boolean }) {
  return (
    <span style={{ fontSize: 13, color: unknown ? ink2 : ok ? '#4E7A55' : '#9A5148', whiteSpace: 'nowrap' }}>
      {unknown ? '·' : ok ? '✓' : '✗'} {label}
    </span>
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
  const hasLink = r.links.whatsapp || r.links.call || r.links.email
  const due = r.contact.status === 'follow_up' && r.contact.followUpOn && r.contact.followUpOn <= israelDate(now)

  return (
    <section style={{ ...card, borderColor: firstContact ? '#CFE0F0' : line, boxShadow: firstContact ? 'inset -4px 0 0 #2F5E8A' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 220px' }}>
          <div style={{ fontSize: 17, fontWeight: 700, overflowWrap: 'anywhere' }}>{r.businessName}</div>
          {r.ownerName && <div style={{ fontSize: 14, color: ink2 }}>{r.ownerName}</div>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {firstContact && <span style={pill({ fg: '#fff', bg: '#2F5E8A', border: '#2F5E8A' })}>חדשה · עוד לא דיברנו</span>}
          {due && <span style={pill({ fg: '#fff', bg: '#9A5148', border: '#9A5148' })}>לחזור אליה היום</span>}
          <span style={pill(SEGMENT_COLOR[r.segment])}>{SEGMENT_HE[r.segment]}</span>
        </div>
      </div>

      <div style={{ ...muted, marginTop: 8, display: 'flex', flexWrap: 'wrap', columnGap: 14, rowGap: 2 }}>
        <span>נרשמה {dateHe(r.createdAt) || '—'}{r.source ? ` · ${r.source}` : ''}</span>
        {r.trialDaysLeft !== null && (
          <span style={{ color: r.trialDaysLeft <= 7 ? '#9A5148' : ink2, fontWeight: r.trialDaysLeft <= 7 ? 600 : 400 }}>
            {r.trialDaysLeft === 0 ? 'הניסיון מסתיים היום' : `נותרו ${daysHe(r.trialDaysLeft)} בניסיון`}
          </span>
        )}
        {r.segment === 'paying' && r.planPrice !== null && <span>₪{r.planPrice.toLocaleString('he-IL')} לחודש</span>}
        <span style={{ color: quiet ? '#9A5148' : ink2 }}>פעילות אחרונה: {activity || 'לא ידוע'}</span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 14, rowGap: 6, marginTop: 8 }}>
        {r.setupScore !== null && r.setupTotal ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: ink2 }}>
            הגדרה {r.setupScore}/{r.setupTotal}
            <span aria-hidden style={{ width: 70, height: 6, background: '#F1EBF4', borderRadius: 999, overflow: 'hidden', display: 'inline-block' }}>
              <span style={{ display: 'block', height: '100%', width: `${Math.round((r.setupScore / r.setupTotal) * 100)}%`, background: r.setupScore >= r.setupTotal ? '#4E7A55' : '#C9A24B' }} />
            </span>
          </span>
        ) : null}
        <Check ok={!!r.whatsappSet} unknown={r.whatsappSet === null} label="וואטסאפ" />
        {r.bookingLinkSet && r.bookingUrl ? (
          <a href={r.bookingUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#4E7A55', whiteSpace: 'nowrap' }}>✓ דף הזמנות</a>
        ) : (
          <Check ok={false} unknown={r.bookingLinkSet === null} label="דף הזמנות" />
        )}
        {r.appointmentCount !== null && <span style={{ fontSize: 13, color: ink2 }}>{r.appointmentCount.toLocaleString('he-IL')} תורים</span>}
      </div>

      {(r.phone || r.email) && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {r.phone && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ ...muted, width: 44, flexShrink: 0 }}>טלפון</span>
              <span dir="ltr" style={{ flex: 1, minWidth: 0, fontSize: 14, textAlign: 'right', overflowWrap: 'anywhere' }}>{r.phone}</span>
              <CopyButton text={r.phone} ariaLabel={`העתקת הטלפון של ${r.businessName}`} />
            </div>
          )}
          {r.email && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ ...muted, width: 44, flexShrink: 0 }}>מייל</span>
              <span dir="ltr" style={{ flex: 1, minWidth: 0, fontSize: 14, textAlign: 'right', overflowWrap: 'anywhere' }}>{r.email}</span>
              <CopyButton text={r.email} ariaLabel={`העתקת המייל של ${r.businessName}`} />
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        {r.links.whatsapp && <a href={r.links.whatsapp} target="_blank" rel="noreferrer" style={{ ...actionBtn, background: green, color: '#fff' }}>וואטסאפ</a>}
        {r.links.call && <a href={r.links.call} style={actionBtn}>שיחה</a>}
        {r.links.email && <a href={r.links.email} style={actionBtn}>מייל</a>}
        {!hasLink && <span style={muted}>אין פרטי קשר שאפשר ללחוץ עליהם.</span>}
        {notesAvailable && (
          <button type="button" onClick={() => setOpen((o) => !o)} style={{ ...actionBtn, borderColor: line, color: ink }} aria-expanded={open}>
            {open ? 'סגירה' : r.contact.note || r.contact.status !== 'not_contacted' ? 'עריכת מעקב' : 'הוספת הערה'}
          </button>
        )}
      </div>

      {notesAvailable && !open && (r.contact.status !== 'not_contacted' || r.contact.note) && (
        <div style={{ marginTop: 10, padding: '8px 12px', background: '#FBF9F8', borderRadius: 10, border: `1px solid ${line}` }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {CONTACT_STATUS_HE[r.contact.status]}
            {r.contact.status === 'follow_up' && r.contact.followUpOn ? ` · ${dateHe(`${r.contact.followUpOn}T12:00:00Z`)}` : ''}
            {r.contact.updatedAt ? <span style={{ fontWeight: 400, color: ink2 }}> · עודכן {dateHe(r.contact.updatedAt)}</span> : null}
          </div>
          {r.contact.note && <p style={{ ...muted, margin: '4px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{r.contact.note}</p>}
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

  const field: CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 10, border: `1px solid ${line}`, fontSize: 15, fontFamily: 'inherit', background: '#fff' }

  return (
    <div style={{ marginTop: 12, padding: 12, background: '#FBF9F8', borderRadius: 12, border: `1px solid ${line}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label style={{ fontSize: 13, fontWeight: 600 }}>
        סטטוס
        <select value={status} onChange={(e) => setStatus(e.target.value as ContactStatus)} style={{ ...field, marginTop: 4 }}>
          {CONTACT_STATUSES.map((s) => <option key={s} value={s}>{CONTACT_STATUS_HE[s]}</option>)}
        </select>
      </label>
      {status === 'follow_up' && (
        <label style={{ fontSize: 13, fontWeight: 600 }}>
          מתי לחזור אליה
          <input type="date" value={followUpOn} onChange={(e) => setFollowUpOn(e.target.value)} style={{ ...field, marginTop: 4 }} />
        </label>
      )}
      <label style={{ fontSize: 13, fontWeight: 600 }}>
        הערה
        <textarea value={note} maxLength={NOTE_MAX} rows={3} onChange={(e) => setNote(e.target.value)}
          placeholder="למשל: דיברנו, ביקשה עזרה בהגדרת השירותים. לחזור אחרי החג."
          style={{ ...field, marginTop: 4, resize: 'vertical', lineHeight: 1.6 }} />
      </label>
      {error && <p style={{ fontSize: 14, color: '#9A5148', margin: 0 }}>{error}</p>}
      <div>
        <button type="button" onClick={save} disabled={saving}
          style={{ ...actionBtn, background: green, color: '#fff', opacity: saving ? 0.6 : 1, cursor: saving ? 'default' : 'pointer' }}>
          {saving ? 'שומרת...' : 'שמירה'}
        </button>
      </div>
    </div>
  )
}
