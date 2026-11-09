'use client'

// app/dashboard/admin/outreach/OutreachClient.tsx
// The outreach screen UI. Presentation only: it receives rows the server built behind requirePlatformAdmin() and holds no
// authority of its own. Every save posts to /api/admin/prospects, which repeats the admin check.
//
// NOTHING HERE SENDS A MESSAGE. "שליחה בוואטסאפ" is a wa.me link that opens WhatsApp on her own phone with the text typed in;
// she presses send herself. The tap also records the date. Whoever declined or asked to stop gets no send button at all (the
// route refuses as well). Hebrew, RTL, feminine second person. Brand tokens only (app/globals.css).

import { useMemo, useState } from 'react'
import type { CSSProperties, ReactNode, ChangeEvent, FormEvent } from 'react'
import {
  PROSPECT_STATUSES, PROSPECT_STATUS_HE, TREATMENTS, TREATMENT_HE, SOURCES, SOURCE_HE, DAILY_SOFT_LIMIT, DAILY_LIMIT_HE,
  MIGRATION_NEEDED_HE, MIGRATION_FILE, CHANNEL_HE, NAME_MAX, CITY_MAX, NOTES_MAX, RECENT_DAYS,
  canSend, contactedRecently, outreachCounts, sentToday, parsePastedProspects, sortProspects,
} from '@/lib/prospects'
import type { Prospect, ProspectStatus, Treatment, ProspectSource } from '@/lib/prospects'
import { prospectWaLink, instagramMessage, instagramDmLink, whatsappMessage } from '@/lib/prospectTemplates'
import { agoHe } from '@/lib/subscribers'

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
const display = 'var(--display-heavy)'

const card: CSSProperties = {
  background: 'var(--surface)', border: `1px solid ${line}`, borderRadius: 'var(--r-lg)', padding: '14px 14px 12px',
  marginBottom: 12, boxShadow: 'var(--shadow-sm)',
}
const muted: CSSProperties = { fontSize: 13, color: ink2, lineHeight: 1.6, margin: 0 }
const input: CSSProperties = {
  width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 15, color: ink, background: 'var(--surface)',
  border: `1px solid var(--line-2, ${line})`, borderRadius: 'var(--r-md)', padding: '10px 12px', minHeight: 44,
}
const primary: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, padding: '0 16px',
  fontFamily: 'inherit', fontSize: 15, fontWeight: 700, color: cream, background: green, border: 0, borderRadius: 999,
  textDecoration: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
}
const secondary: CSSProperties = { ...primary, color: green, background: 'var(--surface)', border: `1px solid ${green}` }
const chip = (on: boolean): CSSProperties => ({
  fontFamily: 'inherit', fontSize: 13, fontWeight: 600, minHeight: 36, padding: '0 12px', borderRadius: 999, cursor: 'pointer',
  border: `1px solid ${on ? green : line}`, background: on ? green : 'var(--surface)', color: on ? cream : ink2, whiteSpace: 'nowrap',
})

const STATUS_STYLE: Record<ProspectStatus, { fg: string; bg: string }> = {
  new: { fg: rose, bg: petal },
  messaged: { fg: sageText, bg: sageWash },
  replied: { fg: green, bg: sageWash },
  trial: { fg: green, bg: sageWash },
  paying: { fg: cream, bg: green },
  not_interested: { fg: ink3, bg: 'var(--surface-2)' },
  opted_out: { fg: ink3, bg: 'var(--surface-2)' },
}

type Filter = 'all' | 'new' | 'messaged' | 'replied' | 'trial' | 'paying' | 'closed'
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'הכל' }, { id: 'new', label: 'חדשות' }, { id: 'messaged', label: 'נשלחה הודעה' }, { id: 'replied', label: 'ענו' },
  { id: 'trial', label: 'בניסיון' }, { id: 'paying', label: 'משלמות' }, { id: 'closed', label: 'לא פונים שוב' },
]
const matchesFilter = (r: Prospect, f: Filter) =>
  f === 'all' ? true : f === 'closed' ? !canSend(r.status) : f === 'trial' ? r.status === 'trial' || (r.signedUp && canSend(r.status) && r.status !== 'paying') : r.status === f

const displayPhone = (e164: string | null) => (e164 && e164.startsWith('972') ? `0${e164.slice(3, 5)}-${e164.slice(5, 8)}-${e164.slice(8)}` : e164 || '')

