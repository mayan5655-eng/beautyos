// lib/prospects.ts
//
// The owner's outreach list (/dashboard/admin/outreach): cosmeticians she has not met in the app yet and may offer Kalmea to,
// one message at a time, from HER OWN WhatsApp. Pure logic only (no database, no network), shared by the page, the route and
// test-admin-outreach.ts.
//
// THE LEGAL LINE. Israeli anti-spam law (חוק התקשורת, סעיף 30א) allows one offer to a business. Whoever declined
// ("לא מעוניינת") or asked to stop ("ביקשה להפסיק") is never offered a message again: canSend() is false for both, the screen
// hides the buttons and the route refuses. Nothing here ever sends a message: the button opens wa.me on her phone and she
// presses send herself.
import { normalizeIsraeliMobile } from './phone.ts'
import type { PhoneResult } from './phone.ts'

export const PROSPECT_STATUSES = ['new', 'messaged', 'replied', 'trial', 'paying', 'not_interested', 'opted_out'] as const
export type ProspectStatus = (typeof PROSPECT_STATUSES)[number]
export const PROSPECT_STATUS_HE: Record<ProspectStatus, string> = {
  new: 'חדשה',
  messaged: 'נשלחה הודעה',
  replied: 'ענתה',
  trial: 'בניסיון',
  paying: 'משלמת',
  not_interested: 'לא מעוניינת',
  opted_out: 'ביקשה להפסיק',
}

export const TREATMENTS = ['brows', 'lashes', 'face', 'nails', 'hair_removal', 'other'] as const
export type Treatment = (typeof TREATMENTS)[number]
export const TREATMENT_HE: Record<Treatment, string> = {
  brows: 'גבות', lashes: 'ריסים', face: 'פנים', nails: 'ציפורניים', hair_removal: 'הסרת שיער', other: 'אחר',
}

export const SOURCES = ['whatsapp', 'instagram', 'facebook', 'referral'] as const
export type ProspectSource = (typeof SOURCES)[number]
export const SOURCE_HE: Record<ProspectSource, string> = {
  whatsapp: 'וואטסאפ', instagram: 'אינסטגרם', facebook: 'פייסבוק', referral: 'היכרות',
}

export const NAME_MAX = 80
export const CITY_MAX = 60
export const INSTAGRAM_MAX = 40
export const NOTES_MAX = 1000
/** How many prospects one paste (or one request) may add. */
export const ADD_MAX = 300
/** A second message within this many days gets a warning (never a block). */
export const RECENT_DAYS = 14
/** The soft daily hint: more than this from one personal phone is how numbers get reported and blocked by WhatsApp. */
export const DAILY_SOFT_LIMIT = 20
export const DAILY_LIMIT_HE = `מומלץ עד ${DAILY_SOFT_LIMIT} הודעות ביום מהטלפון שלך`
/** Shown (and returned by the route) while add_prospects_2026-11-09.sql has not run. */
export const MIGRATION_FILE = 'kalmea-sql-prospects'
export const MIGRATION_NEEDED_HE = `צריך להריץ עדכון קטן לפני שאפשר לשמור פניות: הקובץ ${MIGRATION_FILE}. עד אז הרשימה ריקה ושום דבר לא נשמר.`

export const isProspectStatus = (v: unknown): v is ProspectStatus => typeof v === 'string' && (PROSPECT_STATUSES as readonly string[]).includes(v)
export const isTreatment = (v: unknown): v is Treatment => typeof v === 'string' && (TREATMENTS as readonly string[]).includes(v)
export const isSource = (v: unknown): v is ProspectSource => typeof v === 'string' && (SOURCES as readonly string[]).includes(v)

/** Declined or asked to stop: never offered again, by law and by decency. */
export const NO_CONTACT_STATUSES: readonly ProspectStatus[] = ['not_interested', 'opted_out']
export function canSend(status: ProspectStatus): boolean {
  return !NO_CONTACT_STATUSES.includes(status)
}

/** What a send does to the status: a new one becomes "נשלחה הודעה"; one that already moved on (answered, trial...) keeps it. */
export function statusAfterSend(status: ProspectStatus): ProspectStatus {
  return status === 'new' ? 'messaged' : status
}

