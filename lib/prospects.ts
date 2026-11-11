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

/** Shown (admin only) while add_prospects_enrich_2026-11-11.sql has not run: the list works, the three new fields wait. */
export const ENRICH_MIGRATION_FILE = 'kalmea-sql-prospects-enrich'
export const ENRICH_MIGRATION_NEEDED_HE = `כדי לשמור עוקבות, מערכת נוכחית ותאריך חזרה צריך להריץ עדכון קטן: הקובץ ${ENRICH_MIGRATION_FILE}. עד אז הרשימה עובדת כרגיל, בלי השדות האלה.`

/** What she uses today to manage her diary. Drives the tailored line in the message and the priority. */
export const CURRENT_SYSTEMS = ['whatsapp_manual', 'calmark', 'pink', 'tor4you', 'excel_or_notebook', 'other_system', 'unknown'] as const
export type CurrentSystem = (typeof CURRENT_SYSTEMS)[number]
export const CURRENT_SYSTEM_HE: Record<CurrentSystem, string> = {
  whatsapp_manual: 'וואטסאפ ידני', calmark: 'Calmark', pink: 'Pink', tor4you: 'Tor4You', excel_or_notebook: 'אקסל או מחברת',
  other_system: 'מערכת אחרת', unknown: 'לא ידוע',
}
export const isCurrentSystem = (v: unknown): v is CurrentSystem => typeof v === 'string' && (CURRENT_SYSTEMS as readonly string[]).includes(v)
/** A booking system she would move over from (as opposed to WhatsApp, a notebook, or not known). */
export const isOtherBookingSystem = (s: CurrentSystem): boolean => s === 'calmark' || s === 'pink' || s === 'tor4you' || s === 'other_system'
export const FOLLOWERS_MAX = 10_000_000

export const isProspectStatus = (v: unknown): v is ProspectStatus => typeof v === 'string' && (PROSPECT_STATUSES as readonly string[]).includes(v)
export const isTreatment = (v: unknown): v is Treatment => typeof v === 'string' && (TREATMENTS as readonly string[]).includes(v)
export const CHANNELS = ['whatsapp', 'instagram'] as const
export type Channel = (typeof CHANNELS)[number]
export const CHANNEL_HE: Record<Channel, string> = { whatsapp: 'בוואטסאפ', instagram: 'באינסטגרם' }
export const isChannel = (v: unknown): v is Channel => typeof v === 'string' && (CHANNELS as readonly string[]).includes(v)
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
  /** How the last message went out (she sends it herself either way). */
  lastChannel: Channel | null
  contactCount: number
  createdAt: string
  /** Her phone matches a business that signed up to Kalmea (read-only match, computed on the server). */
  signedUp: boolean
  /** Instagram followers. Null when unknown (or before the enrich migration ran). */
  followers: number | null
  currentSystem: CurrentSystem
  /** YYYY-MM-DD, Israel calendar day: when to get back to her. */
  nextFollowup: string | null
}

// ── cleaning input ────────────────────────────────────────────────────────────
const oneLine = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

/** A city as typed, one line, up to CITY_MAX. Null when empty. */
export const cleanCity = (raw: unknown): string | null => oneLine(raw, CITY_MAX) || null

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
  /** Written only once the enrich migration ran (the route checks); null when not given. */
  followers: number | null; currentSystem: CurrentSystem | null; nextFollowup: string | null
}
export type InputResult = { ok: true; value: ProspectInput } | { ok: false; error: string }

