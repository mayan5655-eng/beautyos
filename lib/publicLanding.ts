// lib/publicLanding.ts
//
// Pure helpers for the public landing page (app/PublicLandingPage.tsx): opening
// status in Israel time, phone formats, the Google / Instagram fields, and the
// WhatsApp message the "plan your treatment" chips build.
//
// Kept out of the component so every rule here is testable without a browser
// (test-public-landing.ts), and so the one rule that matters most - nothing is
// shown that the tenant did not actually enter - is enforced in one place:
// every reader returns null for a missing or malformed value, and the page hides
// the section on null.

import { dayHoursFrom, type HoursSettings, type DayHours } from './businessHours.ts';
import { toWhatsAppNumber } from './phone.ts';

export const TZ = 'Asia/Jerusalem';
export const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

// ── Time ─────────────────────────────────────────────────────────────────────

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Day of week (0 = Sunday) and minutes since midnight, as a clock in Israel reads them. */
export function israelClock(now: Date): { dow: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  const hour = Number(get('hour')) % 24;
  return { dow: WEEKDAY_INDEX[get('weekday')] ?? now.getDay(), minutes: hour * 60 + Number(get('minute')) };
}

/** 9 -> "09:00", 18.5 -> "18:30". Hours are stored as (possibly fractional) hour numbers. */
export function fmtHour(h: number): string {
  const total = Math.round(Number(h) * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * True when the tenant actually entered opening hours. dayHoursFrom() falls back
 * to Sun-Fri 09:00-18:00 when nothing is stored, which is right for the booking
 * engine but would be invented content on a public page.
 */
export function hasRealHours(s: HoursSettings | null | undefined): boolean {
  if (!s) return false;
  const bh = s.business_hours;
  if (bh && typeof bh === 'object' && Object.keys(bh).length > 0) {
    return Object.values(bh).some((v) => v && typeof v === 'object' && v.open != null && v.close != null);
  }
  return s.working_days != null && String(s.working_days).trim() !== '' && s.working_hours_start != null && s.working_hours_end != null;
}

export type OpenStatus =
  | { open: true; closesAt: string }
  | { open: false; opensAt: string; inDays: number; dow: number };

/** Open now (until when), or closed (and when it opens next). Null when no open day exists in the week. */
export function openStatus(s: HoursSettings | null | undefined, now: Date): OpenStatus | null {
  if (!hasRealHours(s)) return null;
  const { dow, minutes } = israelClock(now);
  const today = dayHoursFrom(s, dow);
  if (today && minutes >= today.open * 60 && minutes < today.close * 60) {
    return { open: true, closesAt: fmtHour(today.close) };
  }
  if (today && minutes < today.open * 60) return { open: false, opensAt: fmtHour(today.open), inDays: 0, dow };
  for (let i = 1; i <= 7; i++) {
    const d = (dow + i) % 7;
    const h = dayHoursFrom(s, d);
    if (h) return { open: false, opensAt: fmtHour(h.open), inDays: i, dow: d };
  }
  return null;
}

export function openStatusLabel(st: OpenStatus): string {
  if (st.open) return `פתוח עכשיו · עד ${st.closesAt}`;
  const when = st.inDays === 0 ? 'היום' : st.inDays === 1 ? 'מחר' : `ביום ${DAYS_HE[st.dow]}`;
  return `סגור כרגע · נפתח ${when} ב-${st.opensAt}`;
}

/** Today's hours in Israel, or null when closed today / no real hours. */
export function todayHours(s: HoursSettings | null | undefined, now: Date): DayHours {
  if (!hasRealHours(s)) return null;
  return dayHoursFrom(s, israelClock(now).dow);
}

// ── Phone ────────────────────────────────────────────────────────────────────

/** Local Israeli digits ("0541234567"), or null when the value is not a phone. */
function localDigits(raw: string | null | undefined): string | null {
  const intl = toWhatsAppNumber(raw);
  if (!intl) return null;
  return intl.startsWith('972') ? '0' + intl.slice(3) : null;
}

/**
 * "054-123-4567" for a mobile or 07x number, "03-123-4567" for a landline. A
 * foreign number is shown as stored (it has no Israeli local form).
 */
export function displayPhone(raw: string | null | undefined): string | null {
  const local = localDigits(raw);
  if (!local) {
    const s = String(raw || '').trim();
    return toWhatsAppNumber(s) ? s : null;
  }
  if (local.length === 10) return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`;
  if (local.length === 9) return `${local.slice(0, 2)}-${local.slice(2, 5)}-${local.slice(5)}`;
  return local;
}

/** "tel:+972541234567", or null. */
export function telHref(raw: string | null | undefined): string | null {
  const intl = toWhatsAppNumber(raw);
  return intl ? `tel:+${intl}` : null;
}

/** "https://wa.me/972541234567?text=...", or null. */
export function waHref(raw: string | null | undefined, message?: string): string | null {
  const intl = toWhatsAppNumber(raw);
  if (!intl) return null;
  return `https://wa.me/${intl}` + (message ? `?text=${encodeURIComponent(message)}` : '');
}

// ── Google / Instagram ───────────────────────────────────────────────────────

const GOOGLE_HOSTS = /(^|\.)(google\.[a-z.]+|goo\.gl|g\.page|maps\.app\.goo\.gl|g\.co)$/i;

export type GoogleInfo = { rating: number; count: number | null; url: string | null };

/**
 * The Google card's values, from what she typed in Settings (branding jsonb).
 * Null unless there is a real rating between 1 and 5: a card with no rating is
 * not a card. The link is kept only when it really points at Google, so the
 * word "Google" on the page is never attached to some other site.
 */
export function googleInfo(branding: Record<string, unknown> | null | undefined): GoogleInfo | null {
  const b = branding || {};
  const rating = Number(String(b.google_rating ?? '').replace(',', '.'));
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) return null;
  const countN = Number(String(b.google_reviews_count ?? '').replace(/[,\s]/g, ''));
  const count = Number.isInteger(countN) && countN > 0 ? countN : null;
  let url: string | null = null;
  try {
    const u = new URL(String(b.google_place_url || '').trim());
    if (u.protocol === 'https:' && GOOGLE_HOSTS.test(u.hostname)) url = u.toString();
  } catch { /* not a URL: no link */ }
  return { rating: Math.round(rating * 10) / 10, count, url };
}

/** "@handle" or an instagram.com link -> "handle"; anything else -> null. */
export function instagramHandle(raw: string | null | undefined): string | null {
  let v = String(raw || '').trim();
  if (!v) return null;
  const m = /instagram\.com\/([^/?#]+)/i.exec(v);
  if (m) v = m[1];
  else if (/^https?:\/\//i.test(v)) return null;
  v = v.replace(/^@/, '');
  return /^[A-Za-z0-9._]{1,30}$/.test(v) ? v : null;
}

/**
 * A Facebook page link from what she typed: a facebook.com / fb.com URL, or a bare page name.
 * Anything pointing elsewhere is dropped, so the "Facebook" label never links to another site.
 */
export function facebookHref(raw: string | null | undefined): string | null {
  const v = String(raw || '').trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      return u.protocol === 'https:' && /(^|\.)(facebook\.com|fb\.com)$/i.test(u.hostname) && u.pathname.length > 1 ? u.toString() : null;
    } catch { return null; }
  }
  const name = v.replace(/^@/, '');
  return /^[A-Za-z0-9.\-]{2,80}$/.test(name) ? `https://www.facebook.com/${name}` : null;
}

// ── Maps ─────────────────────────────────────────────────────────────────────

export function mapsHref(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
export function wazeHref(address: string): string {
  return `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
}

// ── WhatsApp message ─────────────────────────────────────────────────────────

/** The message the chips build. With nothing picked it is a plain "I'd like to book". */
export function planMessage(businessName: string, treatments: string[], polishColor?: string | null): string {
  const lines: string[] = [];
  lines.push(businessName ? `היי ${businessName}! 🌸` : 'היי! 🌸');
  if (!treatments.length) {
    lines.push('אשמח לקבוע תור.');
  } else if (treatments.length === 1) {
    lines.push(`אשמח לקבוע תור ל${treatments[0]}.`);
  } else {
    lines.push('אשמח לקבוע תור ל:');
    for (const t of treatments) lines.push(`• ${t}`);
  }
  if (polishColor) lines.push(`צבע לק שאהבתי: ${polishColor}`);
  lines.push('מתי יש לך מקום?');
  return lines.join('\n');
}
