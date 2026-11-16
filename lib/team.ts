// lib/team.ts
//
// The team calendar ("יומן צוות"), behind NEXT_PUBLIC_TEAM_CALENDAR (lib/teamFlag.ts). Pure: no database, no clock, safe in the
// browser (the owner's calendar and the public booking page import it) and on the server (/api/availability, /api/book-appointment).
//
// ── The model ──────────────────────────────────────────────────────────────
// A business has staff members (public.staff_members, add_team_calendar_2026-11-12.sql): name, colour, active, optional hours per
// weekday (missing = the business hours) and the treatments each one does (null = all). The owner is a row too (is_owner), made on
// first use. Nobody is ever deleted: someone who left is active = false, and her past appointments keep her name.
//
// appointments.staff_id is optional and NULL MEANS THE OWNER. Every appointment written before this existed is hers, unchanged, and
// the owner's own appointments are always written as NULL (staffIdForWrite; the database trigger does the same), so "the owner" has
// exactly one value in the per-staff double-booking guarantees (uniq_appt_slot_active, appointments_no_overlap).
//
// ── When it is on ──────────────────────────────────────────────────────────
// Only with at least two ACTIVE staff members (teamOn). With one (or with no table yet, or the flag off) nothing changes anywhere:
// the calendar, the public page and the booking route take exactly the single-practitioner path they always took.
//
// ── What a staff member does NOT have in this version ─────────────────────
// No login, no messages: reminders and confirmations go to clients exactly as before, and nothing is ever sent to a staff member.
// Her lunch break (settings.branding.lunch_break) is the owner's own break: it blocks the owner only. A personal event in the
// calendar is the owner's too.

import { overlaps, clashesWith, startMinute, endMinute, type HasStart } from './apptTime.ts';
import { dayHoursFrom, type DayHours, type HoursSettings } from './businessHours.ts';
import { publicBusyRanges, type BusyRange } from './busyIntervals.ts';
import { bufferedRange, clashesWithBuffer } from './serviceBuffer.ts';
import { overlapsLunch } from './lunchBreak.js';

export type HoursMap = Record<string, { open: number; close: number } | null>;

export type Staff = {
  id: string;
  name: string;
  color: string;
  active: boolean;
  is_owner: boolean;
  /** Per weekday (0 = Sunday), like settings.business_hours. A missing day (or null map) = the business hours that day. */
  hours: HoursMap | null;
  /** The treatments she does, by name. null = all of them. */
  services: string[] | null;
  sort_order: number;
};

export type TeamAppt = HasStart & {
  id?: unknown;
  date?: unknown;
  staff_id?: unknown;
  confirmation_status?: unknown;
  kind?: unknown;
  service?: unknown;
  buffer_minutes?: unknown;
};

/** Soft colours that read on her cream calendar; the owner's default is her own accent. */
export const STAFF_COLORS = ['#E9A9A1', '#7FA88E', '#8FA6C9', '#D9B26F', '#B48EAD', '#6FB7B7'] as const;
export const DEFAULT_STAFF_COLOR = STAFF_COLORS[0];
/** The owner plus up to five people: the businesses this is for are the owner and one to three employees or room renters. */
export const MAX_ACTIVE_STAFF = 6;
export const STAFF_NAME_MAX = 40;
/** What the public page sends for "לא משנה לי". */
export const ANY_STAFF = 'any';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isStaffId = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

const cleanText = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** Her hours for one person: days 0..6, each closed (null) or whole hours open < close within 0..24. Bad days are left out. */
export function cleanHours(v: unknown): HoursMap | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out: HoursMap = {};
  for (let d = 0; d < 7; d++) {
    if (!Object.prototype.hasOwnProperty.call(v, String(d))) continue;
    const day = (v as Record<string, unknown>)[String(d)];
    if (day === null) { out[String(d)] = null; continue; }
    if (!day || typeof day !== 'object') continue;
    const open = Number((day as { open?: unknown }).open), close = Number((day as { close?: unknown }).close);
    if (!Number.isInteger(open) || !Number.isInteger(close) || open < 0 || close > 24 || close <= open) continue;
    out[String(d)] = { open, close };
  }
  return Object.keys(out).length ? out : null;
}

/** The treatments she does. An empty list means "all": nobody is added to do nothing. */
export function cleanServices(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const x of v) {
    const s = cleanText(x, 80);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= 200) break;
  }
  return out.length ? out : null;
}

