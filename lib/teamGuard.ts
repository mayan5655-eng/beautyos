// lib/teamGuard.ts
//
// SERVER ONLY. The team calendar's checks for the paths that move or re-book a slot WITHOUT the public booking page:
//   - the waiting-list and gap-fill offers (lib/waitlistOffers.js, app/api/slots/offer) carry the cancelled appointment's staff
//     member onto the offer (slot_offers.staff_id), and the claim (app/api/claim) books it with that same person, after checking
//     again that she is of this business, active, does the treatment, works then and is free. Never quietly the owner instead.
//   - the client's own move (app/api/confirm/reschedule) is judged by the hours and the calendar of the person the appointment is
//     with, not the business hours (Vercel Security Review, PR #67).
//
// One rule for every path, the same as /api/book-appointment: lib/team.ts staffSlotState. With the flag off, or one active person,
// an owner appointment takes exactly the old path. A staff member's appointment never falls back to the owner's rules: if her
// team cannot be read or she is not valid any more, the claim or the move is refused with a neutral message.

import { teamCalendarEnabled } from './teamFlag.ts';
import { readTeam, type TeamRead } from './teamRepo.ts';
import { teamOn, ownerOf, performs, staffSlotState, staffWeek, belongsTo, isStaffId, type Staff, type TeamAppt } from './team.ts';
import { resolveLunch } from './lunchBreak.js';
import { bufferLookup, businessBufferDefault } from './serviceBuffer.ts';
import { isMissingColumnError } from './pgError.ts';
import type { HoursSettings } from './businessHours.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any };

/** What a client is told when the person the slot was with is no longer available. Neutral: nothing about who or why. */
export const SLOT_GONE_HE = 'המשבצת כבר לא זמינה';

const sid = (v: unknown): string | null => (v != null && v !== '' ? String(v) : null);

/**
 * The staff member of an appointment, by its id and tenant. No column yet (the migration has not run) = the owner, which is true:
 * without the column no appointment can be anyone else's. Any other failure is 'unreadable', and the caller stops.
 */
export async function staffIdOfAppointment(db: Db, tenantId: string, appt: { id?: unknown; staff_id?: unknown } | null | undefined): Promise<{ ok: true; staffId: string | null } | { ok: false }> {
  if (!appt) return { ok: true, staffId: null };
  if (Object.prototype.hasOwnProperty.call(appt, 'staff_id')) return { ok: true, staffId: sid(appt.staff_id) };
  if (appt.id == null || appt.id === '') return { ok: true, staffId: null };
  try {
    const r = await db.from('appointments').select('staff_id').eq('tenant_id', tenantId).eq('id', appt.id).maybeSingle();
    if (r.error) return isMissingColumnError(r.error) ? { ok: true, staffId: null } : { ok: false };
    return { ok: true, staffId: sid(r.data?.staff_id) };
  } catch { return { ok: false }; }
}

/** Her hours as a settings object dayHoursFrom understands, so lib/reschedule.ts can use one person's week unchanged. */
export function staffHoursSettings(s: Staff, settings: HoursSettings | null | undefined): HoursSettings {
  const week = staffWeek(s, settings);
  const business_hours: Record<string, { open: number; close: number } | null> = {};
  for (let d = 0; d < 7; d++) business_hours[String(d)] = week[d];
  return { business_hours };
}

export type Scope =
  | { kind: 'single' }                          // the old path, unchanged
  | { kind: 'staff'; staff: Staff }              // judged by this person's hours and her own calendar
  | { kind: 'refuse' };                          // a staff slot that cannot be checked or is no longer valid

/**
 * Which rules a slot with `staffId` (NULL = the owner) is judged by. Pure, given the team.
 *   - a staff member's slot: flag on, team readable, she is active (and does `service` when given); else refuse;
 *   - the owner's slot: her own hours and calendar when the team is on, otherwise the old single-practitioner path.
 */
export function scopeFor(i: { flag: boolean; team: TeamRead | null; staffId: string | null; service?: string | null }): Scope {
  if (i.staffId) {
    if (!i.flag || !i.team || !i.team.available || !isStaffId(i.staffId)) return { kind: 'refuse' };
    const s = i.team.staff.find((x) => x.id === i.staffId);
    if (!s || !s.active) return { kind: 'refuse' };
    if (s.is_owner) return teamOn(i.team.staff) ? { kind: 'staff', staff: s } : { kind: 'single' };
    if (i.service && !performs(s, i.service)) return { kind: 'refuse' };
    return { kind: 'staff', staff: s };
  }
  if (!i.flag || !i.team || !i.team.available || !teamOn(i.team.staff)) return { kind: 'single' };
  const owner = ownerOf(i.team.staff);
  return owner ? { kind: 'staff', staff: owner } : { kind: 'single' };
}

/** scopeFor with the team read here. A staff slot whose team cannot be read is refused; an owner slot falls back to single. */
export async function resolveScope(db: Db, tenantId: string, staffId: string | null, service?: string | null): Promise<Scope> {
  const flag = teamCalendarEnabled();
  if (!flag && !staffId) return { kind: 'single' };
  let team: TeamRead | null = null;
  try { team = await readTeam(db, tenantId); } catch { team = null; }
  return scopeFor({ flag, team, staffId, service });
}

/** Only her own appointments count against her: the per-staff busy set. */
export const mineOnly = <A extends { staff_id?: unknown }>(rows: A[] | null | undefined, s: Staff): A[] => (rows || []).filter((a) => belongsTo(a, s));

/**
 * At claim time: can `staff` take this slot right now? Her hours, her break (the owner's only), her buffers, her own calendar.
 * Reads the tenant's settings, menu and that day's appointments, all filtered by the tenant. Anything unreadable is a refusal.
 */
export async function claimSlotOk(db: Db, tenantId: string, staff: Staff, slot: { date: string; start: number; duration: number; service: string | null }): Promise<boolean> {
  try {
    const [st, menu, day] = await Promise.all([
      db.from('settings').select('business_hours, working_hours_start, working_hours_end, working_days, branding').eq('tenant_id', tenantId).maybeSingle(),
      db.from('service_prices').select('name, buffer_minutes, active').eq('tenant_id', tenantId),
      db.from('appointments').select('start_minute, hour, duration, confirmation_status, service, kind, buffer_minutes, staff_id').eq('tenant_id', tenantId).eq('date', slot.date),
    ]);
    if (st.error || day.error) return false;
    const settings = st.data || null;
    const bufferOf = bufferLookup(menu.error ? [] : menu.data || [], businessBufferDefault(settings?.branding));
    return staffSlotState(staff, {
      settings, date: slot.date, start: slot.start, duration: slot.duration, buffer: bufferOf({ service: slot.service || '' }),
      appointments: (day.data || []) as TeamAppt[], bufferOf: bufferOf as (a: TeamAppt) => number, lunch: resolveLunch(settings?.branding),
    }) === 'ok';
  } catch { return false; }
}