/** One prospect from the form (or the route body). Phone or Instagram is required; a phone must be an Israeli mobile. */
export function cleanProspectInput(raw: Record<string, unknown>): InputResult {
  const name = oneLine(raw.name, NAME_MAX)
  if (!name) return { ok: false, error: 'חסר שם' }
  const phoneRaw = typeof raw.phone === 'string' ? raw.phone.trim() : ''
  let phone: string | null = null
  if (phoneRaw.length > 40) return { ok: false, error: 'מספר נייד לא תקין' }
  if (phoneRaw) {
    const p = normalizeIsraeliMobile(phoneRaw)
    if (!p.ok) return { ok: false, error: 'מספר נייד לא תקין' }
    phone = p.e164
  }
  const igRaw = typeof raw.instagram === 'string' ? raw.instagram.trim().slice(0, 200) : ''
  const instagram = cleanInstagram(igRaw)
  if (igRaw && !instagram) return { ok: false, error: 'שם משתמש באינסטגרם לא תקין' }
  if (!phone && !instagram) return { ok: false, error: 'צריך טלפון או אינסטגרם' }
  const notes = typeof raw.notes === 'string' ? raw.notes.replace(/\r\n/g, '\n').trim() : ''
  if (notes.length > NOTES_MAX) return { ok: false, error: `ההערה ארוכה מדי (עד ${NOTES_MAX} תווים)` }
  const enrich = cleanEnrichFields(raw)
  if (!enrich.ok) return enrich
  return {
    ok: true,
    value: {
      name, phone, instagram, city: oneLine(raw.city, CITY_MAX) || null,
      treatment: isTreatment(raw.treatment) ? raw.treatment : 'other',
      source: isSource(raw.source) ? raw.source : 'whatsapp',
      notes,
      followers: enrich.patch.followers ?? null,
      currentSystem: enrich.patch.current_system ?? null,
      nextFollowup: enrich.patch.next_followup ?? null,
    },
  }
}

// ── the enrich fields: followers, current system, next follow-up ─────────────
/** "12.5K", "1.2M", "3,400", "12.5 אלף", "980 עוקבות", 4200 -> a whole number. Null when it is not a follower count in range. */
export function parseFollowers(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isInteger(raw) && raw >= 0 && raw <= FOLLOWERS_MAX ? raw : null
  if (typeof raw !== 'string') return null
  const s = raw.trim().toLowerCase().replace(/\s*(עוקבים|עוקבות|followers)$/u, '').trim()
  const m = /^(\d{1,3}(?:,\d{3})+|\d+(?:[.,]\d+)?)\s*(k|m|אלף|מיליון)?$/u.exec(s)
  if (!m) return null
  const unit = m[2] === 'k' || m[2] === 'אלף' ? 1_000 : m[2] === 'm' || m[2] === 'מיליון' ? 1_000_000 : 1
  const num = /^\d{1,3}(,\d{3})+$/.test(m[1]) ? Number(m[1].replace(/,/g, '')) : Number(m[1].replace(',', '.'))
  if (unit === 1 && !Number.isInteger(num)) return null
  const n = Math.round(num * unit)
  return Number.isFinite(n) && n >= 0 && n <= FOLLOWERS_MAX ? n : null
}

