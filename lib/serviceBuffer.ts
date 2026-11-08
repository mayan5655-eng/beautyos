// lib/serviceBuffer.ts
//
// "זמן הפסקה אחרי הטיפול": minutes she keeps free AFTER a treatment, to clean the bed, wash her hands, glance at the
// next card. Without it the public page sold back-to-back slots and lib/scheduleGaps.ts could only WARN about them.
//
// ── Where the number comes from ────────────────────────────────────────────
//   service_prices.buffer_minutes   per service, optional (add_service_buffer_2026-11-05.sql, run by hand).
//                                   null / missing = "use the business default".
//   branding.booking_rules.buffer_minutes
//                                   the business-wide default, optional, jsonb (no migration). Missing = 0.
// Until the migration runs the column is simply absent from every row, so every service reads as "use the default",
// and the default is 0 unless she set one: availability is exactly what it was before this file existed.
//
// ── What the buffer blocks ─────────────────────────────────────────────────
// An appointment occupies [start, end + its buffer). A NEW booking of service S at minute m occupies
// [m, m + duration(S) + buffer(S)). The two conflict when those half-open ranges overlap, so:
//   - after an existing appointment, the next start waits for its buffer;
//   - before an existing appointment, the new one must end, plus ITS buffer, by the time the next one starts.
// Personal blocks (kind 'personal') carry no buffer of their own, but a booking's buffer cannot run into them.
// Her protected lunch break counts as busy for the buffer too: a break she set once should not be eaten by cleanup.
//
// The one exception is CLOSING TIME. The treatment itself must end by closing; the buffer may run past it. Cleaning up
// after the last client of the day is normal, and counting it would delete the last slot of every working day.
//
// ── The database ───────────────────────────────────────────────────────────
// The app checks above read a snapshot, so on their own two concurrent bookings could both pass (Vercel security
// review, 2026-11-08). add_service_buffer_2026-11-05.sql therefore stores the buffer each appointment was checked with
// (appointments.buffer_minutes, lib/apptBuffer.ts) and rebuilds appointments_no_overlap over
// [start, start + duration + buffer): the same rule as clashesWithBuffer, atomically. Before that migration runs the
// database guards [start, start + duration) only and the app checks are the whole guard.
//
// A STORED buffer is a floor: bufferLookup answers the larger of the stored one and today's, so after she lowers a
// buffer the app never offers a time the database would still refuse over the old one.
//
// Pure: no database, no clock, plain numbers, so it is testable with node alone (test-service-buffer.ts).

export const MAX_BUFFER_MINUTES = 120;
/** The choices the Settings screens offer. Any whole number 0..MAX is still accepted from storage. */
export const BUFFER_OPTIONS = [0, 5, 10, 15, 20, 30, 45, 60] as const;

/** A stored value as minutes, or null when there is none (empty, null, garbage). Clamped to 0..MAX_BUFFER_MINUTES. */
export function cleanBufferMinutes(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(MAX_BUFFER_MINUTES, Math.max(0, Math.round(n)));
}

const asObj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** The business-wide default, from settings.branding.booking_rules.buffer_minutes. 0 when unset. */
export function businessBufferDefault(branding: unknown): number {
  return cleanBufferMinutes(asObj(asObj(branding).booking_rules).buffer_minutes) ?? 0;
}

type ServiceLike = { name?: unknown; buffer_minutes?: unknown } | null | undefined;

/** One service's buffer: its own value when it has one (0 included), otherwise the business default. */
export function serviceBufferMinutes(service: ServiceLike, businessDefault = 0): number {
  return cleanBufferMinutes(service?.buffer_minutes) ?? (cleanBufferMinutes(businessDefault) ?? 0);
}

type ApptLike = { service?: unknown; kind?: unknown; buffer_minutes?: unknown } | null | undefined;

/**
 * A lookup from an appointment to its buffer, built once per list of services.
 * Personal blocks: 0. A service that is no longer on her menu (renamed, deleted, the generic "תור"): the default.
 * A row that carries the buffer it was booked with (appointments.buffer_minutes) is busy for at least that long,
 * because that is what the database enforces for it.
 */
export function bufferLookup(services: ServiceLike[] | null | undefined, businessDefault = 0): (appt: ApptLike) => number {
  const byName = new Map<string, number>();
  // An active service wins over an archived one of the same name (first of each kind otherwise), so an old archived row
  // never hides the buffer of the service she offers today.
  const isArchived = (s: ServiceLike) => (s as { active?: unknown } | null | undefined)?.active === false;
  const ordered = [...(services || [])].sort((a, b) => Number(isArchived(a)) - Number(isArchived(b)));
  for (const s of ordered) {
    const name = typeof s?.name === 'string' ? s.name.trim() : '';
    if (name && !byName.has(name)) byName.set(name, serviceBufferMinutes(s, businessDefault));
  }
  const fallback = cleanBufferMinutes(businessDefault) ?? 0;
  return (appt) => {
    if (!appt || appt.kind === 'personal') return 0;
    const name = typeof appt.service === 'string' ? appt.service.trim() : '';
    const current = byName.has(name) ? (byName.get(name) as number) : fallback;
    const stored = cleanBufferMinutes(appt.buffer_minutes);
    return stored === null ? current : Math.max(stored, current);
  };
}

/** Busy range of an existing appointment, buffer included: [start, end + buffer). */
export function bufferedRange(start: number, end: number, buffer: number): [number, number] {
  return [start, end + (cleanBufferMinutes(buffer) ?? 0)];
}

/**
 * Would a new booking [start, start + duration) with its own trailing buffer clash with any busy range?
 * `busy` ranges already include THEIR buffers (bufferedRange). Closing time is not checked here (see the header).
 */
export function clashesWithBuffer(
  start: number,
  duration: number,
  ownBuffer: number,
  busy: Array<[number, number]>,
): boolean {
  const end = start + (Number(duration) || 0) + (cleanBufferMinutes(ownBuffer) ?? 0);
  return busy.some(([bs, be]) => start < be && bs < end);
}

/** Said when she set a per-service buffer before add_service_buffer_2026-11-05.sql ran: the save kept everything else. */
export const SERVICE_BUFFER_PENDING_HE =
  'זמן ההפסקה לשירות יישמר אחרי עדכון קטן במערכת שעוד לא הותקן. בינתיים אפשר לקבוע זמן הפסקה כללי ב״כללי קביעת תור״.';
/** The label on every service row. */
export const SERVICE_BUFFER_LABEL_HE = 'זמן הפסקה אחרי הטיפול (דקות)';
