'use client'

// app/dashboard/admin/outreach/OutreachClient.tsx
// The outreach screen UI. Presentation only: it receives rows the server built behind requirePlatformAdmin() and holds no
// authority of its own. Every save posts to /api/admin/prospects, which repeats the admin check.
//
// NOTHING HERE SENDS A MESSAGE. "שליחה בוואטסאפ" is a wa.me link that opens WhatsApp on her own phone with the text typed in;
// she presses send herself. The tap also records the date. Whoever declined or asked to stop gets no send button at all (the
// route refuses as well). Hebrew, RTL, feminine second person. Brand tokens only (app/globals.css).
//
// "לפנות היום" at the top is computed here from the rows (lib/prospects.ts todayList): due follow-ups first, then the
// highest-priority ones not yet contacted, capped by what is left of the daily soft limit. The followers / system / follow-up
// fields show and save only when `enriched` (the enrich SQL file ran); until then an admin-only note says so.

import { useMemo, useState } from 'react'
import type { CSSProperties, ReactNode, ChangeEvent, FormEvent } from 'react'
import {
  PROSPECT_STATUSES, PROSPECT_STATUS_HE, TREATMENTS, TREATMENT_HE, SOURCES, SOURCE_HE, DAILY_SOFT_LIMIT, DAILY_LIMIT_HE,
  MIGRATION_NEEDED_HE, MIGRATION_FILE, CHANNEL_HE, NAME_MAX, CITY_MAX, NOTES_MAX, RECENT_DAYS,
  ENRICH_MIGRATION_NEEDED_HE, ENRICH_MIGRATION_FILE, CURRENT_SYSTEMS, CURRENT_SYSTEM_HE, INSTAGRAM_MAX,
  canSend, contactedRecently, outreachCounts, sentToday, parsePastedProspects, sortProspects, sortByPriority, todayList,
  formatFollowers, followupDue, followupOverdueDays, israelDayOf, parseFollowers,
} from '@/lib/prospects'
import type { Prospect, ProspectStatus, Treatment, ProspectSource, CurrentSystem } from '@/lib/prospects'
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

/** YYYY-MM-DD plus n days (calendar arithmetic on the date itself, no time zone). */
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
/** "2026-11-12" -> "12.11" */
const shortDate = (ymd: string) => `${Number(ymd.slice(8, 10))}.${Number(ymd.slice(5, 7))}`

/** The small line under her name: due / later follow-up, followers, system. */
function followupLabel(p: Prospect, now: Date): string {
  if (!p.nextFollowup) return ''
  const late = followupOverdueDays(p.nextFollowup, now)
  if (late === 0) return 'לחזור אליה היום'
  if (late === 1) return 'לחזור אליה, מאתמול'
  if (late !== null) return `לחזור אליה, באיחור של ${late} ימים`
  return `לחזור אליה ב-${shortDate(p.nextFollowup)}`
}

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

