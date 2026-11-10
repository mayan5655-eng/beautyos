// lib/importFile.ts
//
// "מעבר בקלות מתוכנה אחרת": a CSV or Excel export from whatever system she used before becomes clients, services and future
// appointments in Kalmea. The biggest thing stopping a cosmetician from switching is the client list and the diary she already
// has somewhere else; this is the door for both.
//
// What it reuses rather than copies:
//   lib/leads/readUpload.ts   bytes -> {headers, rows}: CSV in any of the encodings Israeli Excel writes, .xlsx and .xls, with
//                             phones and dates kept as she sees them in Excel (the server route calls it).
//   lib/importMapping.js      the paste wizard's cell readers: parseImportDate (day first), parseMoney,
//                             parseMinutes and importPhoneKey (the one "same person" key both imports dedupe on).
//   lib/phone.ts              normalizeIsraeliMobile, so "+972 (0)52-...", "052..." and "52..." are one client.
//   lib/apptTime.ts, lib/serviceBuffer.ts   the same [start, end) + stored-buffer overlap test the calendar and the database use.
//
// Pure: no database, no clock (the caller passes today and the minute now), no network. The route reads her existing data,
// calls buildImportPlan, and writes exactly what the plan says. The preview and the import run the SAME function on the SAME
// bytes, so "נמצאו 312 לקוחות, 18 כפולות ידלגו" is what lands.
//
// Hidden behind NEXT_PUBLIC_IMPORT_TOOL (importToolEnabled below): empty means the card, the sheet and the route do not exist.

import { parseImportDate, parseMoney, parseMinutes, importPhoneKey } from './importMapping.js';
import { normalizeIsraeliMobile } from './phone.ts';
import { startMinute, endMinute, fmtTime } from './apptTime.ts';
import { bufferedRange } from './serviceBuffer.ts';
import { DEFAULT_SERVICE_COLOR, SERVICE_COLOR_CYCLE } from './serviceColors.ts';

// ── The flag ─────────────────────────────────────────────────────────────────

/** On only for "1" or "true". Empty (the default) = nothing renders and the route answers 404. */
export function importToolEnabled(
  env: Record<string, string | undefined> = { NEXT_PUBLIC_IMPORT_TOOL: process.env.NEXT_PUBLIC_IMPORT_TOOL },
): boolean {
  const v = String(env.NEXT_PUBLIC_IMPORT_TOOL || '').trim().toLowerCase();
  return v === '1' || v === 'true';
}

// ── Limits ───────────────────────────────────────────────────────────────────

/** A 5,000-client export is well under 1 MB as CSV; 5 MB leaves room for a fat .xlsx. */
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
/** Rows read from one file. Far above any one-chair business; a file past it is refused, never half-imported. */
export const IMPORT_MAX_ROWS = 10_000;
/** How many sample rows the mapping screen shows. */
export const PREVIEW_ROWS = 5;
/** Conflicts listed one by one (all are counted). */
export const MAX_CONFLICTS_LISTED = 200;

// ── Fields ───────────────────────────────────────────────────────────────────

export type FileField =
  | 'ignore' | 'name' | 'firstName' | 'lastName' | 'phone' | 'email' | 'birthday' | 'notes'
  | 'service' | 'price' | 'duration' | 'date' | 'time' | 'endTime' | 'status';

export const FILE_FIELDS: { id: FileField; label: string }[] = [
  { id: 'ignore', label: 'לא לייבא' },
  { id: 'name', label: 'שם מלא' },
  { id: 'firstName', label: 'שם פרטי' },
  { id: 'lastName', label: 'שם משפחה' },
  { id: 'phone', label: 'טלפון' },
  { id: 'email', label: 'מייל' },
  { id: 'birthday', label: 'תאריך לידה' },
  { id: 'notes', label: 'הערות' },
  { id: 'service', label: 'טיפול' },
  { id: 'price', label: 'מחיר' },
  { id: 'duration', label: 'משך (דקות)' },
  { id: 'date', label: 'תאריך התור' },
  { id: 'time', label: 'שעת התחלה' },
  { id: 'endTime', label: 'שעת סיום' },
  { id: 'status', label: 'סטטוס התור' },
];
const FIELD_IDS = new Set<string>(FILE_FIELDS.map((f) => f.id));
/** Fields more than one column may carry: their text is joined. Every other field takes the first column only. */
const MULTI_FIELDS = new Set<FileField>(['notes']);

