// lib/protocolBook/course.ts — a client's course of one protocol ("סדרת אקנה, 3 מתוך 6"). PURE.
// Stored in public.client_protocol_courses (supabase/migrations/add_client_protocol_courses_2026-11-27.sql).

export type CourseSession = { date: string; appointment_id?: string; note?: string };
export type CourseStatus = 'active' | 'done' | 'stopped';
export type Course = {
  id: string;
  client_id: string;
  protocol_key: string;
  sessions_planned: number;
  sessions: CourseSession[];
  status: CourseStatus;
  created_at?: string;
};

export const MAX_SESSIONS_STORED = 40;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** 1..30, whole; anything else falls back to the protocol's usual series of 6. */
export function plannedOf(v: unknown): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 30 ? n : 6;
}

export function cleanSessions(v: unknown): CourseSession[] {
  if (!Array.isArray(v)) return [];
  const out: CourseSession[] = [];
  for (const s of v) {
    if (!s || typeof s !== 'object') continue;
    const r = s as Record<string, unknown>;
    if (typeof r.date !== 'string' || !DATE.test(r.date)) continue;
    const item: CourseSession = { date: r.date };
    if (typeof r.appointment_id === 'string' && r.appointment_id) item.appointment_id = r.appointment_id.slice(0, 64);
    if (typeof r.note === 'string' && r.note.trim()) item.note = r.note.trim().slice(0, 300);
    out.push(item);
  }
  return out.slice(-MAX_SESSIONS_STORED);
}

/**
 * Record a session. The same appointment counts once (tapping twice, or on two devices, does not double it).
 * The course is done when the planned number is reached; it stays editable.
 */
export function addSession(c: Pick<Course, 'sessions' | 'sessions_planned' | 'status'>, s: CourseSession): { sessions: CourseSession[]; status: CourseStatus } {
  const sessions = cleanSessions(c.sessions);
  if (s.appointment_id && sessions.some((x) => x.appointment_id === s.appointment_id)) return { sessions, status: c.status };
  const next = cleanSessions([...sessions, s]);
  return { sessions: next, status: next.length >= c.sessions_planned ? 'done' : c.status === 'stopped' ? 'stopped' : 'active' };
}

export function progressOf(c: Pick<Course, 'sessions' | 'sessions_planned'>): { done: number; planned: number; percent: number } {
  const done = cleanSessions(c.sessions).length;
  const planned = plannedOf(c.sessions_planned);
  return { done, planned, percent: Math.min(100, Math.round((done / planned) * 100)) };
}

/** Postgres/PostgREST "no such table": the migration has not run yet. */
export function isMissingTable(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  return /relation .* does not exist|could not find the table/i.test(String(error.message || ''));
}
