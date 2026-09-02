// lib/calendarKind.ts
//
// What a calendar row IS, next to lib/apptTime which knows when it is.
//
// The calendar holds two things now. A client appointment has a client, a
// service and a price, and everything downstream - receipts, reminders,
// confirmations, revenue, the service mix - is about those. A personal event
// has a title and nothing else: her accountant, a course, a day off.
//
// They share a table on purpose (see supabase/migrations/add_appointment_kind.sql):
// a personal event has to block a client booking, and the only thing that
// enforces that under a race is an exclusion constraint, which cannot span two
// tables. The cost is that every screen which assumed "row implies client" now
// has to ask. This is where it asks, so the question is spelled the same way
// everywhere and there is one place to change if a third kind ever appears.
//
// Pure and dependency-free, like apptTime, because the answer feeds guards.

import { startMinute, MINUTES_IN_DAY, type HasStart } from './apptTime';

export const APPOINTMENT = 'appointment';
export const PERSONAL = 'personal';

export type HasKind = { kind?: string | null };

/**
 * Is this her own blocked-out time rather than a client's appointment?
 *
 * Absent `kind` reads as an appointment, which is what makes the application
 * safe to deploy before the migration is applied: every row comes back without
 * the column, every caller takes the existing branch, and nothing changes.
 * It is also the right reading of a row written by an older build.
 */
export function isPersonal(a: HasKind | null | undefined): boolean {
  return (a?.kind ?? APPOINTMENT) === PERSONAL;
}

/**
 * The complement, named for what it means rather than as a negation.
 *
 * Use this for anything about clients - counts she reads as "how many people am
 * I seeing", reminders, confirmations, receipts, the service mix. Do NOT use it
 * to decide what is busy: blocking logic must see every row, personal ones
 * included, or the feature does nothing.
 */
export function isClientAppointment(a: HasKind | null | undefined): boolean {
  return !isPersonal(a);
}

/**
 * Does this cover the whole day?
 *
 * Derived, not stored. All-day is start 0 for 1440 minutes, which every overlap
 * test in the codebase already reads as "the whole day is busy" without being
 * told about it. A stored flag would be a second way to say the same thing, and
 * the two could disagree - at which point the calendar and the booking guard
 * would be looking at different days.
 *
 * `>=` rather than `===` so a longer duration, however it got there, still
 * reads as all-day rather than falling back to a start and end time.
 */
export function isAllDay(a: (HasStart & HasKind) | null | undefined): boolean {
  const s = startMinute(a as HasStart);
  const d = Number(a?.duration);
  return s === 0 && Number.isFinite(d) && d >= MINUTES_IN_DAY;
}

/** Minutes covering a whole day, for building an all-day event. */
export const ALL_DAY_DURATION = MINUTES_IN_DAY;
