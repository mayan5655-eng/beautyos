// lib/rebookNext.js
//
// "קבעי לה שוב": propose the NEXT visit for a client in one tap.
//
// Two pure questions, answered here so they can be tested without a browser or a database:
//
//   1. HOW LONG until she comes back? Her own rhythm, never an invented number. In order:
//        - the median gap between her visits of THIS service (lib/reminders/rebook.typicalIntervalDays: needs two
//          real gaps, so three visits);
//        - the median gap between all her visits;
//        - otherwise the business default, said out loud as a default: 3 weeks for a nails-only business, 4 weeks
//          for everything else. (The reminder engine's own default is 5 weeks for facials; this one follows the
//          3-4 weeks the owner asked for, and the screen says "ברירת מחדל" so it is never passed off as her rhythm.)
//
//   2. WHEN exactly? The nearest FREE slot at the same time of day, on or after the day the interval points to:
//        - only on days she works (businessHours), inside that day's hours, whole treatment before closing;
//        - never over another appointment (half-open intervals: back-to-back is fine, like lib/apptTime.overlaps);
//        - never inside her protected lunch break (lib/lunchBreak) - a break she set once and should not have to defend;
//        - never today or earlier: the proposal is for a future visit.
//      Same weekday-time first: the exact anchor minute on each open day from the target day for `exactWindowDays`
//      days. If none of those days has the exact time free, the day nearest the target with ANY free slot wins, at
//      the free start closest to the anchor, flagged sameTime:false so the screen can say why. A fully booked
//      horizon returns null: better no proposal than one she could not keep.
//
// No clock, no I/O, no Date in local time: dates are 'YYYY-MM-DD' strings and day-of-week comes from the calendar
// date itself, so the answer is the same on every phone in every time zone.

import { typicalIntervalDays } from './reminders/rebook.js';

export const REBOOK_NAILS_DEFAULT_DAYS = 21;
export const REBOOK_OTHER_DEFAULT_DAYS = 28;

/** The business default, from its fields: nails-only 3 weeks, anything else 4. */
export function rebookDefaultDays(businessFields) {
  const f = Array.isArray(businessFields) ? businessFields : [];
  return f.length === 1 && f[0] === 'nails' ? REBOOK_NAILS_DEFAULT_DAYS : REBOOK_OTHER_DEFAULT_DAYS;
}

const dayNum = (iso) => Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000);
const fromDayNum = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
const addDays = (iso, n) => fromDayNum(dayNum(iso) + n);
const weekdayOf = (iso) => new Date(dayNum(iso) * 86400000).getUTCDay(); // 0 = Sunday, same as JS getDay()
const validIso = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s);

/**
 * Her interval in days, and where it came from.
 *
 * @param {object} p
 * @param {Array<{date: string, service?: string}>} p.visits  her real past visits (no cancelled, no personal blocks)
 * @param {string} [p.service]
 * @param {string[]} [p.businessFields]
 * @returns {{days: number, basis: 'service' | 'client' | 'default'}}
 */
export function rebookInterval({ visits, service, businessFields }) {
  const list = (visits || []).filter((v) => v && validIso(String(v.date || '')));
  if (service) {
    const same = typicalIntervalDays(list.filter((v) => v.service === service).map((v) => v.date));
    if (same) return { days: same, basis: 'service' };
  }
  const all = typicalIntervalDays(list.map((v) => v.date));
  if (all) return { days: all, basis: 'client' };
  return { days: rebookDefaultDays(businessFields), basis: 'default' };
}

const overlapsAny = (busy, start, end) => busy.some((b) => start < b.end && b.start < end);

/** Her busy intervals for one date, from the flat list. */
const busyOn = (busy, date) => (busy || []).filter((b) => b && typeof b.date === 'string' && b.date.slice(0, 10) === date && Number.isFinite(b.start) && Number.isFinite(b.end));

/**
 * Every free start on one day, on the grid, for the "another time" picker: the same test the proposal itself uses,
 * so she can only ever choose something that was already bookable.
 * @param {{date: string, duration: number, hoursFor: (weekday: number) => ({open: number, close: number} | null), busy: Array<{date: string, start: number, end: number}>, lunch?: {startMinute: number, minutes: number} | null, step?: number}} p
 * @returns {number[]} minutes from midnight; [] on a closed day
 */