function AddForm({ onAdded, enriched }: { onAdded: OnAdded; enriched: boolean }) {
  const [f, setF] = useState({ name: '', phone: '', instagram: '', city: '', treatment: 'brows' as Treatment, source: 'whatsapp' as ProspectSource, notes: '', followers: '', current_system: 'unknown' as CurrentSystem })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k: keyof typeof f) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr('')
    const { followers, current_system, ...base } = f
    if (enriched && followers.trim() && parseFollowers(followers) === null) { setBusy(false); setErr('מספר עוקבות לא תקין, למשל 3200 או 12.5K'); return }
    const r = await post({ action: 'add', prospects: [enriched ? { ...base, followers: followers.trim() ? parseFollowers(followers) : null, current_system } : base] })
    setBusy(false)
    const d = r.data as { added?: Prospect[]; updated?: Prospect[]; duplicates?: string[]; invalid?: Array<{ error: string }>; error?: string }
    if (!r.ok) { setErr(d.error || 'השמירה נכשלה'); return }
    if (d.invalid?.length) { setErr(d.invalid[0].error); return }
    if (d.updated?.length) {
      onAdded([], d.updated, `${d.updated[0].name} כבר ברשימה. הוספתי לה את הפרטים החדשים, הסטטוס שלה לא השתנה.`)
    } else if (d.duplicates?.length) { setErr('היא כבר ברשימה (אותו מספר או אותו אינסטגרם)'); return }
    else onAdded(d.added || [], [], `${f.name} נוספה לרשימה`)
    setF({ ...f, name: '', phone: '', instagram: '', city: '', notes: '', followers: '', current_system: 'unknown' })
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
        {enriched && (
          <Field label="עוקבות באינסטגרם"><input style={{ ...input, direction: 'ltr', textAlign: 'right' }} inputMode="decimal" value={f.followers} onChange={set('followers')} placeholder="12.5K" /></Field>
        )}
        {enriched && (
          <Field label="עובדת היום עם">
            <select style={input} value={f.current_system} onChange={set('current_system')}>{CURRENT_SYSTEMS.map((c) => <option key={c} value={c}>{CURRENT_SYSTEM_HE[c]}</option>)}</select>
          </Field>
        )}
      </div>
      <Field label="הערות"><textarea style={{ ...input, minHeight: 64, resize: 'vertical' }} value={f.notes} onChange={set('notes')} maxLength={NOTES_MAX} /></Field>
      {err && <p role="alert" style={{ ...muted, color: rose, marginBottom: 8 }}>{err}</p>}
      <button type="submit" style={primary} disabled={busy}>{busy ? 'שומרת...' : 'הוספה לרשימה'}</button>
    </form>
  )
}