async function post(body: Record<string, unknown>): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const res = await fetch('/api/admin/prospects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, data }
  } catch {
    return { ok: false, data: { error: 'אין חיבור כרגע, אפשר לנסות שוב' } }
  }
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: ink2, marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  )
}

type OnAdded = (added: Prospect[], updated: Prospect[], msg: string) => void

function AddForm({ onAdded }: { onAdded: OnAdded }) {
  const [f, setF] = useState({ name: '', phone: '', instagram: '', city: '', treatment: 'brows' as Treatment, source: 'whatsapp' as ProspectSource, notes: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k: keyof typeof f) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr('')
    const r = await post({ action: 'add', prospects: [f] })
    setBusy(false)
    const d = r.data as { added?: Prospect[]; updated?: Prospect[]; duplicates?: string[]; invalid?: Array<{ error: string }>; error?: string }
    if (!r.ok) { setErr(d.error || 'השמירה נכשלה'); return }
    if (d.invalid?.length) { setErr(d.invalid[0].error); return }
    if (d.updated?.length) {
      onAdded([], d.updated, `${d.updated[0].name} כבר ברשימה. הוספתי לה את הפרטים החדשים, הסטטוס שלה לא השתנה.`)
    } else if (d.duplicates?.length) { setErr('היא כבר ברשימה (אותו מספר או אותו אינסטגרם)'); return }
    else onAdded(d.added || [], [], `${f.name} נוספה לרשימה`)
    setF({ ...f, name: '', phone: '', instagram: '', city: '', notes: '' })
  }
  return (
    <form onSubmit={submit}>
      <Field label="שם"><input style={input} value={f.name} onChange={set('name')} maxLength={NAME_MAX} required /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0 10px' }}>
        <Field label="טלפון נייד"><input style={{ ...input, direction: 'ltr', textAlign: 'right' }} inputMode="tel" value={f.phone} onChange={set('phone')} placeholder="050-1234567" /></Field>
        <Field label="אינסטגרם (לא חובה)"><input style={{ ...input, direction: 'ltr', textAlign: 'right' }} value={f.instagram} onChange={set('instagram')} placeholder="@" /></Field>
        <Field label="עיר"><input style={input} value={f.city} onChange={set('city')} maxLength={CITY_MAX} /></Field>
        <Field label="סוג טיפול">
          <select style={input} value={f.treatment} onChange={set('treatment')}>{TREATMENTS.map((t) => <option key={t} value={t}>{TREATMENT_HE[t]}</option>)}</select>
        </Field>
        <Field label="איפה מצאתי אותה">
          <select style={input} value={f.source} onChange={set('source')}>{SOURCES.map((s) => <option key={s} value={s}>{SOURCE_HE[s]}</option>)}</select>
        </Field>
      </div>
      <Field label="הערות"><textarea style={{ ...input, minHeight: 64, resize: 'vertical' }} value={f.notes} onChange={set('notes')} maxLength={NOTES_MAX} /></Field>
      {err && <p role="alert" style={{ ...muted, color: rose, marginBottom: 8 }}>{err}</p>}
      <button type="submit" style={primary} disabled={busy}>{busy ? 'שומרת...' : 'הוספה לרשימה'}</button>
    </form>
  )
}

