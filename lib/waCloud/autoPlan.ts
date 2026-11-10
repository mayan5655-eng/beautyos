// lib/waCloud/autoPlan.ts
//
// Pure timing rules of the automatic messages. No database, no network.
//
//   * Never in quiet hours (21:00-08:00 Israel), never on Shabbat or yom tov, never on their eve after 15:00. Unlike the
//     Cloud route in send.ts, the booking confirmation is NOT exempt here: one booked at night waits ("deferred") and
//     goes at 08:00 with the first hourly run (owner's rule for the automatic path: nothing goes out in quiet hours).
//   * The reminder is due `leadHours` before the visit. When that moment falls in quiet hours it moves to the nearest
//     allowed edge: an evening moment (21:00-23:59) to 20:00 the same evening, so it is a little EARLIER; a night moment
//     (00:00-07:59) to 08:00, a little later. On a rest day it simply waits for the first allowed hourly run.
//   * Never less than MIN_LEAD_MS before the visit: a reminder an hour before is noise, and the hourly run could be late.

import { isQuietHours, israelLocalToUtcMs, israelDayAndMinute } from './policy.ts';
import { israelClock, israelDayKey, SATURDAY_NIGHT_HOUR, EVE_LATEST_HOUR } from '../shabbat.js';

export const MIN_LEAD_MS = 2 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

export type YomTov = (day: string) => boolean;

/** Shabbat / yom tov (until 20:00, and all of it when the next day is a rest day too) and their eves from 15:00. */
export function restHold(now: Date, isYomTov: YomTov = () => false): boolean {
  const { weekday, hour } = israelClock(now);
  const restToday = weekday === 6 || isYomTov(israelDayKey(now));
  const restTomorrow = weekday === 5 || isYomTov(israelDayKey(now, 1));
  if (restToday && (hour < SATURDAY_NIGHT_HOUR || restTomorrow)) return true;
  if (!restToday && restTomorrow && hour >= EVE_LATEST_HOUR) return true;
  return false;
}

/** May an automatic message go out at this moment? */
export function autoAllowedNow(now: Date, isYomTov: YomTov = () => false): boolean {
  return !isQuietHours(now) && !restHold(now, isYomTov);
}

/** When the reminder for a visit starting at `startMs` should go, moved out of quiet hours. */
export function reminderSendAt(startMs: number, leadHours: number): number {
  const t = startMs - leadHours * HOUR;
  const { day, minute } = israelDayAndMinute(new Date(t));
  if (minute >= 21 * 60) return israelLocalToUtcMs(day, 20 * 60);
  if (minute < 8 * 60) return israelLocalToUtcMs(day, 8 * 60);
  return t;
}

export type ReminderPlan = 'due' | 'not_yet' | 'held' | 'too_late' | 'bad_time';

/** What the hourly run does with one appointment's reminder right now. */
export function reminderPlan(o: { date: string; startMinute: number | null; leadHours: number; now: Date; isYomTov?: YomTov }): ReminderPlan {
  if (o.startMinute === null || !Number.isFinite(o.startMinute)) return 'bad_time';
  const start = israelLocalToUtcMs(o.date, o.startMinute);
  if (!Number.isFinite(start)) return 'bad_time';
  const now = o.now.getTime();
  if (start - now < MIN_LEAD_MS) return 'too_late';
  if (now < reminderSendAt(start, o.leadHours)) return 'not_yet';
  if (!autoAllowedNow(o.now, o.isYomTov)) return 'held';
  return 'due';
}

/** Israel days the hourly run reads appointments for: today and the next `days`. */
export function upcomingDays(now: Date, days: number): string[] {
  return Array.from({ length: days + 1 }, (_, i) => israelDayKey(now, i));
}