export function freeStartsOn({ date, duration, hoursFor, busy, lunch = null, step = 30 }) {
  if (!validIso(date)) return [];
  const hours = hoursFor(weekdayOf(date.slice(0, 10)));
  if (!hours) return [];
  const dur = Number(duration) > 0 ? Number(duration) : 60;
  const day = busyOn(busy, date.slice(0, 10));
  const out = [];
  for (let m = hours.open * 60; m + dur <= hours.close * 60; m += step) {
    if (lunch && m < lunch.startMinute + lunch.minutes && lunch.startMinute < m + dur) continue;
    if (!overlapsAny(day, m, m + dur)) out.push(m);
  }
  return out;
}

/**
 * The next visit.
 *
 * @param {object} p
 * @param {string} p.afterDate        date of her last visit (YYYY-MM-DD): the interval counts from here
 * @param {number|null} p.anchorMinute  the time of day she usually comes (minutes from midnight); null = start of the day
 * @param {number} p.duration         treatment length in minutes
 * @param {number} p.intervalDays
 * @param {string} p.today            YYYY-MM-DD, her local today
 * @param {(weekday: number) => ({open: number, close: number} | null)} p.hoursFor  whole hours, null = closed
 * @param {Array<{date: string, start: number, end: number}>} p.busy  non-cancelled appointments, minutes from midnight
 * @param {{startMinute: number, minutes: number} | null} [p.lunch]
 * @param {number} [p.step=30]
 * @param {number} [p.exactWindowDays=7]  how far past the target day to look for the SAME time before settling for another
 * @param {number} [p.horizonDays=42]
 * @returns {{date: string, minute: number, sameTime: boolean, targetDate: string} | null}
 */
export function proposeNextVisit({
  afterDate, anchorMinute, duration, intervalDays, today, hoursFor, busy, lunch = null,
  step = 30, exactWindowDays = 7, horizonDays = 42,
}) {
  if (!validIso(today)) return null;
  const dur = Number(duration) > 0 ? Number(duration) : 60;
  const interval = Number(intervalDays) > 0 ? Math.round(Number(intervalDays)) : REBOOK_OTHER_DEFAULT_DAYS;
  const tomorrow = addDays(today, 1);
  let target = validIso(afterDate) ? addDays(afterDate.slice(0, 10), interval) : addDays(today, interval);
  if (target < tomorrow) target = tomorrow;

  const byDate = new Map();
  for (const b of busy || []) {
    if (!b || !validIso(b.date) || !Number.isFinite(b.start) || !Number.isFinite(b.end)) continue;
    const k = b.date.slice(0, 10);
    if (!byDate.has(k)) byDate.set(k, []);
    byDate.get(k).push({ start: b.start, end: b.end });
  }
  const lunchBlock = lunch && Number.isFinite(lunch.startMinute) && lunch.minutes > 0
    ? { start: lunch.startMinute, end: lunch.startMinute + lunch.minutes } : null;

  const isFree = (date, start, hours) => {
    if (start < hours.open * 60 || start + dur > hours.close * 60) return false;
    if (lunchBlock && start < lunchBlock.end && lunchBlock.start < start + dur) return false;
    return !overlapsAny(byDate.get(date) || [], start, start + dur);
  };

  const anchor = Number.isFinite(anchorMinute) ? Number(anchorMinute) : null;
  let fallback = null;

  for (let i = 0; i <= horizonDays; i++) {
    const date = addDays(target, i);
    const hours = hoursFor(weekdayOf(date));
    if (!hours) continue; // closed day
    if (anchor !== null && isFree(date, anchor, hours)) {
      return { date, minute: anchor, sameTime: true, targetDate: target };
    }
    if (!fallback) {
      // The free start on this day closest to her usual time (or the first of the day when there is no usual time).
      const want = anchor ?? hours.open * 60;
      let best = null;
      for (let m = hours.open * 60; m + dur <= hours.close * 60; m += step) {
        if (!isFree(date, m, hours)) continue;
        if (best === null || Math.abs(m - want) < Math.abs(best - want)) best = m;
      }
      if (best !== null) fallback = { date, minute: best, sameTime: anchor === null ? true : false, targetDate: target };
    }
    // Looked at the whole exact-time window and there is a usable day: stop hunting for the exact time.
    if (fallback && i >= exactWindowDays) return fallback;
  }
  return fallback;
}