function PasteForm({ onAdded }: { onAdded: OnAdded }) {
  const [text, setText] = useState('')
  const [treatment, setTreatment] = useState<Treatment>('other')
  const [source, setSource] = useState<ProspectSource>('whatsapp')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const parsed = useMemo(() => parsePastedProspects(text), [text])
  const submit = async () => {
    if (!parsed.rows.length) return
    setBusy(true); setErr('')
    const r = await post({ action: 'add', prospects: parsed.rows.map((p) => ({ ...p, treatment, source })) })
    setBusy(false)
    const d = r.data as { added?: Prospect[]; updated?: Prospect[]; duplicates?: string[]; error?: string }
    if (!r.ok) { setErr(d.error || 'השמירה נכשלה'); return }
    const dup = d.duplicates?.length || 0
    const upd = d.updated?.length || 0
    onAdded(d.added || [], d.updated || [], `נוספו ${d.added?.length || 0}${upd ? `, ל-${upd} שכבר ברשימה נוספו פרטים` : ''}${dup ? `, ${dup} כבר היו ברשימה ודילגתי עליהן` : ''}`)
    setText('')
  }
  return (
    <div>
      <p style={{ ...muted, marginBottom: 8 }}>שורה לכל אחת: שם, טלפון. למשל: נועה כהן, 050-1234567</p>
      <textarea style={{ ...input, minHeight: 120, resize: 'vertical' }} value={text} onChange={(e) => setText(e.target.value)} aria-label="רשימה להדבקה" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0 10px', marginTop: 10 }}>
        <Field label="סוג טיפול לכולן">
          <select style={input} value={treatment} onChange={(e) => setTreatment(e.target.value as Treatment)}>{TREATMENTS.map((t) => <option key={t} value={t}>{TREATMENT_HE[t]}</option>)}</select>
        </Field>
        <Field label="איפה מצאתי אותן">
          <select style={input} value={source} onChange={(e) => setSource(e.target.value as ProspectSource)}>{SOURCES.map((s) => <option key={s} value={s}>{SOURCE_HE[s]}</option>)}</select>
        </Field>
      </div>
      {text.trim() && (
        <p style={{ ...muted, marginBottom: 8 }}>
          {parsed.rows.length} מוכנות להוספה
          {parsed.repeated.length > 0 && `, ${parsed.repeated.length} כפולות ברשימה עצמה`}
          {parsed.invalid.length > 0 && `, ${parsed.invalid.length} שורות לא תקינות (שורה ${parsed.invalid.map((x) => x.line).slice(0, 5).join(', ')})`}
        </p>
      )}
      {err && <p role="alert" style={{ ...muted, color: rose, marginBottom: 8 }}>{err}</p>}
      <button type="button" style={primary} disabled={busy || !parsed.rows.length} onClick={submit}>{busy ? 'מוסיפה...' : `הוספת ${parsed.rows.length || ''} לרשימה`}</button>
    </div>
  )
}