function PasteForm({ onAdded, enriched }: { onAdded: OnAdded; enriched: boolean }) {
  const [text, setText] = useState('')
  const [treatment, setTreatment] = useState<Treatment>('other')
  const [source, setSource] = useState<ProspectSource>('whatsapp')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const parsed = useMemo(() => parsePastedProspects(text), [text])
  const submit = async () => {
    if (!parsed.rows.length) return
    setBusy(true); setErr('')
    // followers / system are sent only once the enrich SQL ran (the route would drop them anyway).
    const r = await post({ action: 'add', prospects: parsed.rows.map(({ followers, currentSystem, ...p }) => ({
      ...p, treatment, source, ...(enriched ? { followers: followers ?? null, current_system: currentSystem ?? null } : {}),
    })) })
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
      <p style={{ ...muted, marginBottom: 8 }}>
        {enriched
          ? 'שורה לכל אחת: שם, טלפון או @אינסטגרם, ואם יש גם עיר, עוקבות ומערכת. למשל: נועה כהן, 050-1234567, חיפה, 12.5K, ווטסאפ'
          : 'שורה לכל אחת: שם, טלפון או @אינסטגרם, ואם יש גם עיר. למשל: נועה כהן, 050-1234567, חיפה'}
      </p>
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

function ProspectCard({ p, now, available, enriched, onChange }: { p: Prospect; now: Date; available: boolean; enriched: boolean; onChange: (p: Prospect) => void }) {
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)
  const [notes, setNotes] = useState(p.notes)
  const [city, setCity] = useState(p.city || '')
  const [handle, setHandle] = useState(p.instagram || '')
  const [followers, setFollowers] = useState(p.followers == null ? '' : String(p.followers))
  const sendable = canSend(p.status)
  const recent = contactedRecently(p.lastContactedAt, now)
  const wa = sendable ? prospectWaLink(p.phone, p.treatment, p.name, p.currentSystem) : null
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

  const today = israelDayOf(now)
  const due = followupDue(p.nextFollowup, now)
  const fu = followupLabel(p, now)
  const facts = [p.followers != null ? `${formatFollowers(p.followers)} עוקבות` : '', enriched && p.currentSystem !== 'unknown' ? CURRENT_SYSTEM_HE[p.currentSystem] : '']
    .filter(Boolean)
  return (
    <div data-testid="prospect" id={`p-${p.id}`} style={card}>
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
        {facts.map((f) => <span key={f} style={{ unicodeBidi: 'isolate' }}>{f}</span>)}
        {sendable && fu && <span style={{ fontWeight: 700, color: due ? rose : ink2 }}>{fu}</span>}
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
            onClick={async () => { try { await navigator.clipboard.writeText(instagramMessage(p.name, p.treatment, p.currentSystem)); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { setErr('ההעתקה לא הצליחה') } }}>
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
          <summary style={{ fontSize: 13, fontWeight: 600, color: ink2, cursor: 'pointer', minHeight: 32, display: 'flex', alignItems: 'center' }}>פרטים, סטטוס, הערות ותצוגת ההודעה</summary>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0 10px' }}>
              <Field label="עיר">
                <input style={input} value={city} maxLength={CITY_MAX} onChange={(e) => setCity(e.target.value)}
                  onBlur={() => { if (city.trim() !== (p.city || '')) void save({ action: 'update', city }) }} />
              </Field>
              <Field label="אינסטגרם">
                <input style={{ ...input, direction: 'ltr', textAlign: 'right' }} value={handle} maxLength={INSTAGRAM_MAX + 30} placeholder="@"
                  onChange={(e) => setHandle(e.target.value)}
                  onBlur={() => { if (handle.trim().replace(/^@/, '').toLowerCase() !== (p.instagram || '')) void save({ action: 'update', instagram: handle }).then((ok) => { if (!ok) setHandle(p.instagram || '') }) }} />
              </Field>
              {enriched && (
                <Field label="עוקבות באינסטגרם">
                  <input data-testid="followers" style={{ ...input, direction: 'ltr', textAlign: 'right' }} inputMode="decimal" value={followers} placeholder="12.5K"
                    onChange={(e) => setFollowers(e.target.value)}
                    onBlur={() => {
                      const n = followers.trim() ? parseFollowers(followers) : null
                      if (followers.trim() && n === null) { setErr('מספר עוקבות לא תקין, למשל 3200 או 12.5K'); return }
                      if (n !== p.followers) void save({ action: 'update', followers: n })
                    }} />
                </Field>
              )}
              {enriched && (
                <Field label="עובדת היום עם">
                  <select data-testid="current-system" style={input} value={p.currentSystem} onChange={(e) => void save({ action: 'update', current_system: e.target.value })}>
                    {CURRENT_SYSTEMS.map((c) => <option key={c} value={c}>{CURRENT_SYSTEM_HE[c]}</option>)}
                  </select>
                </Field>
              )}
            </div>
            {enriched && (
              <Field label="מתי לחזור אליה">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  <input data-testid="next-followup" type="date" style={{ ...input, width: 'auto', minWidth: 150, flex: '1 1 150px' }} value={p.nextFollowup || ''} min={today}
                    onChange={(e) => void save({ action: 'update', next_followup: e.target.value || null })} />
                  {[{ d: 1, l: 'מחר' }, { d: 3, l: 'עוד 3 ימים' }, { d: 7, l: 'עוד שבוע' }].map((q) => (
                    <button key={q.d} type="button" style={chip(p.nextFollowup === addDays(today, q.d))} onClick={() => void save({ action: 'update', next_followup: addDays(today, q.d) })}>{q.l}</button>
                  ))}
                  {p.nextFollowup && <button type="button" style={chip(false)} onClick={() => void save({ action: 'update', next_followup: null })}>בלי תאריך</button>}
                </div>
              </Field>
            )}
            <Field label="הערות">
              <textarea style={{ ...input, minHeight: 60, resize: 'vertical' }} value={notes} maxLength={NOTES_MAX}
                onChange={(e) => setNotes(e.target.value)} onBlur={() => { if (notes !== p.notes) void save({ action: 'update', notes }) }} />
            </Field>
            {sendable && <p style={{ ...muted, whiteSpace: 'pre-wrap', background: cream, borderRadius: 'var(--r-md)', padding: '10px 12px' }}>{whatsappMessage(p.treatment, p.name, p.currentSystem)}</p>}
          </div>
        </details>
      )}
      {err && <p role="alert" style={{ ...muted, color: rose, marginTop: 8 }}>{err}</p>}
    </div>
  )
}

