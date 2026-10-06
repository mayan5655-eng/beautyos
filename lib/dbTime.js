// lib/dbTime.js
//
// A database timestamp, read as the moment it is.
//
// receipts.created_at and clients.created_at are `timestamp WITHOUT time zone` columns holding UTC, and
// PostgREST returns them with no zone ("2026-10-05T22:10:35.383187"). JavaScript reads a zone-less ISO
// string as LOCAL time, so in Israel every such moment came out 2-3 hours early: a payment taken at
// 01:10 on the 6th was read as 22:10 on the 5th. "Today" showed no payments, the receipt was dated
// yesterday, and the months/tax periods were off at their edges. Found 2026-10-06 on a brand-new tenant
// (the tenants table, whose columns carry a zone, was fine).
//
// parseDb() is the one place that knows: a zone-less ISO timestamp is UTC; one that already carries a
// zone (Z or +hh:mm) is left alone, so this stays correct if those columns are ever migrated to
// timestamptz (supabase/migrations/pending/receipts-created-at-timestamptz.sql).

const ZONELESS = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

/** A Date for a DB timestamp. Invalid or missing input gives an Invalid Date (never 1970). */
export function parseDb(value) {
  if (value instanceof Date) return value;
  if (value === null || value === undefined) return new Date(NaN); // new Date(null) is 1970: a missing timestamp is not a date
  const s = typeof value === 'string' ? value.trim() : '';
  return new Date(ZONELESS.test(s) ? s.replace(' ', 'T') + 'Z' : (typeof value === 'string' ? s : value));
}
