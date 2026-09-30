// lib/scheduleGaps.ts
//
// A double-booked calendar reads as a conflict. A calendar with too little
// BUFFER between real appointments reads as nothing at all - no error, no
// red text - and she only feels it hours later, rushing through a fill with
// no time to wash her hands or glance at the next client's card first.
// add_appointment_no_overlap.sql explicitly allows back-to-back bookings (its
// own test block says so); this is the layer that still flags them, in the
// UI, so "allowed by the database" does not read as "fine for her."
//
// Pure arithmetic on [start, end) ranges, same spirit as lib/apptTime.ts - no
// appointment shape, no database, so it is testable with plain numbers.

export const TIGHT_GAP_MINUTES = 10;

export type GapCandidate = {
  id: string;
  start: number;
  end: number;
  /** Personal blocks still occupy time (they count as a "previous" entry),
   *  but are never themselves flagged - that gap was her own choice, not a
   *  client-booking surprise. */
  kind?: string | null;
};

/**
 * Ids of entries that start less than `thresholdMinutes` after the previous
 * entry (by start time) on the same day ends - including a negative gap,
 * i.e. an overlap that predates the exclusion constraint. Personal entries
 * participate as a "previous" occupant but are never themselves flagged.
 */
export function tightGapAppointmentIds(
  items: GapCandidate[],
  thresholdMinutes: number = TIGHT_GAP_MINUTES
): Set<string> {
  const sorted = [...items].sort((a, b) => a.start - b.start);
  const flagged = new Set<string>();
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (cur.kind === 'personal') continue;
    if (cur.start - prev.end < thresholdMinutes) flagged.add(cur.id);
  }
  return flagged;
}