function ProspectCard({ p, now, available, onChange }: { p: Prospect; now: Date; available: boolean; onChange: (p: Prospect) => void }) {
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)
  const [notes, setNotes] = useState(p.notes)
  const sendable = canSend(p.status)
  const recent = contactedRecently(p.lastContactedAt, now)
  const wa = sendable ? prospectWaLink(p.phone, p.treatment, p.name) : null
  const dm = sendable ? instagramDmLink(p.instagram) : null
  const ago = agoHe(p.lastContactedAt, now)
  const st = STATUS_STYLE[p.status]

  const save = async (body: Record<string, unknown>) => {
    setErr('')
    const r = await post({ id: p.id, ...body })
    const d = r.data as { prospect?: Prospect; error?: string }
    if (!r.ok || !d.prospect) { setErr(d.error || 'השמירה נכשלה'); return false }
    onChange(d.prospect)
    return true
  }
  const confirmRecent = () => !recent || window.confirm(`שלחת לה הודעה ${ago}, ועוד לא עברו ${RECENT_DAYS} ימים. לשלוח שוב בכל זאת?`)

  return (
    <div data-testid="prospect" style={card}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: ink, overflowWrap: 'anywhere' }}>{p.name}</div>
          <div style={{ ...muted, fontSize: 13 }}>
            {[TREATMENT_HE[p.treatment], p.city, SOURCE_HE[p.source]].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {p.signedUp && <span style={{ fontSize: 12, fontWeight: 700, color: cream, background: green, borderRadius: 999, padding: '3px 10px', whiteSpace: 'nowrap' }}>נרשמה ✓</span>}
          <span style={{ fontSize: 12, fontWeight: 700, color: st.fg, background: st.bg, borderRadius: 999, padding: '3px 10px', whiteSpace: 'nowrap' }}>{PROSPECT_STATUS_HE[p.status]}</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 14px', marginTop: 6, fontSize: 13, color: ink2 }}>
        {p.phone && <span style={{ direction: 'ltr', unicodeBidi: 'isolate' }}>{displayPhone(p.phone)}</span>}
        {p.instagram && <span style={{ direction: 'ltr', unicodeBidi: 'isolate' }}>@{p.instagram}</span>}
        <span>{ago ? `פנייה אחרונה: ${ago}${p.lastChannel ? ` ${CHANNEL_HE[p.lastChannel]}` : ''}` : 'עוד לא פניתי'}</span>
      </div>

      {sendable && recent && (
        <p style={{ ...muted, color: rose, marginTop: 8 }}>שלחת לה הודעה {ago}. כדאי לחכות {RECENT_DAYS} ימים לפני הודעה נוספת.</p>
      )}

      {available && (sendable ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" style={primary}
              onClick={(e) => { if (!confirmRecent()) { e.preventDefault(); return } void save({ action: 'sent', channel: 'whatsapp' }) }}>
              שליחה בוואטסאפ
            </a>
          )}
          <button type="button" style={secondary}
            onClick={async () => { try { await navigator.clipboard.writeText(instagramMessage(p.name)); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { setErr('ההעתקה לא הצליחה') } }}>
            {copied ? 'הועתק ✓' : 'העתקה לאינסטגרם'}
          </button>
          {dm && <a href={dm} target="_blank" rel="noopener noreferrer" style={secondary}>פתיחה באינסטגרם</a>}
          {/* Instagram has no prefilled link, so she records the DM herself, phone or no phone. Same rules as WhatsApp. */}
          <button type="button" style={secondary} data-testid="mark-instagram-sent"
            onClick={() => { if (confirmRecent()) void save({ action: 'sent', channel: 'instagram' }) }}>סימון שנשלחה באינסטגרם</button>
        </div>
      ) : (
        <p style={{ ...muted, marginTop: 10, color: ink3 }}>{p.status === 'opted_out' ? 'ביקשה להפסיק' : 'לא מעוניינת'}, לא פונים אליה שוב.</p>
      ))}

      {available && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ fontSize: 13, fontWeight: 600, color: ink2, cursor: 'pointer', minHeight: 32, display: 'flex', alignItems: 'center' }}>סטטוס, הערות ותצוגת ההודעה</summary>
          <div style={{ marginTop: 8 }}>
            <Field label="סטטוס">
              <select style={input} value={p.status} onChange={(e) => void save({ action: 'update', status: e.target.value })}>
                {PROSPECT_STATUSES.map((s) => <option key={s} value={s}>{PROSPECT_STATUS_HE[s]}</option>)}
              </select>
            </Field>
            <Field label="סוג טיפול (קובע את נוסח ההודעה)">
              <select style={input} value={p.treatment} onChange={(e) => void save({ action: 'update', treatment: e.target.value })}>
                {TREATMENTS.map((t) => <option key={t} value={t}>{TREATMENT_HE[t]}</option>)}
              </select>
            </Field>
            <Field label="הערות">
              <textarea style={{ ...input, minHeight: 60, resize: 'vertical' }} value={notes} maxLength={NOTES_MAX}
                onChange={(e) => setNotes(e.target.value)} onBlur={() => { if (notes !== p.notes) void save({ action: 'update', notes }) }} />
            </Field>
            {sendable && <p style={{ ...muted, whiteSpace: 'pre-wrap', background: cream, borderRadius: 'var(--r-md)', padding: '10px 12px' }}>{whatsappMessage(p.treatment, p.name)}</p>}
          </div>
        </details>
      )}
      {err && <p role="alert" style={{ ...muted, color: rose, marginTop: 8 }}>{err}</p>}
    </div>
  )
}

