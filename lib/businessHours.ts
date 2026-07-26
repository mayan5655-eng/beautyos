// lib/businessHours.ts
// Single source of truth for per-day working hours.
//
// Reads the `business_hours` JSONB on a tenant's settings, keyed by day-of-week
// (JS getDay(): 0=Sun … 6=Sat). Each value is {open,close} (whole-hour ints) or
// null (closed). When the JSONB is missing it falls back to the legacy single
// working_hours_start/end over working_days, so older rows — and any reader that
// runs before a row is migrated — keep working exactly as before.

export type DayHours = { open: number; close: number } | null;

export interface HoursSettings {
  business_hours?: Record<string, { open: number; close: number } | null> | null;
  working_hours_start?: number | string | null;
  working_hours_end?: number | string | null;
  working_days?: string | null;
}

// Hours for a single day-of-week. Returns {open,close} or null (closed).
export function dayHoursFrom(settings: HoursSettings | null | undefined, d: number): DayHours {
  const bh = settings && settings.business_hours;
  if (bh && typeof bh === "object" && Object.prototype.hasOwnProperty.call(bh, String(d))) {
    const v = bh[String(d)];
    if (v && typeof v === "object" && v.open != null && v.close != null) {
      return { open: Number(v.open), close: Number(v.close) };
    }
    return null; // explicitly closed
  }
  // Fallback to the legacy single range over the legacy open-days.
  const start = Number(settings?.working_hours_start) || 9;
  const end = Number(settings?.working_hours_end) || 18;
  const legacyDays = String(settings?.working_days ?? "0,1,2,3,4,5")
    .split(",").map((s) => s.trim()).filter(Boolean).map(Number);
  return legacyDays.includes(d) ? { open: start, close: end } : null;
}

// Normalized whole-week map { 0..6: {open,close}|null }.
export function normalizeBusinessHours(settings: HoursSettings | null | undefined): Record<number, DayHours> {
  const obj: Record<number, DayHours> = {};
  for (let d = 0; d < 7; d++) obj[d] = dayHoursFrom(settings, d);
  return obj;
}

// Is the business open on a specific Date?
export function isOpenOn(settings: HoursSettings | null | undefined, date: Date): boolean {
  return dayHoursFrom(settings, date.getDay()) !== null;
}

// Derive the legacy single-range columns from a per-day map, so un-migrated
// readers stay correct when the Settings UI saves.
export function legacyHoursFromMap(bh: Record<number, DayHours>): {
  working_hours_start: number;
  working_hours_end: number;
  working_days: string;
} {
  const opens: number[] = [], closes: number[] = [], openDays: number[] = [];
  for (let d = 0; d < 7; d++) {
    const v = bh[d];
    if (v && v.open != null && v.close != null) {
      opens.push(Number(v.open)); closes.push(Number(v.close)); openDays.push(d);
    }
  }
  return {
    working_hours_start: opens.length ? Math.min(...opens) : 9,
    working_hours_end: closes.length ? Math.max(...closes) : 18,
    working_days: openDays.join(","),
  };
}

// Compact Hebrew summary of the whole week, for AI prompts, e.g.
// "ראשון 09:00–18:00, … שישי 09:00–13:00, שבת סגור".
const DAY_LABELS_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
function hh(n: number): string { return `${String(n).padStart(2, "0")}:00`; }
export function hoursSummaryHe(settings: HoursSettings | null | undefined): string {
  const parts: string[] = [];
  for (let d = 0; d < 7; d++) {
    const v = dayHoursFrom(settings, d);
    parts.push(v ? `${DAY_LABELS_HE[d]} ${hh(v.open)}–${hh(v.close)}` : `${DAY_LABELS_HE[d]} סגור`);
  }
  return parts.join(", ");
}