/** One line of "לפנות היום": who, why, and the WhatsApp button (or a jump to her card). Records the send like the card does. */
function TodayRow({ p, reason, now, onChange }: { p: Prospect; reason: 'followup' | 'new'; now: Date; onChange: (p: Prospect) => void }) {
  const [err, setErr] = useState('')
  const wa = prospectWaLink(p.phone, p.treatment, p.name, p.currentSystem)
  const recent = contactedRecently(p.lastContactedAt, now)
  const why = reason === 'followup' ? followupLabel(p, now) : [TREATMENT_HE[p.treatment], p.city, p.followers != null ? `${formatFollowers(p.followers)} עוקבות` : '']
    .filter(Boolean).join(' · ')
  const recordSent = async () => {
    setErr('')
    const r = await post({ id: p.id, action: 'sent', channel: 'whatsapp' })
    const d = r.data as { prospect?: Prospect; error?: string }
    if (!r.ok || !d.prospect) { setErr(d.error || 'השמירה נכשלה'); return }
    onChange(d.prospect)
  }
  return (
    <li data-testid="today-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderTop: `1px solid ${line}`, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0, flex: '1 1 160px' }}>
        <a href={`#p-${p.id}`} style={{ fontSize: 15, fontWeight: 700, color: ink, textDecoration: 'none', overflowWrap: 'anywhere' }}>{p.name}</a>
        <div style={{ fontSize: 12, color: reason === 'followup' ? rose : ink2, fontWeight: reason === 'followup' ? 700 : 400 }}>{why}</div>
        {err && <div role="alert" style={{ fontSize: 12, color: rose }}>{err}</div>}
      </div>
      {wa ? (
        <a href={wa} target="_blank" rel="noopener noreferrer" style={{ ...primary, minHeight: 40, fontSize: 14 }}
          onClick={(e) => {
            if (recent && !window.confirm(`שלחת לה הודעה ${agoHe(p.lastContactedAt, now)}, ועוד לא עברו ${RECENT_DAYS} ימים. לשלוח שוב בכל זאת?`)) { e.preventDefault(); return }
            void recordSent()
          }}>וואטסאפ</a>
      ) : (
        <a href={`#p-${p.id}`} style={{ ...secondary, minHeight: 40, fontSize: 14 }}>לכרטיס שלה</a>
      )}
    </li>
  )
}

type SortBy = 'priority' | 'list'