const MS_DAY = 86_400_000
/** True when she was messaged less than RECENT_DAYS ago: the screen warns before another message. */
export function contactedRecently(lastContactedAt: string | null | undefined, now: Date): boolean {
  const t = lastContactedAt ? Date.parse(lastContactedAt) : NaN
  return Number.isFinite(t) && now.getTime() - t < RECENT_DAYS * MS_DAY
}

export type Prospect = {
  id: string
  name: string
  phone: string | null // 9725XXXXXXXX
  instagram: string | null // handle, no @
  city: string | null
  treatment: Treatment
  source: ProspectSource
  notes: string
  status: ProspectStatus
  lastContactedAt: string | null
  contactCount: number
  createdAt: string
  /** Her phone matches a business that signed up to Kalmea (read-only match, computed on the server). */
  signedUp: boolean
}

// ── cleaning input ────────────────────────────────────────────────────────────
const oneLine = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

/** "@Noa.Brows", "instagram.com/noa.brows/", "noa.brows" -> "noa.brows". Null when it cannot be a handle. */
export function cleanInstagram(raw: unknown): string | null {
  let s = typeof raw === 'string' ? raw.trim() : ''
  if (!s) return null
  s = s.replace(/^https?:\/\//i, '').replace(/^(www\.)?instagram\.com\//i, '').replace(/^@/, '').split(/[/?#\s]/)[0]
  s = s.toLowerCase()
  return /^[a-z0-9._]{1,30}$/.test(s) ? s : null
}

/** Her first name for the greeting: the first word, without a title or emoji. Empty when there is nothing usable. */
export function firstName(full: string | null | undefined): string {
  const words = String(full ?? '').replace(/[^\p{L}\p{M}'\s-]/gu, ' ').trim().split(/\s+/).filter(Boolean)
  const skip = new Set(['דר', 'גב', 'גברת'])
  return words.find((x) => x.length > 1 && !skip.has(x)) || ''
}

export type ProspectInput = {
  name: string; phone: string | null; instagram: string | null; city: string | null
  treatment: Treatment; source: ProspectSource; notes: string
}
export type InputResult = { ok: true; value: ProspectInput } | { ok: false; error: string }

/** One prospect from the form (or the route body). Phone or Instagram is required; a phone must be an Israeli mobile. */
export function cleanProspectInput(raw: Record<string, unknown>): InputResult {
  const name = oneLine(raw.name, NAME_MAX)
  if (!name) return { ok: false, error: 'חסר שם' }
  const phoneRaw = typeof raw.phone === 'string' ? raw.phone.trim() : ''
  let phone: string | null = null
  if (phoneRaw) {
    const p = normalizeIsraeliMobile(phoneRaw)
    if (!p.ok) return { ok: false, error: 'מספר נייד לא תקין' }
    phone = p.e164
  }
  const igRaw = typeof raw.instagram === 'string' ? raw.instagram.trim() : ''
  const instagram = cleanInstagram(igRaw)
  if (igRaw && !instagram) return { ok: false, error: 'שם משתמש באינסטגרם לא תקין' }
  if (!phone && !instagram) return { ok: false, error: 'צריך טלפון או אינסטגרם' }
  const notes = typeof raw.notes === 'string' ? raw.notes.replace(/\r\n/g, '\n').trim() : ''
  if (notes.length > NOTES_MAX) return { ok: false, error: `ההערה ארוכה מדי (עד ${NOTES_MAX} תווים)` }
  return {
    ok: true,
    value: {
      name, phone, instagram, city: oneLine(raw.city, CITY_MAX) || null,
      treatment: isTreatment(raw.treatment) ? raw.treatment : 'other',
      source: isSource(raw.source) ? raw.source : 'whatsapp',
      notes,
    },
  }
}

// ── paste many ────────────────────────────────────────────────────────────────
export type PasteResult = {
  rows: Array<{ name: string; phone: string }>
  invalid: Array<{ line: number; text: string; error: string }>
  /** Lines whose phone already appeared earlier in the same paste. */
  repeated: Array<{ line: number; text: string }>
}

/**
 * One prospect per line: "name, phone" (a tab, a semicolon or " - " also separate; the order may be either way round).
 * Phones are normalized to 9725XXXXXXXX and a phone that repeats inside the paste is kept once.
 */
export function parsePastedProspects(text: string): PasteResult {
  const out: PasteResult = { rows: [], invalid: [], repeated: [] }
  const seen = new Set<string>()
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n')
  lines.forEach((rawLine, i) => {
    const line = rawLine.trim()
    if (!line) return
    const parts = line.split(/\s*[,\t;]\s*|\s+-\s+/).map((p) => p.trim()).filter(Boolean)
    let phone: string | null = null
    const nameParts: string[] = []
    for (const p of parts) {
      const n: PhoneResult | null = !phone && /\d{6,}|\d[\d\s-]{7,}/.test(p) ? normalizeIsraeliMobile(p) : null
      if (n && n.ok) phone = n.e164
      else if (n && !n.ok) { out.invalid.push({ line: i + 1, text: line, error: 'מספר נייד לא תקין' }); return }
      else nameParts.push(p)
    }
    const name = nameParts.join(' ').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)
    if (!phone) { out.invalid.push({ line: i + 1, text: line, error: 'לא נמצא מספר טלפון' }); return }
    if (!name) { out.invalid.push({ line: i + 1, text: line, error: 'חסר שם' }); return }
    if (seen.has(phone)) { out.repeated.push({ line: i + 1, text: line }); return }
    seen.add(phone)
    out.rows.push({ name, phone })
  })
  return out
}

/** Splits new prospects into those to add and those whose phone (or handle) is already on the list or earlier in the batch. */
export function dedupeAgainst<T extends { phone: string | null; instagram?: string | null }>(
  incoming: T[], existingPhones: Iterable<string>, existingHandles: Iterable<string> = [],
): { fresh: T[]; duplicates: T[] } {
  const phones = new Set(existingPhones)
  const handles = new Set(existingHandles)
  const fresh: T[] = []
  const duplicates: T[] = []
  for (const p of incoming) {
    const ig = p.instagram || null
    if ((p.phone && phones.has(p.phone)) || (!p.phone && ig && handles.has(ig))) { duplicates.push(p); continue }
    if (p.phone) phones.add(p.phone)
    if (ig) handles.add(ig)
    fresh.push(p)
  }
  return { fresh, duplicates }
}

// ── the numbers at the top ────────────────────────────────────────────────────
const REPLIED: readonly ProspectStatus[] = ['replied', 'trial', 'paying', 'not_interested', 'opted_out']

/** A funnel, so each number includes the later stages: everyone who answered was messaged first. */
export function outreachCounts(rows: Prospect[]): { sent: number; replied: number; trial: number; paying: number } {
  let sent = 0, replied = 0, trial = 0, paying = 0
  for (const r of rows) {
    if (r.status !== 'new' || r.lastContactedAt) sent++
    if (REPLIED.includes(r.status)) replied++
    if (r.status === 'paying') paying++
    else if (r.status === 'trial' || (r.signedUp && !NO_CONTACT_STATUSES.includes(r.status))) trial++
  }
  return { sent, replied, trial, paying }
}

function israelDay(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

/** How many she messaged today (Israel calendar day), for the soft daily hint. */
export function sentToday(rows: Prospect[], now: Date): number {
  const today = israelDay(now)
  return rows.filter((r) => r.lastContactedAt && Number.isFinite(Date.parse(r.lastContactedAt)) && israelDay(new Date(r.lastContactedAt)) === today).length
}

/** The list order: not yet messaged first (oldest added first, so a paste is worked top to bottom), then by last contact. */
export function sortProspects(rows: Prospect[]): Prospect[] {
  const rank = (r: Prospect) => (r.status === 'new' ? 0 : NO_CONTACT_STATUSES.includes(r.status) ? 2 : 1)
  return [...rows].sort((a, b) => rank(a) - rank(b)
    || (rank(a) === 0 ? a.createdAt.localeCompare(b.createdAt) : (b.lastContactedAt || '').localeCompare(a.lastContactedAt || '')))
}

/** The table has not been created yet (the SQL file has not run). */
export function isMissingProspectsTable(e: { code?: string; message?: string } | null | undefined): boolean {
  return !!e && (e.code === '42P01' || e.code === 'PGRST205' || (/prospects/.test(e.message || '') && /not exist|schema cache/i.test(e.message || '')))
}