/** A row from the database (or anything shaped like one) as a Staff, defensively. null when it has no usable id or name. */
export function normalizeStaff(row: unknown): Staff | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const id = typeof r.id === 'string' ? r.id : '';
  const name = cleanText(r.name, STAFF_NAME_MAX);
  if (!id || !name) return null;
  return {
    id,
    name,
    color: typeof r.color === 'string' && HEX_RE.test(r.color) ? r.color : DEFAULT_STAFF_COLOR,
    active: r.active !== false,
    is_owner: r.is_owner === true,
    hours: cleanHours(r.hours),
    services: cleanServices(r.services),
    sort_order: Number.isFinite(Number(r.sort_order)) ? Number(r.sort_order) : 0,
  };
}

export type StaffInput = { name: string; color: string; hours: HoursMap | null; services: string[] | null };

/** What the owner typed for one person, checked. Hebrew errors, said to her as they are. */
export function sanitizeStaffInput(v: unknown): { ok: true; value: StaffInput } | { ok: false; error: string } {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  const name = cleanText(o.name, STAFF_NAME_MAX + 1);
  if (!name) return { ok: false, error: 'חסר שם' };
  if (name.length > STAFF_NAME_MAX) return { ok: false, error: `השם ארוך מדי (עד ${STAFF_NAME_MAX} תווים)` };
  const color = typeof o.color === 'string' && HEX_RE.test(o.color) ? o.color : DEFAULT_STAFF_COLOR;
  return { ok: true, value: { name, color, hours: cleanHours(o.hours), services: cleanServices(o.services) } };
}

const byOrder = (a: Staff, b: Staff) =>
  Number(b.is_owner) - Number(a.is_owner) || a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'he') || a.id.localeCompare(b.id);

/** Active people, the owner first, then in her order. */
export function activeStaff(staff: Staff[] | null | undefined): Staff[] {
  return (staff || []).filter((s) => s && s.active).sort(byOrder);
}

/** Everyone, active first (owner first), then the ones who left. */
export function orderedStaff(staff: Staff[] | null | undefined): Staff[] {
  return [...(staff || [])].filter(Boolean).sort((a, b) => Number(b.active) - Number(a.active) || byOrder(a, b));
}

/** The team calendar is in effect for this business: two or more active people. One = nothing changes anywhere. */
export function teamOn(staff: Staff[] | null | undefined): boolean {
  return activeStaff(staff).length >= 2;
}

export const ownerOf = (staff: Staff[] | null | undefined): Staff | null => (staff || []).find((s) => s && s.is_owner) || null;

/** Does she do this treatment? No list = everything. */
export function performs(s: Staff, service: unknown): boolean {
  if (!s.services || s.services.length === 0) return true;
  return s.services.includes(cleanText(service, 80));
}

/** Who can be booked for this treatment: active and doing it. */
export function eligibleFor(staff: Staff[] | null | undefined, service: unknown): Staff[] {
  return activeStaff(staff).filter((s) => performs(s, service));
}

/** Her hours on one weekday: her own when she set that day, the business hours otherwise. */
export function staffDayHours(s: Pick<Staff, 'hours'> | null | undefined, settings: HoursSettings | null | undefined, weekday: number): DayHours {
  const h = s?.hours;
  if (h && Object.prototype.hasOwnProperty.call(h, String(weekday))) {
    const v = h[String(weekday)];
    return v ? { open: Number(v.open), close: Number(v.close) } : null;
  }
  return dayHoursFrom(settings, weekday);
}

/**
 * The hours the owner's appointment form checks against: the picked person's own hours (staffDayHours, the same resolution
 * /api/book-appointment uses through pickStaff) in team mode, the business hours otherwise. An unknown id (or none) is the owner.
 */
export function formDayHours(
  team: { on: boolean; staff: Staff[] } | null | undefined,
  staffId: string | null | undefined,
  settings: HoursSettings | null | undefined,
  weekday: number,
): DayHours {
  if (!team || !team.on) return dayHoursFrom(settings, weekday);
  const s = (staffId && team.staff.find((x) => x.id === staffId)) || ownerOf(team.staff);
  return s ? staffDayHours(s, settings, weekday) : dayHoursFrom(settings, weekday);
}

