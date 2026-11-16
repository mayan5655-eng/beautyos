// lib/teamRepo.ts
//
// SERVER ONLY (service-role client, every query filtered by the tenant here, never left to RLS). Reads and writes
// public.staff_members for lib/team.ts.
//
// Before add_team_calendar_2026-11-12.sql runs the table does not exist: readTeam answers { available: false, staff: [] }, which
// every caller reads as "one practitioner", the way the product worked before. Never an error a client or the owner sees.

import { normalizeStaff, activeStaff, DEFAULT_STAFF_COLOR, MAX_ACTIVE_STAFF, STAFF_NAME_MAX, type Staff, type StaffInput } from './team.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any };

export const STAFF_TABLE = 'staff_members';
export const STAFF_COLUMNS = 'id, tenant_id, name, color, active, is_owner, hours, services, sort_order';

/** The table (or one of its columns) is not there yet: the migration has not run. */
export function staffTableMissing(e: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!e) return false;
  const code = String(e.code || '');
  if (code === '42P01' || code === 'PGRST205' || code === '42703' || code === 'PGRST204') return true;
  return /staff_members|staff_id|does not exist|schema cache/i.test(String(e.message || ''));
}

export type TeamRead = { available: boolean; staff: Staff[] };

/** Her staff, every row (active or not). A missing table = not available. Any other failure throws: the caller decides. */
export async function readTeam(db: Db, tenantId: string): Promise<TeamRead> {
  const r = await db.from(STAFF_TABLE).select(STAFF_COLUMNS).eq('tenant_id', tenantId).order('sort_order', { ascending: true }).limit(100);
  if (r.error) {
    if (staffTableMissing(r.error)) return { available: false, staff: [] };
    throw new Error(`staff read failed: ${r.error.message}`);
  }
  // Belt and braces: a row of another business is never used, whatever the query returned.
  const rows = ((r.data || []) as Array<{ tenant_id?: unknown }>).filter((x) => String(x?.tenant_id) === String(tenantId));
  return { available: true, staff: rows.map(normalizeStaff).filter((s): s is Staff => !!s) };
}

/**
 * The team for a PUBLIC caller (/api/availability, /api/book-appointment): never throws. Anything that goes wrong reads as "one
 * practitioner", which is what the page and the route did before the team existed, so a broken read can never stop a booking.
 */
export async function readTeamSafe(db: Db, tenantId: string): Promise<TeamRead> {
  try { return await readTeam(db, tenantId); } catch (e) {
    console.warn('[team] staff unreadable, booking as one practitioner:', (e as Error)?.message);
    return { available: false, staff: [] };
  }
}

const hexOr = (v: unknown, d: string) => (typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v) ? v : d);

/**
 * The owner is staff member #1. Her row is made the first time the team screen opens, named as her settings name her, so her
 * existing appointments (staff_id NULL) are shown as hers from the start. Two tabs opening at once: the unique index on the
 * owner row refuses the second insert, and the row is read again.
 */
export async function ensureOwner(db: Db, tenantId: string, team: TeamRead, settings: { therapist_name?: unknown; business_name?: unknown; primary_color?: unknown } | null): Promise<TeamRead> {
  if (!team.available || team.staff.some((s) => s.is_owner)) return team;
  const name = String(settings?.therapist_name || '').trim().slice(0, STAFF_NAME_MAX) || 'אני';
  const ins = await db.from(STAFF_TABLE).insert({ tenant_id: tenantId, name, color: hexOr(settings?.primary_color, DEFAULT_STAFF_COLOR), is_owner: true, active: true, sort_order: 0 });
  if (ins.error && String(ins.error.code) !== '23505') throw new Error(`owner row insert failed: ${ins.error.message}`);
  return readTeam(db, tenantId);
}

export type WriteResult = { ok: true; staff: Staff[] } | { ok: false; error: string; status: number };

/** Add a person (no id) or change one of hers. The tenant is the session's, never the body's. */
export async function saveStaff(db: Db, tenantId: string, staffId: string | null, input: StaffInput): Promise<WriteResult> {
  const team = await readTeam(db, tenantId);
  if (!team.available) return { ok: false, error: 'צריך להריץ קודם את עדכון מסד הנתונים של יומן הצוות', status: 409 };
  if (staffId) {
    const mine = team.staff.find((s) => s.id === staffId);
    if (!mine) return { ok: false, error: 'לא מצאנו את אשת הצוות הזו', status: 404 };
    const u = await db.from(STAFF_TABLE).update({ name: input.name, color: input.color, hours: input.hours, services: input.services })
      .eq('tenant_id', tenantId).eq('id', staffId);
    if (u.error) throw new Error(`staff update failed: ${u.error.message}`);
  } else {
    if (activeStaff(team.staff).length >= MAX_ACTIVE_STAFF) return { ok: false, error: `אפשר עד ${MAX_ACTIVE_STAFF} אנשי צוות פעילים`, status: 409 };
    const next = team.staff.reduce((m, s) => Math.max(m, s.sort_order), 0) + 1;
    const i = await db.from(STAFF_TABLE).insert({ tenant_id: tenantId, name: input.name, color: input.color, hours: input.hours, services: input.services, active: true, is_owner: false, sort_order: next });
    if (i.error) throw new Error(`staff insert failed: ${i.error.message}`);
  }
  return { ok: true, staff: (await readTeam(db, tenantId)).staff };
}

/** Deactivate (never delete) or bring back. The owner is always active. */
export async function setStaffActive(db: Db, tenantId: string, staffId: string, active: boolean): Promise<WriteResult> {
  const team = await readTeam(db, tenantId);
  if (!team.available) return { ok: false, error: 'צריך להריץ קודם את עדכון מסד הנתונים של יומן הצוות', status: 409 };
  const mine = team.staff.find((s) => s.id === staffId);
  if (!mine) return { ok: false, error: 'לא מצאנו את אשת הצוות הזו', status: 404 };
  if (mine.is_owner) return { ok: false, error: 'את תמיד פעילה ביומן', status: 400 };
  if (active && !mine.active && activeStaff(team.staff).length >= MAX_ACTIVE_STAFF) return { ok: false, error: `אפשר עד ${MAX_ACTIVE_STAFF} אנשי צוות פעילים`, status: 409 };
  const u = await db.from(STAFF_TABLE).update({ active }).eq('tenant_id', tenantId).eq('id', staffId);
  if (u.error) throw new Error(`staff active update failed: ${u.error.message}`);
  return { ok: true, staff: (await readTeam(db, tenantId)).staff };
}