// ── Header auto-mapping ──────────────────────────────────────────────────────

/** "דוא״ל", "E-mail", " Phone_Number " -> "דואל", "e mail", "phone number". */
export function normalizeHeader(h: unknown): string {
  return String(h ?? '')
    .toLowerCase()
    .replace(/["'״׳`]/g, '')
    .replace(/[_\-./\\:()[\]#*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Exact header names, after normalizeHeader. Checked before the keyword rules below. */
const GENERIC_ALIASES: Partial<Record<FileField, string[]>> = {
  name: ['שם', 'שם מלא', 'שם הלקוח', 'שם הלקוחה', 'שם לקוח', 'שם לקוחה', 'לקוח', 'לקוחה', 'שם איש קשר', 'איש קשר',
    'name', 'full name', 'fullname', 'client', 'client name', 'customer', 'customer name', 'contact', 'contact name'],
  firstName: ['שם פרטי', 'first name', 'firstname', 'given name'],
  lastName: ['שם משפחה', 'last name', 'lastname', 'surname', 'family name'],
  phone: ['טלפון', 'נייד', 'טלפון נייד', 'מספר טלפון', 'מספר נייד', 'פלאפון', 'סלולרי', 'טל', 'טלפון לקוח', 'טלפון הלקוח',
    'phone', 'mobile', 'cell', 'cellphone', 'phone number', 'mobile phone', 'mobile number', 'telephone', 'tel'],
  email: ['מייל', 'אימייל', 'דואל', 'דואר אלקטרוני', 'email', 'e mail', 'mail', 'email address'],
  birthday: ['תאריך לידה', 'יום הולדת', 'ת לידה', 'birthday', 'birth date', 'birthdate', 'date of birth', 'dob'],
  notes: ['הערות', 'הערה', 'הערות לקוח', 'notes', 'note', 'comments', 'comment', 'remarks'],
  service: ['טיפול', 'שירות', 'סוג טיפול', 'שם הטיפול', 'שם השירות', 'שם טיפול', 'שם שירות',
    'service', 'treatment', 'service name', 'treatment name'],
  price: ['מחיר', 'עלות', 'סכום', 'תשלום', 'price', 'cost', 'amount', 'total'],
  duration: ['משך', 'משך טיפול', 'משך הטיפול', 'משך בדקות', 'דקות', 'זמן טיפול', 'duration', 'length', 'minutes'],
  date: ['תאריך', 'תאריך התור', 'תאריך תור', 'מועד', 'מועד התור', 'date', 'appointment date', 'start date', 'day'],
  time: ['שעה', 'שעת התחלה', 'שעת התור', 'שעת תור', 'התחלה', 'time', 'start time', 'start', 'hour', 'from'],
  endTime: ['שעת סיום', 'סיום', 'עד שעה', 'עד', 'end time', 'end', 'to', 'until'],
  status: ['סטטוס', 'מצב', 'סטטוס תור', 'status', 'state'],
};

/**
 * Header shapes we have reason to expect from a few systems Israeli cosmeticians move from. Written from general knowledge of
 * how such exports are usually laid out, NOT checked against real files from those systems, which is why the generic mapping
 * stays the main path, these only nudge the guess, and the copy promises "קובץ CSV או Excel מכל מערכת" and nothing more.
 */
export const IMPORT_PRESETS: { id: string; label: string; aliases: Partial<Record<FileField, string[]>> }[] = [
  { id: 'generic', label: 'זיהוי אוטומטי', aliases: {} },
  {
    id: 'calmark', label: 'Calmark',
    aliases: {
      name: ['לקוח', 'שם הלקוח', 'customer'],
      phone: ['טלפון לקוח', 'נייד'],
      service: ['שירות', 'שירותים'],
      time: ['שעת התחלה', 'משעה'],
      endTime: ['שעת סיום', 'עד שעה'],
      status: ['סטטוס', 'סטטוס תור'],
    },
  },
  {
    id: 'pink', label: 'Pink',
    aliases: {
      name: ['שם לקוחה', 'שם הלקוחה', 'לקוחה'],
      phone: ['נייד', 'מספר נייד'],
      birthday: ['יום הולדת'],
      service: ['טיפול', 'סוג טיפול'],
      date: ['תאריך התור', 'תאריך'],
      time: ['שעת התור', 'שעה'],
    },
  },
  {
    id: 'tor4you', label: 'Tor4You',
    aliases: {
      name: ['שם', 'שם מלא'],
      phone: ['טלפון', 'מספר טלפון'],
      service: ['שירות'],
      date: ['תאריך'],
      time: ['שעה'],
    },
  },
  { id: 'excel', label: 'Excel / Google Sheets', aliases: {} },
];

/** Columns that look like a date or a name but are bookkeeping of the OLD system. Left on "לא לייבא". */
const IGNORE_HEADER = /יצירה|הצטרפות|עדכון|נוצר|עודכן|ביקור אחרון|ביקור הבא|מזהה|created|updated|modified|joined|last visit|next visit|^id$|\bid\b|מספר לקוח|מספר תור|עובד|עובדת|staff|employee|סניף|branch/;

/** Keyword rules, in priority order: the more specific idea first ("מחיר טיפול" is a price, "שם הטיפול" a service). */
const KEYWORD_RULES: [FileField, RegExp][] = [
  ['birthday', /לידה|הולדת|birth|dob/],
  ['firstName', /פרטי|first/],
  ['lastName', /משפחה|last name|surname/],
  ['endTime', /סיום|\bend\b|until/],
  ['email', /מייל|דואל|דואר|mail/],
  ['phone', /טלפון|נייד|פלאפון|סלולר|phone|mobile|cell|\btel\b/],
  ['price', /מחיר|עלות|סכום|תשלום|price|cost|amount|₪/],
  ['duration', /משך|דקות|duration|minutes/],
  ['time', /שעה|שעת|time|hour/],
  ['date', /תאריך|מועד|date/],
  ['status', /סטטוס|status/],
  ['notes', /הערה|הערות|note|comment|remark/],
  ['service', /טיפול|שירות|service|treatment/],
  ['name', /שם|name|לקוח|client|customer/],
];

const looksLikePhoneCell = (s: string) => /^[\d\-+() ]{7,}$/.test(s.trim()) && (s.replace(/\D/g, '').length >= 9);

/**
 * One field per column. Preset aliases first, then the generic exact names, then the keyword rules, then (for a header we did not
 * recognise) the shape of the cells: a column that is mostly phone numbers is the phone. Every field except notes is given to the
 * first column that claims it, so two "טלפון" columns do not both become the phone.
 */
export function autoMapHeaders(headers: string[], rows: string[][] = [], presetId = 'generic'): FileField[] {
  const preset = IMPORT_PRESETS.find((p) => p.id === presetId) || IMPORT_PRESETS[0];
  const taken = new Set<FileField>();
  const out: FileField[] = headers.map(() => 'ignore');
  const claim = (i: number, f: FileField) => {
    if (!MULTI_FIELDS.has(f) && taken.has(f)) return false;
    out[i] = f; taken.add(f); return true;
  };
  const norm = headers.map(normalizeHeader);

  // Pass 1: exact names (preset, then generic). Done over ALL columns before any keyword guess, so an exact "טלפון" later in
  // the file wins over a keyword match like "טלפון נוסף" earlier.
  for (const table of [preset.aliases, GENERIC_ALIASES]) {
    norm.forEach((h, i) => {
      if (!h || out[i] !== 'ignore') return;
      for (const [field, names] of Object.entries(table) as [FileField, string[]][]) {
        if (names.map(normalizeHeader).includes(h) && claim(i, field)) return;
      }
    });
  }
  // Pass 2: keywords.
  norm.forEach((h, i) => {
    if (!h || out[i] !== 'ignore' || IGNORE_HEADER.test(h)) return;
    for (const [field, re] of KEYWORD_RULES) {
      if (re.test(h)) { if (claim(i, field)) return; }
    }
  });
  // Pass 3: unlabelled or unrecognised columns, by their cells.
  if (!taken.has('phone')) {
    for (let i = 0; i < headers.length; i++) {
      if (out[i] !== 'ignore' || (norm[i] && IGNORE_HEADER.test(norm[i]))) continue;
      const cells = rows.slice(0, 50).map((r) => String(r[i] ?? '').trim()).filter(Boolean);
      if (cells.length && cells.filter(looksLikePhoneCell).length >= cells.length * 0.6) { claim(i, 'phone'); break; }
    }
  }
  return out;
}

/** Keep a mapping that came over the wire honest: known field ids only, one per column, the right length. */
export function cleanMapping(raw: unknown, width: number): FileField[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: FileField[] = [];
  const taken = new Set<string>();
  for (let i = 0; i < width; i++) {
    const v = String(arr[i] ?? 'ignore');
    let f: FileField = FIELD_IDS.has(v) ? (v as FileField) : 'ignore';
    if (f !== 'ignore' && !MULTI_FIELDS.has(f) && taken.has(f)) f = 'ignore';
    taken.add(f);
    out.push(f);
  }
  return out;
}

// ── Cell readers ─────────────────────────────────────────────────────────────

export type DateOrder = 'dmy' | 'mdy';

/** Excel's day 1 is 1900-01-01, with the 1900 leap-year bug: serial 25569 is 1970-01-01. */
function excelSerialToIso(n: number): string | null {
  if (!Number.isFinite(n) || n < 1 || n > 2958465) return null;
  const ms = Math.round((n - 25569) * 86400000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Split "12/08/2026 14:30" into its date and time parts. A cell with only one of them gives '' for the other. */
function splitDateTime(raw: string): { d: string; t: string } {
  const s = raw.trim().replace(/T/, ' ');
  // "12/08/2026 2:30 PM", "12/08/2026 14:30:00", "12/08/2026 2:30 אחה"צ": everything after the first space is the time, when it reads as one.
  const m = s.match(/^(\S+)\s+(\d.*)$/);
  if (m && parseFileTime(m[2]) !== null) return { d: m[1], t: m[2] };
  return { d: s, t: '' };
}

/**
 * A date cell -> "YYYY-MM-DD", or null. Day first unless she switched to month first; year-first (ISO) is read as is; a bare
 * Excel serial number (a date cell that lost its format) is converted.
 */
export function parseFileDate(raw: unknown, order: DateOrder = 'dmy'): string | null {
  const { d } = splitDateTime(String(raw ?? ''));
  if (!d) return null;
  if (/^\d{5}(\.\d+)?$/.test(d)) return excelSerialToIso(Math.floor(Number(d)));
  const m = d.match(/^(\d{1,4})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (!m) return null;
  if (order === 'mdy' && m[1].length <= 2) return parseImportDate(`${m[2]}/${m[1]}/${m[3]}`);
  return parseImportDate(d);
}

/** AM / PM words, Latin and Hebrew, after quotes and dots are removed: "לפנה"צ" -> "לפנהצ", "p.m." -> "pm". */
const AM_MARK = /^(am|a|לפנהצ|לפני הצהריים|בבוקר)$/;
const PM_MARK = /^(pm|p|אחהצ|אחר הצהריים|בערב|בלילה)$/;

/**
 * "14:30", "14.30", "14:30:00", "14", "2:30 PM", "2:30pm", "2 PM", "02:30:00 PM", "2:30 אחה"צ", "9:00 לפנה"צ" -> minutes from
 * midnight, or null. With AM / PM the hour must be 1-12 (12 AM = 00:00, 12 PM = noon); without, it is read as 24-hour.
 * "2:30 PM" used to come back null, and a valid future appointment was skipped as "no time" (Vercel Agent review on #59).
 */
export function parseFileTime(raw: unknown): number | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  // A time-only cell Excel stored as a fraction of a day (0.604166 = 14:30).
  if (/^0?\.\d+$/.test(s)) {
    const mins = Math.round(Number(s) * 1440);
    return mins >= 0 && mins < 1440 ? mins : null;
  }
  const m = s.match(/^(\d{1,2})(?:[:.](\d{2})(?::\d{2})?)?\s*(.*)$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] === undefined ? 0 : Number(m[2]);
  if (min > 59) return null;
  const mark = m[3].toLowerCase().replace(/["'״׳.]/g, '').replace(/\s+/g, ' ').trim();
  if (mark) {
    const am = AM_MARK.test(mark), pm = PM_MARK.test(mark);
    if (!am && !pm) return null;
    if (h < 1 || h > 12) return null;
    if (pm && h < 12) h += 12;
    if (am && h === 12) h = 0;
  }
  if (h > 23) return null;
  return h * 60 + min;
}

/**
 * Which way round are the dates in this column? Any first part over 12 proves day first, any second part over 12 proves month
 * first; neither (every date on or before the 12th) is 'unknown', and she is shown the choice.
 */
export function detectDateOrder(values: unknown[]): DateOrder | 'unknown' {
  let dayFirst = false, monthFirst = false;
  for (const v of values) {
    const { d } = splitDateTime(String(v ?? ''));
    const m = d.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
    if (!m) continue;
    if (+m[1] > 12) dayFirst = true;
    if (+m[2] > 12) monthFirst = true;
  }
  if (dayFirst && !monthFirst) return 'dmy';
  if (monthFirst && !dayFirst) return 'mdy';
  return 'unknown';
}

/** A status that means the visit is not happening. Such a row is never imported as an appointment. */
const CANCELLED_STATUS = /בוטל|ביטול|מבוטל|לא הגיע|לא הגיעה|cancel|no ?show|deleted|נמחק/i;

/** Names compared the way she reads them: trimmed, single spaces, case-insensitive for Latin names. */
export const nameKey = (s: unknown) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * The phone as it is stored and the key two records are "the same person" by. A real Israeli mobile is stored in the local shape
 * she types ("0501234567"); anything else (a landline, a foreign number) keeps its digits and still dedupes by them.
 */
export function phoneOf(raw: unknown): { stored: string; key: string; mobile: boolean } {
  const s = String(raw ?? '').trim();
  if (!s) return { stored: '', key: '', mobile: false };
  const n = normalizeIsraeliMobile(s);
  if (n.ok) { const local = '0' + n.e164.slice(3); return { stored: local, key: local, mobile: true }; }
  const stored = s.replace(/[^\d+]/g, '').slice(0, 20);
  const key = importPhoneKey(stored);
  return { stored, key: key.length >= 7 ? key : '', mobile: false };
}

const clientKeyOf = (phoneKey: string, name: string) => (phoneKey ? `p:${phoneKey}` : `n:${nameKey(name)}`);

// ── The plan ─────────────────────────────────────────────────────────────────

export interface ExistingClient { id: string; name?: string | null; phone?: string | null }
export interface ExistingService { name?: string | null; price?: number | null; duration?: number | null; color?: string | null }
export interface ExistingAppt {
  id?: string; date: string; start_minute?: number | null; hour?: number | null; duration?: number | null;
  buffer_minutes?: number | null; client_id?: string | null; name?: string | null; confirmation_status?: string | null;
}
export interface ExistingData { clients: ExistingClient[]; services: ExistingService[]; appointments: ExistingAppt[] }

export interface PlanOptions {
  clients: boolean;
  services: boolean;
  appts: boolean;
  dateOrder: DateOrder;
  /** Israel's date, "YYYY-MM-DD". */
  today: string;
  /** Minutes since midnight, Israel time. */
  nowMinute: number;
}

export interface ClientDraft { key: string; name: string; phone: string; birthday: string; notes: string; status: 'active' }
export interface ServiceDraft { name: string; price: number; duration: number; color: string; active: true }
export interface ApptDraft {
  row: number; date: string; startMinute: number; duration: number; price: number;
  name: string; service: string; note: string; clientKey: string; color: string;
}
export interface Conflict { row: number; date: string; time: string; name: string; service: string; with: string }

export interface ImportPlan {
  clients: {
    found: number; toCreate: ClientDraft[]; existing: number; dupInFile: number; noName: number;
    nameIsService: number; notMobile: number; forApptsOnly: number;
  };
  services: { found: number; toCreate: ServiceDraft[]; existing: number };
  appts: {
    found: number; toCreate: ApptDraft[]; past: number; cancelled: number; noDate: number; noTime: number; noName: number;
    alreadyInCalendar: number; dupInFile: number; conflicts: Conflict[]; conflictCount: number;
  };
}

const cell = (r: string[], i: number) => String(r[i] ?? '').trim();

interface RowRead {
  name: string; phone: ReturnType<typeof phoneOf>; email: string; birthdayRaw: string; notes: string[];
  service: string; price: number | null; duration: number | null; dateRaw: string; timeRaw: string; endRaw: string; status: string;
}

function readRow(r: string[], mapping: FileField[]): RowRead {
  let name = '', first = '', last = '', phoneRaw = '', email = '', birthdayRaw = '', service = '';
  let price: number | null = null, duration: number | null = null, dateRaw = '', timeRaw = '', endRaw = '', status = '';
  const notes: string[] = [];
  mapping.forEach((f, i) => {
    const v = cell(r, i);
    if (!v || f === 'ignore') return;
    switch (f) {
      case 'name': name = v; break;
      case 'firstName': first = v; break;
      case 'lastName': last = v; break;
      case 'phone': phoneRaw = v; break;
      case 'email': email = v; break;
      case 'birthday': birthdayRaw = v; break;
      case 'notes': notes.push(v); break;
      case 'service': service = v.replace(/\s+/g, ' ').slice(0, 120); break;
      case 'price': price = parseMoney(v); break;
      case 'duration': duration = parseMinutes(v); break;
      case 'date': dateRaw = v; break;
      case 'time': timeRaw = v; break;
      case 'endTime': endRaw = v; break;
      case 'status': status = v; break;
    }
  });
  const full = (name || [first, last].filter(Boolean).join(' ')).replace(/\s+/g, ' ').trim().slice(0, 80);
  return { name: full, phone: phoneOf(phoneRaw), email: email.slice(0, 120), birthdayRaw, notes, service, price, duration, dateRaw, timeRaw, endRaw, status };
}

/**
 * Everything an import would do, computed without touching anything. `rows` are the data rows (no header). Row numbers in the
 * report are as she sees them in Excel: header = 1, first data row = 2.
 */
export function buildImportPlan(rows: string[][], mapping: FileField[], existing: ExistingData, opts: PlanOptions): ImportPlan {
  const has = (f: FileField) => mapping.includes(f);
  const doAppts = opts.appts && has('date');

  // ── what is already there ──
  const clientIdByKey = indexExistingClients(existing.clients || []);
  const clientNameById = new Map<string, string>();
  const clientKeyById = new Map<string, string>();
  for (const c of existing.clients || []) {
    clientNameById.set(c.id, String(c.name ?? ''));
    clientKeyById.set(c.id, clientKeyOf(phoneOf(c.phone).key, String(c.name ?? '')));
  }
  const serviceByName = new Map<string, ExistingService>();
  for (const s of existing.services || []) {
    const k = nameKey(s.name);
    if (k && !serviceByName.has(k)) serviceByName.set(k, s);
  }

  const read = rows.map((r) => readRow(r, mapping));

  // ── services ──
  const services: ImportPlan['services'] = { found: 0, toCreate: [], existing: 0 };
  const newServiceByName = new Map<string, ServiceDraft>();
  if (opts.services && has('service')) {
    const seen = new Set<string>();
    let colorAt = (existing.services || []).length;
    for (const r of read) {
      const k = nameKey(r.service);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      services.found++;
      if (serviceByName.has(k)) { services.existing++; continue; }
      const draft: ServiceDraft = {
        name: r.service,
        price: r.price !== null && r.price >= 0 ? r.price : 0,
        duration: r.duration !== null && r.duration > 0 && r.duration <= 600 ? r.duration : 60,
        color: SERVICE_COLOR_CYCLE[colorAt++ % SERVICE_COLOR_CYCLE.length] || DEFAULT_SERVICE_COLOR,
        active: true,
      };
      newServiceByName.set(k, draft);
      services.toCreate.push(draft);
    }
  }
  const serviceFor = (name: string): ExistingService | ServiceDraft | undefined =>
    serviceByName.get(nameKey(name)) || newServiceByName.get(nameKey(name));
  // A "client" whose name is one of her treatments is a mis-mapped column, not a person (the paste import's guard).
  const isServiceName = (n: string) => !!nameKey(n) && (serviceByName.has(nameKey(n)) || newServiceByName.has(nameKey(n)));

  // ── clients ──
  const clients: ImportPlan['clients'] = { found: 0, toCreate: [], existing: 0, dupInFile: 0, noName: 0, nameIsService: 0, notMobile: 0, forApptsOnly: 0 };
  const plannedKeys = new Map<string, ClientDraft>();
  const draftFor = (r: RowRead): ClientDraft => {
    const birthday = r.birthdayRaw ? parseFileDate(r.birthdayRaw, opts.dateOrder) : null;
    const extra: string[] = [...r.notes];
    if (r.email) extra.push(`מייל: ${r.email}`);
    // A birthday with no year ("12/08") cannot be stored as a date: it is kept in her notes rather than invented.
    if (r.birthdayRaw && !birthday) extra.push(`יום הולדת: ${r.birthdayRaw}`);
    return {
      key: clientKeyOf(r.phone.key, r.name), name: r.name, phone: r.phone.stored,
      birthday: birthday && birthday <= opts.today ? birthday : '', notes: extra.join('\n').slice(0, 2000), status: 'active',
    };
  };
  const knownClient = (k: string) => clientIdByKey.has(k);

  if (opts.clients) {
    for (const r of read) {
      if (!r.name) { if (r.phone.key || r.email || r.notes.length) clients.noName++; continue; }
      if (isServiceName(r.name)) { clients.nameIsService++; continue; }
      clients.found++;
      const k = clientKeyOf(r.phone.key, r.name);
      if (knownClient(k)) { clients.existing++; continue; }
      if (plannedKeys.has(k)) { clients.dupInFile++; continue; }
      if (r.phone.stored && !r.phone.mobile) clients.notMobile++;
      const d = draftFor(r);
      plannedKeys.set(k, d);
      clients.toCreate.push(d);
    }
  }

  // ── appointments ──
  const appts: ImportPlan['appts'] = {
    found: 0, toCreate: [], past: 0, cancelled: 0, noDate: 0, noTime: 0, noName: 0, alreadyInCalendar: 0, dupInFile: 0,
    conflicts: [], conflictCount: 0,
  };
  if (doAppts) {
    // Busy time per day: her existing, not-cancelled appointments with THEIR stored buffer (what the database enforces).
    const busy = new Map<string, { s: number; e: number; who: string }[]>();
    const existingSlots = new Set<string>();
    for (const a of existing.appointments || []) {
      if (!a || !a.date || a.date < opts.today) continue;
      if (a.confirmation_status === 'cancelled') continue;
      const s = startMinute(a), e = endMinute(a);
      if (s === null || e === null) continue;
      const [bs, be] = bufferedRange(s, e, Number(a.buffer_minutes || 0));
      const who = String(a.name || (a.client_id ? clientNameById.get(a.client_id) : '') || 'תור קיים');
      if (!busy.has(a.date)) busy.set(a.date, []);
      busy.get(a.date)!.push({ s: bs, e: be, who });
      const ck = a.client_id && clientKeyById.has(a.client_id) ? clientKeyById.get(a.client_id)! : `n:${nameKey(a.name)}`;
      existingSlots.add(`${a.date}|${s}|${ck}`);
      existingSlots.add(`${a.date}|${s}|n:${nameKey(a.name || (a.client_id ? clientNameById.get(a.client_id) : ''))}`);
    }
    const seen = new Set<string>();

    read.forEach((r, idx) => {
      const rowNo = idx + 2;
      if (!r.dateRaw && !r.timeRaw) return; // not an appointment row at all (a client-only line)
      appts.found++;
      if (r.status && CANCELLED_STATUS.test(r.status)) { appts.cancelled++; return; }
      const date = parseFileDate(r.dateRaw, opts.dateOrder);
      if (!date) { appts.noDate++; return; }
      const timeSource = r.timeRaw || splitDateTime(r.dateRaw).t;
      const start = parseFileTime(timeSource);
      // No time, no appointment: parking it at 09:00 could put it on top of a real booking.
      if (start === null) { appts.noTime++; return; }
      if (date < opts.today || (date === opts.today && start < opts.nowMinute)) { appts.past++; return; }
      if (!r.name) { appts.noName++; return; }
      if (isServiceName(r.name)) { appts.noName++; return; }

      const svc = r.service ? serviceFor(r.service) : undefined;
      const end = r.endRaw ? parseFileTime(r.endRaw) : null;
      let duration = r.duration !== null && r.duration > 0 ? r.duration
        : end !== null && end > start ? end - start
          : svc && Number(svc.duration) > 0 ? Number(svc.duration) : 60;
      duration = Math.min(Math.max(5, Math.round(duration)), 600);
      const price = r.price !== null && r.price >= 0 ? r.price : svc && Number(svc.price) >= 0 ? Number(svc.price) : 0;

      const ck = clientKeyOf(r.phone.key, r.name);
      const slot = `${date}|${start}|${ck}`;
      if (existingSlots.has(slot) || existingSlots.has(`${date}|${start}|n:${nameKey(r.name)}`)) { appts.alreadyInCalendar++; return; }
      if (seen.has(slot)) { appts.dupInFile++; return; }

      const day = busy.get(date) || [];
      const clash = day.find((b) => start < b.e && b.s < start + duration);
      if (clash) {
        appts.conflictCount++;
        if (appts.conflicts.length < MAX_CONFLICTS_LISTED) {
          appts.conflicts.push({ row: rowNo, date, time: fmtTime(start), name: r.name, service: r.service, with: clash.who });
        }
        return;
      }
      seen.add(slot);
      day.push({ s: start, e: start + duration, who: r.name });
      busy.set(date, day);

      // Every appointment belongs to a real client card: one that exists, one this file creates, or one made for it now.
      if (!clientIdByKey.has(ck) && !plannedKeys.has(ck)) {
        const d = draftFor(r);
        plannedKeys.set(ck, d);
        clients.toCreate.push(d);
        clients.forApptsOnly++;
      }
      const svcColor = svc && typeof svc.color === 'string' && svc.color ? svc.color : DEFAULT_SERVICE_COLOR;
      appts.toCreate.push({
        row: rowNo, date, startMinute: start, duration, price, name: r.name, service: r.service,
        note: r.notes.join('\n').slice(0, 1000), clientKey: ck, color: svcColor,
      });
    });
  }

  return { clients, services, appts };
}

/**
 * Plan key -> the id of the client card already on file. The route uses the SAME index to link imported appointments, so the
 * plan's "already exists" and the write's client_id can never disagree.
 */
export function indexExistingClients(clients: ExistingClient[]): Map<string, string> {
  const byKey = new Map<string, string>();
  for (const c of clients) {
    if (!c || !c.id) continue;
    const k = clientKeyOf(phoneOf(c.phone).key, String(c.name ?? ''));
    if (!byKey.has(k)) byKey.set(k, c.id);
  }
  // A phone-less row in the file matches an existing client of the same name, even one who has a phone on file.
  for (const c of clients) {
    if (!c || !c.id) continue;
    const nk = nameKey(c.name);
    if (nk && !byKey.has(`n:${nk}`)) byKey.set(`n:${nk}`, c.id);
  }
  return byKey;
}

/** Israel's date and the minute now. The server runs in UTC; "is this appointment in the past" is asked in her time. */
export function israelClock(now: Date = new Date()): { today: string; nowMinute: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '00';
  return { today: `${get('year')}-${get('month')}-${get('day')}`, nowMinute: Number(get('hour')) * 60 + Number(get('minute')) };
}

// ── Words ────────────────────────────────────────────────────────────────────

/** "נמצאו 312 לקוחות, 18 כפולות ידלגו" and its siblings: the one line she reads before she taps import. */
export function planHeadlineHe(plan: ImportPlan, opts: Pick<PlanOptions, 'clients' | 'services' | 'appts'>): string[] {
  const out: string[] = [];
  const c = plan.clients;
  if (opts.clients) {
    const skip = c.existing + c.dupInFile;
    out.push(`נמצאו ${c.found} לקוחות${skip ? `, ${skip} כפולות ידלגו` : ''}. ${c.toCreate.length - c.forApptsOnly} חדשות ייווספו.`);
  }
  if (opts.services && plan.services.found) {
    const s = plan.services;
    out.push(`נמצאו ${s.found} טיפולים${s.existing ? `, ${s.existing} כבר ברשימה שלך` : ''}. ${s.toCreate.length} חדשים ייווספו.`);
  }
  if (opts.appts) {
    const a = plan.appts;
    out.push(`נמצאו ${a.found} תורים. ${a.toCreate.length} תורים עתידיים ייכנסו ליומן.`);
    if (c.forApptsOnly) out.push(`${c.forApptsOnly} לקוחות מהתורים עוד לא קיימות אצלך, וייפתח להן כרטיס.`);
  }
  return out;
}
