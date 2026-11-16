// lib/holidayClosure.ts
//
// Yom tov on her public booking page (competitor audit 2026-11-16). The page, the booking route and the client's "move my
// appointment" flow only knew her weekly hours, so a client could book Yom Kippur at normal Monday hours, get a reminder
// on the eve, and arrive at a closed door. Now yom tov (lib/greetings/calendar.ts isYomTov: Rosh Hashana 1-2, Yom Kippur,
// Sukkot 1, Shmini Atzeret, Pesach 1 and 7, Shavuot) is closed for SELF-booking by default. She can still book anyone
// herself, and a business that works on chag turns it back on (branding.booking_rules.open_on_holidays, Settings > booking).
import { isYomTov } from './greetings/calendar.ts';

/** Does she take online bookings on yom tov? Off unless she said yes. */
export function opensOnHolidays(branding: unknown): boolean {
  const b = branding && typeof branding === 'object' && !Array.isArray(branding) ? (branding as Record<string, unknown>) : {};
  const r = b.booking_rules && typeof b.booking_rules === 'object' ? (b.booking_rules as Record<string, unknown>) : {};
  return r.open_on_holidays === true;
}

/** Is this Israel day ('YYYY-MM-DD') closed to self-booking because it is yom tov and she does not open on chag? */
export function closedForHoliday(branding: unknown, day: string): boolean {
  return !opensOnHolidays(branding) && isYomTov(day);
}

export const HOLIDAY_CLOSED_HE = 'העסק סגור בחג, אפשר לבחור יום אחר?';
