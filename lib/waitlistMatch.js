// lib/waitlistMatch.js
//
// Smart waitlist, the pure part: which entries on the waiting list FIT a slot that just freed, and when it is too late (or too quiet)
// to offer it. No imports from the database or WhatsApp, so the plain-node test can run it.
//
// An entry fits when:
//   - the treatment is the same;
//   - the day matches: a chosen date (preferred_date) must be that day, chosen weekdays (pref_days, 0 = Sunday) must include it, and no
//     choice means any day;
//   - the start time is inside her window (pref_from_minute .. pref_to_minute), no window means any time.
// The window columns come from supabase/migrations/add_waitlist_windows_2026-10-25.sql. Until it runs they are simply absent, every
// entry counts as "any day, any time", and the offer goes by treatment alone, exactly as the waiting list always worked.

import { isShabbatHold, israelClock } from "./shabbat.js";

export const WINDOWS = [
  { key: "any", label: "בכל שעה", from: null, to: null },
  { key: "morning", label: "בוקר", from: 7 * 60, to: 12 * 60 },
  { key: "noon", label: "צהריים", from: 12 * 60, to: 16 * 60 },
  { key: "evening", label: "אחר הצהריים וערב", from: 16 * 60, to: 22 * 60 },
];

export const OFFER_QUIET_START_HOUR = 21; // no offers from 21:00 ...
export const OFFER_QUIET_END_HOUR = 8;    // ... until 08:00 Israel time, and none on Shabbat (same hours as the Cloud route's quiet hours)

/** Weekday (0 = Sunday) of a "YYYY-MM-DD" calendar date. */
export function weekdayOf(date) {
  const [y, m, d] = String(date).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

function daysOf(entry) {
  const raw = entry?.pref_days;
  if (!Array.isArray(raw)) return [];
  return raw.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}

/** Does this waiting-list entry fit a freed slot? slot = { date, startMinute, service } */
export function entryFitsSlot(entry, slot) {
  if (!entry || !slot) return false;
  if (entry.service && slot.service && entry.service !== slot.service) return false;
  if (entry.preferred_date && String(entry.preferred_date).slice(0, 10) !== slot.date) return false;
  const days = daysOf(entry);
  if (days.length && !days.includes(weekdayOf(slot.date))) return false;
  const from = entry.pref_from_minute == null ? null : Number(entry.pref_from_minute);
  const to = entry.pref_to_minute == null ? null : Number(entry.pref_to_minute);
  if (from !== null && Number.isFinite(from) && slot.startMinute < from) return false;
  if (to !== null && Number.isFinite(to) && slot.startMinute >= to) return false;
  return true;
}

/** Last 9 digits of a phone, for comparing numbers written in different shapes ("050-1234567", "+972501234567"). */
export function phoneKey(raw) {
  const d = String(raw ?? "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : d;
}

/** "quiet" when nothing may go to clients right now: Shabbat (Saturday before 20:00), or night (21:00 to 08:00) in Israel. */
export function offerQuietReason(now = new Date()) {
  if (isShabbatHold(now)) return "shabbat";
  const { hour } = israelClock(now);
  if (hour >= OFFER_QUIET_START_HOUR || hour < OFFER_QUIET_END_HOUR) return "night";
  return null;
}

/**
 * From the waiting list to the people who get an offer, in the order they joined.
 * Skips: entries that do not fit, the person who just cancelled, anyone who asked to be removed from messages, anyone already offered
 * this slot, a number with nothing to send to, and the same phone twice.
 * @param {object[]} entries  waitlist rows (status already 'waiting')
 * @param {object} ctx { slot, cancelledClientId, cancelledPhone, optedOutPhones:Set<string>, alreadyOfferedPhones:Set<string> }
 * @returns {{ chosen: object[], skipped: Record<string, number> }}
 */
export function chooseRecipients(entries, ctx) {
  const skipped = { no_fit: 0, cancelled_client: 0, opted_out: 0, already_offered: 0, no_phone: 0, duplicate: 0 };
  const seen = new Set();
  const chosen = [];
  const sorted = [...(entries || [])].sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")) || String(a.id).localeCompare(String(b.id)));
  for (const e of sorted) {
    const key = phoneKey(e.phone);
    if (!key) { skipped.no_phone++; continue; }
    if (!entryFitsSlot(e, ctx.slot)) { skipped.no_fit++; continue; }
    if ((ctx.cancelledClientId && e.client_id && String(e.client_id) === String(ctx.cancelledClientId)) || (ctx.cancelledPhone && phoneKey(ctx.cancelledPhone) === key)) { skipped.cancelled_client++; continue; }
    if (ctx.optedOutPhones?.has(key)) { skipped.opted_out++; continue; }
    if (ctx.alreadyOfferedPhones?.has(key)) { skipped.already_offered++; continue; }
    if (seen.has(key)) { skipped.duplicate++; continue; }
    seen.add(key);
    chosen.push(e);
  }
  return { chosen, skipped };
}