export default function OutreachClient({ rows: initialRows, available, nowIso }: { rows: Prospect[]; available: boolean; nowIso: string }) {
  const now = useMemo(() => new Date(nowIso), [nowIso])
  const [rows, setRows] = useState(initialRows)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [panel, setPanel] = useState<'none' | 'one' | 'paste'>('none')
  const [toast, setToast] = useState('')

  const counts = useMemo(() => outreachCounts(rows), [rows])
  const today = useMemo(() => sentToday(rows, now), [rows, now])
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const digits = q.replace(/\D/g, '')
    return rows.filter((r) => matchesFilter(r, filter)).filter((r) => !q
      || r.name.toLowerCase().includes(q) || (r.city || '').toLowerCase().includes(q) || (r.instagram || '').includes(q.replace(/^@/, ''))
      || (digits.length >= 3 && (r.phone || '').includes(digits.replace(/^0/, ''))))
  }, [rows, filter, query])

  const onAdded: OnAdded = (added, updated, msg) => {
    const byId = new Map(updated.map((u) => [u.id, u]))
    setRows((prev) => sortProspects([...prev.map((r) => byId.get(r.id) || r), ...added]))
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }
  const onChange = (p: Prospect) => setRows((prev) => prev.map((r) => (r.id === p.id ? p : r)))

  return (
    <div dir="rtl" style={{ maxWidth: 780, margin: '0 auto', padding: '8px 16px 56px', fontFamily: 'var(--sans)', color: ink }}>
      <a href="/dashboard/admin" style={{ display: 'inline-block', padding: '8px 0', fontSize: 14, fontWeight: 600, color: ink2, textDecoration: 'none' }}>→ ניהול מנויים</a>
      <h1 style={{ fontFamily: display, fontSize: 30, fontWeight: 800, letterSpacing: '-0.01em', margin: '2px 0 6px', color: green }}>פניות לקוסמטיקאיות</h1>
      <p style={{ ...muted, fontSize: 14, marginBottom: 16, maxWidth: 560 }}>
        קוסמטיקאיות שאפשר להציע להן את קלמיה. ההודעה נפתחת אצלך בוואטסאפ מוכנה, ואת שולחת אותה בעצמך. הודעה אחת לכל אחת, ומי שאמרה לא, לא מקבלת שוב.
      </p>

      {!available && (
        <div role="status" style={{ ...card, background: petal, borderColor: petal, boxShadow: 'none' }}>
          <p style={{ ...muted, color: rose }}>
            {MIGRATION_NEEDED_HE.split(MIGRATION_FILE)[0]}
            <bdi dir="ltr" style={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{MIGRATION_FILE}</bdi>
            {MIGRATION_NEEDED_HE.split(MIGRATION_FILE)[1]}
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginBottom: 10 }}>
        {[
          { n: counts.sent, label: 'נשלחו' }, { n: counts.replied, label: 'ענו' }, { n: counts.trial, label: 'בניסיון' }, { n: counts.paying, label: 'משלמות' },
        ].map((k) => (
          <div key={k.label} style={{ ...card, marginBottom: 0, padding: '12px 8px', textAlign: 'center' }}>
            <div style={{ fontFamily: display, fontSize: 26, fontWeight: 800, lineHeight: 1.1, color: green }}>{k.n}</div>
            <div style={{ ...muted, fontSize: 12, marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      <p data-testid="daily-hint" style={{ ...muted, marginBottom: 14, padding: '8px 12px', borderRadius: 'var(--r-md)', background: today >= DAILY_SOFT_LIMIT ? petal : sageWash, color: today >= DAILY_SOFT_LIMIT ? rose : sageText }}>
        היום נשלחו {today}. {DAILY_LIMIT_HE}{today >= DAILY_SOFT_LIMIT ? ', כדאי להמשיך מחר.' : '.'}
      </p>

      {available && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <button type="button" style={panel === 'one' ? primary : secondary} onClick={() => setPanel(panel === 'one' ? 'none' : 'one')}>הוספת קוסמטיקאית</button>
          <button type="button" style={panel === 'paste' ? primary : secondary} onClick={() => setPanel(panel === 'paste' ? 'none' : 'paste')}>הדבקת רשימה</button>
        </div>
      )}
      {available && panel !== 'none' && (
        <div style={card}>{panel === 'one' ? <AddForm onAdded={onAdded} /> : <PasteForm onAdded={onAdded} />}</div>
      )}
      {toast && <p role="status" style={{ ...muted, color: green, fontWeight: 600, marginBottom: 10 }}>{toast}</p>}

      {rows.length > 0 && (
        <>
          <input style={{ ...input, marginBottom: 10 }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש לפי שם, עיר, טלפון או אינסטגרם" aria-label="חיפוש" />
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 10 }}>
            {FILTERS.map((f) => (
              <button key={f.id} type="button" style={chip(filter === f.id)} onClick={() => setFilter(f.id)}>
                {f.label} {f.id === 'all' ? rows.length : rows.filter((r) => matchesFilter(r, f.id)).length}
              </button>
            ))}
          </div>
        </>
      )}

      {rows.length === 0 ? (
        available && <div style={{ ...card, textAlign: 'center', padding: '28px 16px' }}>
          <p style={{ ...muted, fontSize: 15 }}>הרשימה עוד ריקה. אפשר להוסיף קוסמטיקאית אחת, או להדביק רשימה שלמה בבת אחת.</p>
        </div>
      ) : visible.length === 0 ? (
        <p style={{ ...muted, textAlign: 'center', padding: 20 }}>אין תוצאות בסינון הזה.</p>
      ) : (
        visible.map((p) => <ProspectCard key={p.id} p={p} now={now} available={available} onChange={onChange} />)
      )}
    </div>
  )
}
