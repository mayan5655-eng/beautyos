// lib/durationDrift.ts
//
// appointments.duration is what she booked - a chip she tapped (30/45/60/90)
// or a service's configured default. Nothing has ever recorded what actually
// happened, so "this gel fill always runs 15 minutes over" lived only in her
// memory. These functions turn two timestamps (captured by a "started" /
// "finished" button pair - see supabase/migrations/pending/
// appointment-actual-duration.sql) into the one sentence worth saying, once,
// right when she taps "finished" - not a report she has to go find.
//
// Pure, no appointment shape, no database - testable with plain timestamps.

export type DurationOutcome = {
  actualMinutes: number;
  bookedMinutes: number;
  /** actual - booked; positive means it ran over. */
  driftMinutes: number;
};

/** A drift under this many minutes reads as "on plan," not worth calling out. */
const NEGLIGIBLE_DRIFT_MINUTES = 5;

/** Minutes between two ISO timestamps. Null if either is missing, unparseable, or end is before start. */
export function actualDurationMinutes(startedAt: string | null | undefined, endedAt: string | null | undefined): number | null {
  if (!startedAt || !endedAt) return null;
  const s = new Date(startedAt).getTime();
  const e = new Date(endedAt).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return null;
  return Math.round((e - s) / 60000);
}

/** What actually happened, compared to what was booked - or null if there is nothing to compare yet. */
export function durationOutcome(
  startedAt: string | null | undefined,
  endedAt: string | null | undefined,
  bookedMinutes: number
): DurationOutcome | null {
  const actualMinutes = actualDurationMinutes(startedAt, endedAt);
  if (actualMinutes === null) return null;
  const booked = Number(bookedMinutes) || 0;
  return { actualMinutes, bookedMinutes: booked, driftMinutes: actualMinutes - booked };
}

/** The one-line Hebrew toast for the moment "finished" is tapped. */
export function durationOutcomeHe(outcome: DurationOutcome): string {
  const { actualMinutes, bookedMinutes, driftMinutes } = outcome;
  if (Math.abs(driftMinutes) < NEGLIGIBLE_DRIFT_MINUTES) return `הטיפול ארך ${actualMinutes} דק׳ — כמעט בדיוק כמו שתוכנן`;
  if (driftMinutes > 0) return `הטיפול ארך ${actualMinutes} דק׳ — ${driftMinutes} דק׳ יותר מהמתוכנן (${bookedMinutes} דק׳)`;
  return `הטיפול ארך ${actualMinutes} דק׳ — ${Math.abs(driftMinutes)} דק׳ פחות מהמתוכנן (${bookedMinutes} דק׳)`;
}