/** The whole week for one person (0..6). */
export function staffWeek(s: Pick<Staff, 'hours'> | null | undefined, settings: HoursSettings | null | undefined): Record<number, DayHours> {
  const out: Record<number, DayHours> = {};
  for (let d = 0; d < 7; d++) out[d] = staffDayHours(s, settings, d);
  return out;
}

/** What appointments.staff_id gets for this person: NULL for the owner (always), her id otherwise. */
export const staffIdForWrite = (s: Pick<Staff, 'id' | 'is_owner'> | null | undefined): string | null => (!s || s.is_owner ? null : s.id);

const apptStaffId = (a: { staff_id?: unknown }) => (a && a.staff_id != null && a.staff_id !== '' ? String(a.staff_id) : null);

/** Is this appointment hers? NULL is the owner's (and so is the owner's own id, should one ever be stored). */
export function belongsTo(a: { staff_id?: unknown }, s: Pick<Staff, 'id' | 'is_owner'>): boolean {
  const sid = apptStaffId(a);
  return s.is_owner ? sid === null || sid === s.id : sid === s.id;
}

/** The person an appointment is with: by its staff_id, NULL = the owner. null when nobody is known (no owner row yet). */
export function staffOfAppt(a: { staff_id?: unknown }, staff: Staff[] | null | undefined): Staff | null {
  const sid = apptStaffId(a);
  const list = staff || [];
  if (sid === null) return ownerOf(list);
  return list.find((s) => s.id === sid) || ownerOf(list);
}

/** The same person for a double-booking check: both NULL/owner, or the same id. */
export function sameStaff(a: { staff_id?: unknown }, staffId: string | null, staff: Staff[] | null | undefined): boolean {
  const owner = ownerOf(staff);
  const norm = (v: string | null) => (v === null || (owner && v === owner.id) ? null : v);
  return norm(apptStaffId(a)) === norm(staffId);
}

const live = (a: TeamAppt) => a && a.confirmation_status !== 'cancelled';
const weekdayOf = (date: string) => new Date(`${date}T12:00:00`).getDay();

export type SlotState = 'ok' | 'closed' | 'outside' | 'taken';

export type SlotQuery = {
  settings: HoursSettings | null | undefined;
  date: string;
  start: number;
  duration: number;
  /** The buffer after THIS treatment (lib/serviceBuffer.ts). */
  buffer: number;
  /** The day's appointments of the business (any staff); other days are ignored. */
  appointments: TeamAppt[];
  /** Each existing appointment's buffer (lib/serviceBuffer.ts bufferLookup). */
  bufferOf: (a: TeamAppt) => number;
  /** Her break (lib/lunchBreak.js resolveLunch): the owner's only. */
  lunch?: { startMinute: number; minutes: number } | null;
};

/** Can this person take this booking? The same three rules the booking route enforces for one practitioner, per person. */
export function staffSlotState(s: Staff, q: SlotQuery): SlotState {
  const dh = staffDayHours(s, q.settings, weekdayOf(q.date));
  if (!dh) return 'closed';
  if (q.start < dh.open * 60 || q.start + q.duration > dh.close * 60) return 'outside';
  if (s.is_owner && q.lunch && overlapsLunch(q.lunch, q.start, q.duration + q.buffer)) return 'taken';
  const mine = (q.appointments || []).filter((a) => live(a) && (a.date == null || String(a.date) === q.date) && belongsTo(a, s));
  const buffered = mine.flatMap((a) => {
    const st = startMinute(a), e = endMinute(a);
    return st === null || e === null ? [] : [bufferedRange(st, e, q.bufferOf(a))];
  });
  return clashesWith(q.start, q.duration, mine) || clashesWithBuffer(q.start, q.duration, q.buffer, buffered) ? 'taken' : 'ok';
}

/** How busy she is that day: her live client appointments (personal blocks are not clients). */
export function dayLoad(s: Staff, appointments: TeamAppt[], date: string): number {
  return (appointments || []).filter((a) => live(a) && a.kind !== 'personal' && (a.date == null || String(a.date) === date) && belongsTo(a, s)).length;
}

export type PickResult =
  | { ok: true; staff: Staff; auto: boolean }
  | { ok: false; reason: 'unknown_staff' | 'closed' | 'outside' | 'taken' };

