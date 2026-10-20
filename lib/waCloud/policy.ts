// lib/waCloud/policy.ts
//
// Pure rules for the Cloud route, no imports: quiet hours and the Israel calendar day the per-business cap counts in.
//
// QUIET HOURS: nothing goes out through the Cloud route between 21:00 and 08:00 Israel time, except a booking
// confirmation (she just booked, at whatever hour, and is waiting for it - see templates.ts quietHoursExempt). A message
// refused for quiet hours is not lost: sendWhatsApp() puts it in her manual queue, the same net every other refusal uses.
// Today's crons already run inside the day (reminders at 14:00 UTC), so this is a guard for the future, not a change.

export const QUIET_START_HOUR = 21; // inclusive
export const QUIET_END_HOUR = 8;    // exclusive

const TZ = 'Asia/Jerusalem';

function israelParts(now: Date): { y: number; m: number; d: number; h: number; min: number; s: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), min: get('minute'), s: get('second') };
}

export function israelHour(now: Date = new Date()): number {
  return israelParts(now).h;
}

export function isQuietHours(now: Date = new Date()): boolean {
  const h = israelHour(now);
  return h >= QUIET_START_HOUR || h < QUIET_END_HOUR;
}

/** May a message with this exemption flag go out now? */
export function allowedNow(quietHoursExempt: boolean, now: Date = new Date()): boolean {
  return quietHoursExempt || !isQuietHours(now);
}

/** Midnight that started today's Israel calendar day, as an ISO instant. The per-business daily cap counts from here. */
export function israelDayStartIso(now: Date = new Date()): string {
  const p = israelParts(now);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  const offsetMs = asUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(p.y, p.m - 1, p.d) - offsetMs).toISOString();
}