export default function OutreachClient({ rows: initialRows, available, enriched, nowIso }: { rows: Prospect[]; available: boolean; enriched: boolean; nowIso: string }) {
  const now = useMemo(() => new Date(nowIso), [nowIso])
  const [rows, setRows] = useState(initialRows)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [panel, setPanel] = useState<'none' | 'one' | 'paste'>('none')
  const [toast, setToast] = useState('')
  const [treatmentF, setTreatmentF] = useState<Treatment | ''>('')
  const [cityF, setCityF] = useState('')
  const [systemF, setSystemF] = useState<CurrentSystem | ''>('')
  const [sortBy, setSortBy] = useState<SortBy>('priority')

  const counts = useMemo(() => outreachCounts(rows), [rows])
  const today = useMemo(() => sentToday(rows, now), [rows, now])
  const todays = useMemo(() => (available ? todayList(rows, now) : []), [rows, now, available])
  const cities = useMemo(() => [...new Set(rows.map((r) => (r.city || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he')), [rows])
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const digits = q.replace(/\D/g, '')
    const list = rows.filter((r) => matchesFilter(r, filter)).filter((r) => !q
      || r.name.toLowerCase().includes(q) || (r.city || '').toLowerCase().includes(q) || (r.instagram || '').includes(q.replace(/^@/, ''))
      || (digits.length >= 3 && (r.phone || '').includes(digits.replace(/^0/, ''))))
      .filter((r) => (!treatmentF || r.treatment === treatmentF) && (!cityF || (r.city || '').trim() === cityF)
        && (!enriched || !systemF || r.currentSystem === systemF))
    return sortBy === 'priority' ? sortByPriority(list, now) : sortProspects(list)
  }, [rows, filter, query, treatmentF, cityF, systemF, sortBy, enriched, now])

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

      {available && !enriched && (
        <p role="status" data-testid="enrich-migration-note" style={{ ...muted, fontSize: 12, color: rose, background: petal, borderRadius: 'var(--r-md)', padding: '8px 12px', marginBottom: 12 }}>
          {ENRICH_MIGRATION_NEEDED_HE.split(ENRICH_MIGRATION_FILE)[0]}
          <bdi dir="ltr" style={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{ENRICH_MIGRATION_FILE}</bdi>
          {ENRICH_MIGRATION_NEEDED_HE.split(ENRICH_MIGRATION_FILE)[1]}
        </p>
      )}

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

      {available && rows.length > 0 && (
        <section data-testid="today" aria-label="לפנות היום" style={{ ...card, background: cream }}>
          <h2 style={{ fontFamily: display, fontSize: 20, fontWeight: 800, color: green, margin: '0 0 2px' }}>לפנות היום</h2>
          {todays.length === 0 ? (
            <p style={muted}>{today >= DAILY_SOFT_LIMIT ? 'הגעת היום למספר ההודעות המומלץ. מחר ממשיכות 🌸' : 'אין היום חזרות או חדשות שמחכות לך.'}</p>
          ) : (
            <>
              <p style={{ ...muted, fontSize: 12, marginBottom: 4 }}>קודם מי שקבעת לחזור אליה, אחר כך החדשות עם העדיפות הגבוהה. עד {Math.max(0, DAILY_SOFT_LIMIT - today)} היום.</p>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {todays.map((t) => <TodayRow key={t.p.id} p={t.p} reason={t.reason} now={now} onChange={onChange} />)}
              </ul>
            </>
          )}
        </section>
      )}

      {available && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <button type="button" style={panel === 'one' ? primary : secondary} onClick={() => setPanel(panel === 'one' ? 'none' : 'one')}>הוספת קוסמטיקאית</button>
          <button type="button" style={panel === 'paste' ? primary : secondary} onClick={() => setPanel(panel === 'paste' ? 'none' : 'paste')}>הדבקת רשימה</button>
        </div>
      )}
      {available && panel !== 'none' && (
        <div style={card}>{panel === 'one' ? <AddForm onAdded={onAdded} enriched={enriched} /> : <PasteForm onAdded={onAdded} enriched={enriched} />}</div>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 12 }}>
            <select aria-label="סינון לפי טיפול" style={{ ...input, minHeight: 40, fontSize: 14 }} value={treatmentF} onChange={(e) => setTreatmentF(e.target.value as Treatment | '')}>
              <option value="">כל הטיפולים</option>
              {TREATMENTS.map((t) => <option key={t} value={t}>{TREATMENT_HE[t]}</option>)}
            </select>
            <select aria-label="סינון לפי עיר" style={{ ...input, minHeight: 40, fontSize: 14 }} value={cityF} onChange={(e) => setCityF(e.target.value)}>
              <option value="">כל הערים</option>
              {cities.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {enriched && (
              <select aria-label="סינון לפי מערכת" data-testid="system-filter" style={{ ...input, minHeight: 40, fontSize: 14 }} value={systemF} onChange={(e) => setSystemF(e.target.value as CurrentSystem | '')}>
                <option value="">כל המערכות</option>
                {CURRENT_SYSTEMS.map((c) => <option key={c} value={c}>{CURRENT_SYSTEM_HE[c]}</option>)}
              </select>
            )}
            <select aria-label="מיון" style={{ ...input, minHeight: 40, fontSize: 14 }} value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
              <option value="priority">לפי עדיפות</option>
              <option value="list">לפי סדר הרשימה</option>
            </select>
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
        visible.map((p) => <ProspectCard key={p.id} p={p} now={now} available={available} enriched={enriched} onChange={onChange} />)
      )}
    </div>
  )
}
