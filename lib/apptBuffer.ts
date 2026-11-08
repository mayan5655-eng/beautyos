// lib/apptBuffer.ts
//
// appointments.buffer_minutes: the buffer an appointment was CHECKED with, stored on the row so the database can
// enforce it (add_service_buffer_2026-11-05.sql rebuilds appointments_no_overlap over
// [start, start + duration + coalesce(buffer_minutes, 0))).
//
// Why it is stored and not looked up: the overlap check in the app reads a snapshot, so two concurrent bookings can
// both read an empty day and both pass (Vercel security review, 2026-11-08). Only the exclusion constraint is atomic,
// and it can only see columns of the row. So every writer that inserts or moves an appointment writes the buffer it
// checked with (0 for a personal block), and the constraint refuses a row that eats another's buffer with 23P01,
// which every writer already answers as "that time was just taken".
//
// Before the migration runs the column does not exist. Every writer then retries ONCE without buffer_minutes and
// nothing else (lib/pgError missingColumnName): dropping a wider set is how a missing buffer column once dropped a
// service's deposit flag (commit 70327f1). Without the column the database guards [start, start + duration) as it
// always has, and the app check still applies the buffers.
//
// Pure: no database, no clock. The writer passes the call to retry.

import { cleanBufferMinutes } from './serviceBuffer.ts';
import { isMissingColumnError, missingColumnName, type MaybePgError } from './pgError.ts';

export const APPT_BUFFER_COLUMN = 'buffer_minutes';

/** The field every appointment writer spreads into its row: the buffer it checked with, 0..120, never null. */
export function apptBufferField(buffer: unknown): { buffer_minutes: number } {
  return { buffer_minutes: cleanBufferMinutes(buffer) ?? 0 };
}

/** Did this write fail because appointments.buffer_minutes is not there yet? Only that column, never another one. */
export function isMissingApptBufferColumn(error: MaybePgError): boolean {
  if (!error || !isMissingColumnError(error)) return false;
  const col = missingColumnName(error);
  if (col) return col === APPT_BUFFER_COLUMN;
  // A missing-column error that does not name a column in the usual shape: only when it mentions this one.
  return new RegExp(`\\b${APPT_BUFFER_COLUMN}\\b`).test(String(error.message || ''));
}

type Row = Record<string, unknown>;

/** The same row(s) without buffer_minutes, and with every other field untouched. */
export function withoutApptBuffer<T extends Row | Row[]>(rows: T): T {
  const strip = (r: Row): Row => {
    if (!r || typeof r !== 'object' || !(APPT_BUFFER_COLUMN in r)) return r;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to drop it
    const { [APPT_BUFFER_COLUMN]: _gone, ...rest } = r;
    return rest;
  };
  return (Array.isArray(rows) ? rows.map(strip) : strip(rows as Row)) as T;
}

const carriesBuffer = (rows: Row | Row[]): boolean =>
  Array.isArray(rows) ? rows.some((r) => r && APPT_BUFFER_COLUMN in r) : !!rows && APPT_BUFFER_COLUMN in rows;

/**
 * Run an appointment insert or update; when it fails only because buffer_minutes does not exist yet, run it once more
 * without that one column. Any other error (23P01 included) comes back as it was, for the caller's own answer.
 */
export async function writeWithApptBuffer<T extends Row | Row[], R extends { error?: MaybePgError }>(
  rows: T,
  run: (rows: T) => PromiseLike<R>,
): Promise<R> {
  const first = await run(rows);
  if (first && first.error && carriesBuffer(rows) && isMissingApptBufferColumn(first.error)) {
    return run(withoutApptBuffer(rows));
  }
  return first;
}