/** 12500 -> "12.5K", 980 -> "980". For the card. */
export function formatFollowers(n: number | null | undefined): string {
  if (n == null) return ''
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${+(n / 1_000).toFixed(1)}K`
  return String(n)
}

const SYSTEM_ALIASES: Array<[RegExp, CurrentSystem]> = [
  [/^(calmark|קלמרק|קאלמרק|קל מרק)$/i, 'calmark'],
  [/^(pink|פינק)$/i, 'pink'],
  [/^(tor ?4 ?you|tor ?for ?you|תור ?4 ?יו|תור ?פור ?יו|תור4you)$/i, 'tor4you'],
  [/^(whatsapp|ווטסאפ|וואטסאפ|וואצאפ|ווצאפ|ידני|וואטסאפ ידני|ווטסאפ ידני|בוואטסאפ|manual)$/i, 'whatsapp_manual'],
  [/^(excel|אקסל|מחברת|יומן נייר|notebook|paper|אקסל או מחברת)$/i, 'excel_or_notebook'],
  [/^(other|other system|מערכת אחרת|אחרת)$/i, 'other_system'],
  [/^(unknown|לא ידוע)$/i, 'unknown'],
]
/** A system name as she would type it (Hebrew or English) or the stored key. Null when it is not one. */
export function parseCurrentSystem(raw: unknown): CurrentSystem | null {
  if (isCurrentSystem(raw)) return raw
  const s = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : ''
  if (!s) return null
  for (const [re, v] of SYSTEM_ALIASES) if (re.test(s)) return v
  return null
}

/** A real calendar date, YYYY-MM-DD, between 2020 and 2100. */
export function isFollowupDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const y = Number(v.slice(0, 4))
  if (y < 2020 || y > 2100) return false
  const d = new Date(`${v}T00:00:00Z`)
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v
}

export type EnrichPatch = { followers?: number | null; current_system?: CurrentSystem; next_followup?: string | null }
export type EnrichResult = { ok: true; patch: EnrichPatch; touched: boolean } | { ok: false; error: string }

/**
 * The three enrich fields from a request body (snake_case or camelCase). Only the keys present are in the patch; an empty value
 * clears followers / the follow-up date. `touched` tells the route a write needs the enrich migration.
 */
export function cleanEnrichFields(raw: Record<string, unknown>): EnrichResult {
  const patch: EnrichPatch = {}
  const followers = raw.followers
  if (followers !== undefined) {
    if (followers === null || followers === '') patch.followers = null
    else {
      const n = parseFollowers(followers)
      if (n === null) return { ok: false, error: `מספר עוקבות לא תקין (0 עד ${FOLLOWERS_MAX.toLocaleString('en-US')})` }
      patch.followers = n
    }
  }
  const sys = raw.current_system !== undefined ? raw.current_system : raw.currentSystem
  if (sys !== undefined && sys !== null && sys !== '') {
    const v = parseCurrentSystem(sys)
    if (!v) return { ok: false, error: 'מערכת לא מוכרת' }
    patch.current_system = v
  }
  const next = raw.next_followup !== undefined ? raw.next_followup : raw.nextFollowup
  if (next !== undefined) {
    if (next === null || next === '') patch.next_followup = null
    else if (!isFollowupDate(next)) return { ok: false, error: 'תאריך חזרה לא תקין' }
    else patch.next_followup = next
  }
  return { ok: true, patch, touched: Object.keys(patch).length > 0 }
}

/** An enrich column is missing (the enrich SQL file has not run): 42703 from Postgres, PGRST204 from PostgREST. */
export function isMissingEnrichColumns(e: { code?: string; message?: string } | null | undefined): boolean {
  if (!e) return false
  const msg = e.message || ''
  return e.code === '42703' || e.code === 'PGRST204' || (/followers|current_system|next_followup/.test(msg) && /not exist|schema cache|could not find/i.test(msg))
}

// ── paste many ────────────────────────────────────────────────────────────────
export type PastedRow = {
  name: string; phone: string | null; instagram?: string; city?: string; followers?: number; currentSystem?: CurrentSystem
}
export type PasteResult = {
  rows: PastedRow[]
  invalid: Array<{ line: number; text: string; error: string }>
  /** Lines whose phone (or handle) already appeared earlier in the same paste. */
  repeated: Array<{ line: number; text: string }>
}

const FOLLOWERS_CELL = /^\d+(?:[.,]\d+)?\s*(k|m|אלף|מיליון)(\s*(עוקבים|עוקבות|followers))?$|^\d[\d,.]*\s*(עוקבים|עוקבות|followers)$|^\d{1,5}$/iu

/**
 * One prospect per line: "name, phone" (a tab, a semicolon or " - " also separate; the order may be either way round).
 * Optional cells, in any order: an Instagram handle (@noa.brows), a follower count ("12.5K", "3400"), the system she uses
 * ("קלמרק", "Pink", "ווטסאפ", "מחברת") and a city (the first plain text cell after the name). A line needs a phone or a handle.
 * Phones are normalized to 9725XXXXXXXX and a phone or handle that repeats inside the paste is kept once.
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
    let instagram: string | undefined
    let followers: number | undefined
    let currentSystem: CurrentSystem | undefined
    const texts: string[] = []
    for (const p of parts) {
      if (followers === undefined && FOLLOWERS_CELL.test(p)) {
        const f = parseFollowers(p)
        if (f !== null) { followers = f; continue }
      }
      const n: PhoneResult | null = !phone && /\d{6,}|\d[\d\s-]{7,}/.test(p) ? normalizeIsraeliMobile(p) : null
      if (n && n.ok) { phone = n.e164; continue }
      if (n && !n.ok) { out.invalid.push({ line: i + 1, text: line, error: 'מספר נייד לא תקין' }); return }
      if (!instagram && (/^@/.test(p) || /instagram\.com\//i.test(p))) {
        const h = cleanInstagram(p)
        if (h) { instagram = h; continue }
      }
      if (!currentSystem) {
        const sys = parseCurrentSystem(p)
        if (sys) { currentSystem = sys; continue }
      }
      texts.push(p)
    }
    // The first plain cell is her name; a second one is the city; anything after that joins the name, as before.
    const [first = '', second, ...rest] = texts
    const name = [first, ...rest].join(' ').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)
    const city = second ? second.replace(/\s+/g, ' ').trim().slice(0, CITY_MAX) : undefined
    if (!phone && !instagram) { out.invalid.push({ line: i + 1, text: line, error: 'לא נמצא מספר טלפון' }); return }
    if (!name) { out.invalid.push({ line: i + 1, text: line, error: 'חסר שם' }); return }
    if ((phone && seen.has(phone)) || (instagram && seen.has(`@${instagram}`))) { out.repeated.push({ line: i + 1, text: line }); return }
    if (phone) seen.add(phone)
    if (instagram) seen.add(`@${instagram}`)
    const row: PastedRow = { name, phone }
    if (instagram) row.instagram = instagram
    if (city) row.city = city
    if (followers !== undefined) row.followers = followers
    if (currentSystem) row.currentSystem = currentSystem
    out.rows.push(row)
  })
  return out
}

export type ExistingKey = { id: string; phone: string | null; instagram: string | null }
export type AddPlan<T> = {
  /** Nobody on the list (or earlier in the batch) shares her phone or handle: a new row, status "חדשה". */
  fresh: T[]
  /** Already on the list: the missing phone / handle is filled into HER EXISTING ROW. Status, notes and history are untouched, so
   *  whoever declined or asked to stop stays that way and never becomes contactable again. */
  merges: Array<{ id: string; patch: { phone_e164?: string; instagram?: string }; incoming: T }>
  /** Already on the list (or twice in the batch) with nothing new to add, or matching two different rows: skipped. */
  duplicates: T[]
}

/**
 * The same person = the same phone OR the same Instagram handle. Matching on either key (not on the phone alone) is what stops
 * "add her phone" from creating a second, contactable row for someone already listed by handle, perhaps as "ביקשה להפסיק".
 */
export function planAdd<T extends { phone: string | null; instagram?: string | null }>(incoming: T[], existing: ExistingKey[]): AddPlan<T> {
  const byPhone = new Map<string, ExistingKey>()
  const byHandle = new Map<string, ExistingKey>()
  for (const e of existing) {
    if (e.phone) byPhone.set(e.phone, e)
    if (e.instagram) byHandle.set(e.instagram, e)
  }
  const batchPhones = new Set<string>()
  const batchHandles = new Set<string>()
  const merged = new Set<string>()
  const out: AddPlan<T> = { fresh: [], merges: [], duplicates: [] }
  for (const p of incoming) {
    const ig = p.instagram || null
    const a = p.phone ? byPhone.get(p.phone) : undefined
    const b = ig ? byHandle.get(ig) : undefined
    if ((p.phone && batchPhones.has(p.phone)) || (ig && batchHandles.has(ig))) { out.duplicates.push(p); continue }
    if (p.phone) batchPhones.add(p.phone)
    if (ig) batchHandles.add(ig)
    if (!a && !b) { out.fresh.push(p); continue }
    // Phone matches one row and handle another: two rows already, never merge them by guess.
    if (a && b && a.id !== b.id) { out.duplicates.push(p); continue }
    const row = (a || b)!
    const patch: { phone_e164?: string; instagram?: string } = {}
    if (!row.phone && p.phone && !byPhone.has(p.phone)) patch.phone_e164 = p.phone
    if (!row.instagram && ig && !byHandle.has(ig)) patch.instagram = ig
    if (Object.keys(patch).length === 0 || merged.has(row.id)) { out.duplicates.push(p); continue }
    merged.add(row.id)
    if (patch.phone_e164) byPhone.set(patch.phone_e164, row)
    if (patch.instagram) byHandle.set(patch.instagram, row)
    out.merges.push({ id: row.id, patch, incoming: p })
  }
  return out
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

// ── who to contact first ─────────────────────────────────────────────────────
/** The Israel calendar day of a date, YYYY-MM-DD. */
export function israelDayOf(d: Date): string {
  return israelDay(d)
}

/** Her follow-up date is today or already passed (Israel day). */
export function followupDue(nextFollowup: string | null | undefined, now: Date): boolean {
  return isFollowupDate(nextFollowup) && nextFollowup <= israelDay(now)
}

/** Whole days her follow-up is overdue (0 = today). Null when not due. */
export function followupOverdueDays(nextFollowup: string | null | undefined, now: Date): number | null {
  if (!followupDue(nextFollowup, now)) return null
  return Math.round((Date.parse(`${israelDay(now)}T00:00:00Z`) - Date.parse(`${nextFollowup}T00:00:00Z`)) / MS_DAY)
}

const STATUS_SCORE: Record<ProspectStatus, number> = { new: 30, replied: 35, trial: 30, messaged: 10, paying: 0, not_interested: 0, opted_out: 0 }
const SYSTEM_SCORE: Record<CurrentSystem, number> = {
  whatsapp_manual: 20, excel_or_notebook: 16, unknown: 8, other_system: 6, calmark: 5, pink: 5, tor4you: 5,
}
function followersScore(n: number | null): number {
  if (n == null) return 5
  if (n < 300) return 2
  if (n < 1_000) return 8
  if (n <= 10_000) return 20 // the sweet spot: a busy solo business that still runs it all herself
  if (n <= 50_000) return 10
  return 3
}

/**
 * Who to contact first, computed here and never stored. Higher is sooner. Whoever declined or asked to stop is -1 (never).
 * Status (an answer waiting beats a cold name), followers (1K to 10K is the sweet spot), the system she uses (WhatsApp by hand
 * or a notebook first: that is the pain Kalmea removes), recency (a message under RECENT_DAYS ago pushes her down) and a
 * follow-up date (due today or overdue puts her on top; a later date waits for it).
 */
export function prospectPriority(p: Prospect, now: Date): number {
  if (!canSend(p.status)) return -1
  let score = STATUS_SCORE[p.status] + followersScore(p.followers) + SYSTEM_SCORE[p.currentSystem]
  if (!p.lastContactedAt) score += 5
  else if (contactedRecently(p.lastContactedAt, now)) score -= 25
  if (followupDue(p.nextFollowup, now)) score += 60
  else if (isFollowupDate(p.nextFollowup)) score -= 10
  return Math.max(0, score)
}

/** Highest priority first; ties keep the list order (oldest added first). */
export function sortByPriority(rows: Prospect[], now: Date): Prospect[] {
  const scored = rows.map((r) => ({ r, s: prospectPriority(r, now) }))
  return scored.sort((a, b) => b.s - a.s || a.r.createdAt.localeCompare(b.r.createdAt)).map((x) => x.r)
}

export type TodayItem = { p: Prospect; reason: 'followup' | 'new' }

/**
 * "לפנות היום": first whoever's follow-up is today or overdue (the oldest date first), then the highest-priority ones not yet
 * contacted at all. The whole list is capped by what is left of DAILY_SOFT_LIMIT today. Whoever declined is never on it.
 */
export function todayList(rows: Prospect[], now: Date, limit = DAILY_SOFT_LIMIT): TodayItem[] {
  const room = Math.max(0, limit - sentToday(rows, now))
  if (room === 0) return []
  const today = israelDay(now)
  const due = rows.filter((r) => canSend(r.status) && followupDue(r.nextFollowup, now)
    && !(r.lastContactedAt && israelDay(new Date(r.lastContactedAt)) === today))
    .sort((a, b) => (a.nextFollowup || '').localeCompare(b.nextFollowup || '') || prospectPriority(b, now) - prospectPriority(a, now))
  const dueIds = new Set(due.map((r) => r.id))
  const fresh = sortByPriority(rows.filter((r) => !dueIds.has(r.id) && r.status === 'new' && !r.lastContactedAt
    && !isFollowupDate(r.nextFollowup)), now)
  return [...due.map((p) => ({ p, reason: 'followup' as const })), ...fresh.map((p) => ({ p, reason: 'new' as const }))].slice(0, room)
}

/** The table has not been created yet (the SQL file has not run). */
export function isMissingProspectsTable(e: { code?: string; message?: string } | null | undefined): boolean {
  // "column prospects.followers does not exist" names the table too: that is a missing COLUMN (the enrich file), not the table.
  if (isMissingEnrichColumns(e)) return false
  return !!e && (e.code === '42P01' || e.code === 'PGRST205' || (/prospects/.test(e.message || '') && /not exist|schema cache/i.test(e.message || '')))
}
