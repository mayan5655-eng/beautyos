// lib/apptTime.ts
//
// One place that knows how an appointment's start time is represented.
//
// The schema is mid-migration: `start_minute` (minutes from midnight) is the
// new truth, `hour` (whole hours) is the old one and is still written so that a
// deployment running the previous build keeps working. Every read goes through
// startMinute() so that neither the transition nor the eventual removal of
// `hour` requires touching call sites again.
//
// Deliberately dependency-free and pure: the dangerous logic in this codebase -
// overlap detection, the public booking guard, the gap-fill race check - is all
// arithmetic on these values, and arithmetic is the one thing that can be
// tested without a database or a browser.

export type HasStart = {
  start_minute?: number | null;
  hour?: number | null;
  duration?: number | string | null;
};

export const MINUTES_IN_DAY = 1440;

/**
 * Start of an appointment, in minutes from midnight.
 *
 * Falls back to `hour * 60` when start_minute is absent, which covers three
 * real cases: rows written before the migration, rows written by an older
 * deployment during a rollout, and code running before the column exists.
 * Returns null only when neither is usable, so callers can skip a row rather
 * than silently treating it as midnight - a 0 default would make a broken row
 * look like a 00:00 booking and collide with nothing.
 */
export function startMinute(a: HasStart | null | undefined): number | null {
  if (!a) return null;
  const sm = a.start_minute;
  if (sm !== null && sm !== undefined && Number.isFinite(Number(sm))) return Number(sm);
  const h = a.hour;
  if (h !== null && h !== undefined && Number.isFinite(Number(h))) return Number(h) * 60;
  return null;
}

/** End of an appointment, in minutes from midnight. Missing duration = 0. */
export function endMinute(a: HasStart | null | undefined): number | null {
  const s = startMinute(a);
  if (s === null) return null;
  const d = Number(a?.duration);
  return s + (Number.isFinite(d) ? d : 0);
}

/** "14:30". The single formatter - no call site should build this by hand. */
export function fmtTime(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(Number(minutes))) return '';
  const m = ((Number(minutes) % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Convenience: format an appointment's start directly. */
export function fmtApptTime(a: HasStart | null | undefined): string {
  return fmtTime(startMinute(a));
}

/** Both representations, for writes during the transition. */
export function startFields(minutes: number): { start_minute: number; hour: number } {
  const m = Math.max(0, Math.min(MINUTES_IN_DAY - 1, Math.round(Number(minutes) || 0)));
  return { start_minute: m, hour: Math.floor(m / 60) };
}

/** "14:30" | "14" | 870 -> 870. Returns null on anything unparseable. */
export function toMinutes(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const s = String(value).trim();
  const hm = s.match(/^(\d{1,2}):(\d{2})$/);
  if (hm) {
    const h = Number(hm[1]), m = Number(hm[2]);
    if (h > 23 || m > 59) return null;
    return h * 60 + m;
  }
  if (/^\d{1,2}$/.test(s)) {
    const h = Number(s);
    return h <= 23 ? h * 60 : null;
  }
  return null;
}

/**
 * Do two [start, end) ranges overlap?
 *
 * Half-open on purpose: an appointment ending at 15:00 and one starting at
 * 15:00 do NOT overlap. Getting this wrong in the other direction would make
 * every back-to-back booking look like a conflict.
 */
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Does `a` clash with any of `others`? Rows with no usable start are skipped. */
export function clashesWith(
  startMin: number,
  durationMin: number,
  others: HasStart[],
  skipId?: (o: HasStart & { id?: unknown }) => boolean,
): boolean {
  const end = startMin + (Number(durationMin) || 0);
  for (const o of others) {
    if (skipId && skipId(o as HasStart & { id?: unknown })) continue;
    const s = startMinute(o);
    if (s === null) continue;
    const e = endMinute(o);
    if (e === null) continue;
    if (overlaps(startMin, end, s, e)) return true;
  }
  return false;
}

/**
 * Bookable start times for a day, as minutes from midnight.
 * `step` is the granularity she books at - 30 gives half-hour starts.
 * A slot is only offered if the whole treatment fits before closing.
 */
export function slotsBetween(openHour: number, closeHour: number, step = 30, durationMin = 0): number[] {
  const out: number[] = [];
  const open = Math.round(openHour * 60);
  const close = Math.round(closeHour * 60);
  const s = Math.max(1, Math.round(step));
  for (let m = open; m + (durationMin || 0) <= close; m += s) out.push(m);
  return out;
}