/**
 * Who a public booking goes to.
 *   - A named person: she must be among `eligible` (this business, active, doing this treatment) and free. Anything else is refused,
 *     including a real id from another business or someone who left: `eligible` is built from THIS business's active rows only.
 *   - "לא משנה לי" (ANY_STAFF, or nothing): whoever is free, the one with the fewest clients that day first, then the owner first
 *     and her order (activeStaff), so the same request always gets the same answer.
 * Refusals say the most useful thing: closed when nobody works that day, taken when somebody works then but is busy.
 */
export function pickStaff(eligible: Staff[], requested: unknown, q: SlotQuery): PickResult {
  const list = activeStaff(eligible);
  if (requested != null && requested !== '' && requested !== ANY_STAFF) {
    const s = isStaffId(requested) ? list.find((x) => x.id === requested) : undefined;
    if (!s) return { ok: false, reason: 'unknown_staff' };
    const st = staffSlotState(s, q);
    return st === 'ok' ? { ok: true, staff: s, auto: false } : { ok: false, reason: st };
  }
  const states = list.map((s) => ({ s, st: staffSlotState(s, q) }));
  const free = states.filter((x) => x.st === 'ok');
  if (free.length) {
    let best = free[0], bestLoad = dayLoad(free[0].s, q.appointments, q.date);
    for (const x of free.slice(1)) {
      const l = dayLoad(x.s, q.appointments, q.date);
      if (l < bestLoad) { best = x; bestLoad = l; }
    }
    return { ok: true, staff: best.s, auto: true };
  }
  if (states.length === 0 || states.every((x) => x.st === 'closed')) return { ok: false, reason: 'closed' };
  return { ok: false, reason: states.some((x) => x.st === 'taken') ? 'taken' : 'outside' };
}

// ── The public booking page ────────────────────────────────────────────────

/** One person as the public page sees her: a first name she chose to show, a colour, what she does and when she works. */
export type PublicStaff = { id: string; name: string; color: string; services: string[] | null; hours: Record<number, DayHours> };

/** The active team for /api/availability. Nothing else about them leaves: no order, no owner flag, nobody who left. */
export function publicTeam(staff: Staff[] | null | undefined, settings: HoursSettings | null | undefined): PublicStaff[] {
  return activeStaff(staff).map((s) => ({ id: s.id, name: s.name, color: s.color, services: s.services, hours: staffWeek(s, settings) }));
}

/** Per person, the merged busy intervals (lib/busyIntervals.ts): her own appointments with their buffers; the owner's break is hers. */
export function staffBusyRanges<A extends TeamAppt>(
  appointments: A[] | null | undefined,
  staff: Staff[] | null | undefined,
  bufferOf: (a: A) => number,
  ownerPlain: HasStart[] = [],
): Record<string, BusyRange[]> {
  const out: Record<string, BusyRange[]> = {};
  for (const s of activeStaff(staff)) {
    const mine = (appointments || []).filter((a) => belongsTo(a, s));
    out[s.id] = publicBusyRanges(mine, bufferOf, s.is_owner ? (ownerPlain as Array<HasStart & { date?: unknown }>) : []);
  }
  return out;
}

/** The people the client can choose for this treatment on the public page. Fewer than two = the page asks nothing. */
export function publicEligible(team: PublicStaff[] | null | undefined, service: unknown): PublicStaff[] {
  const name = cleanText(service, 80);
  return (team || []).filter((s) => !s.services || s.services.length === 0 || s.services.includes(name));
}

/** Is [start, start + duration + buffer) free for her on that day, inside her hours? (The page; the route checks it again.) */
export function publicSlotFree(s: PublicStaff, busy: BusyRange[] | null | undefined, date: string, start: number, duration: number, buffer: number): boolean {
  const dh = s.hours ? s.hours[weekdayOf(date)] : null;
  if (!dh) return false;
  if (start < dh.open * 60 || start + duration > dh.close * 60) return false;
  return !(busy || []).some((r) => r.date === date && overlaps(start, start + duration + buffer, Number(r.start), Number(r.end)));
}

/** The widest hours anyone in `team` works that weekday, so the page knows which starts to try. null = nobody works then. */
export function teamDayWindow(team: PublicStaff[], weekday: number): DayHours {
  let open = Infinity, close = -Infinity;
  for (const s of team) {
    const dh = s.hours ? s.hours[weekday] : null;
    if (!dh) continue;
    open = Math.min(open, dh.open); close = Math.max(close, dh.close);
  }
  return Number.isFinite(open) && Number.isFinite(close) && close > open ? { open, close } : null;
}
