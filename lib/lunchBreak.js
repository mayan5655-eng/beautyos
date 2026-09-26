// lib/lunchBreak.js
//
// A protected break in her day: a window that CLIENT self-booking cannot take,
// however free the calendar looks. She sets it once (Settings, hours tab) and
// stops defending her own lunch.
//
// It only limits the public page and /api/book-appointment. She herself can
// still book into it from the app: it is her break, so it is her call.
//
// Stored in settings.branding.lunch_break = { on, start_minute, minutes }. No
// migration: the value is not secret (a visitor already sees the slot as taken)
// and branding is the existing home for small per-clinic settings.

export const LUNCH_MIN_MINUTES = 15;
export const LUNCH_MAX_MINUTES = 120;
export const LUNCH_DEFAULT = { start_minute: 13 * 60, minutes: 30 };

/** The break as { startMinute, minutes }, or null when it is off or unusable. */
export function resolveLunch(branding) {
  const b = branding && typeof branding === "object" ? branding.lunch_break : null;
  if (!b || typeof b !== "object" || b.on !== true) return null;
  const start = Number(b.start_minute);
  const minutes = Number(b.minutes);
  if (!Number.isInteger(start) || start < 0 || start >= 24 * 60) return null;
  if (!Number.isFinite(minutes) || minutes < LUNCH_MIN_MINUTES || minutes > LUNCH_MAX_MINUTES) return null;
  return { startMinute: start, minutes };
}

/** Would a booking [start, start+duration) run into the break? */
export function overlapsLunch(lunch, start, duration) {
  if (!lunch) return false;
  const s = Number(start);
  const d = Number(duration) > 0 ? Number(duration) : 0;
  if (!Number.isFinite(s)) return false;
  return s < lunch.startMinute + lunch.minutes && s + d > lunch.startMinute;
}

const pad = (n) => String(n).padStart(2, "0");
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * The break as busy intervals, one per day, in the shape /api/availability
 * returns for real appointments - so the booking page needs no new code and a
 * visitor learns nothing except that the time is not available.
 */
export function lunchBusy(lunch, from = new Date(), days = 60) {
  if (!lunch) return [];
  const out = [];
  for (let i = 0; i <= days; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    out.push({
      date: isoDay(d),
      start_minute: lunch.startMinute,
      hour: Math.floor(lunch.startMinute / 60),
      duration: lunch.minutes,
    });
  }
  return out;
}
