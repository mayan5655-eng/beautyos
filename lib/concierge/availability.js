// lib/concierge/availability.js
// Pure slot-enumeration for the WhatsApp booking concierge.
//
// This module is DELIBERATELY dependency-free and side-effect-free so it can be
// unit-tested offline (no DB, no network) and reused by the webhook. It reuses
// the SAME whole-hour + interval-overlap rules the in-app booking uses
// (handleSave / book-appointment), so the concierge can never offer or create a
// slot the rest of the system would consider taken.
//
// ESM to match the rest of the codebase; the pure functions are exercised by an
// ESM-aware dry-run harness (transpiled offline) rather than by DB integration.

import { startMinute, endMinute, fmtTime, overlaps, slotsBetween } from "../apptTime";

// Busy [start,end) minute-intervals for a given date. Cancelled appointments
// free their slot — identical to the in-app apptBusy / clash logic.
//
// Reads through startMinute/endMinute rather than hour*60, so a booking that
// starts at 14:30 is treated as busy from 14:30 rather than from 14:00. Rows
// with no usable start are dropped instead of defaulting to midnight, where
// they would silently block nothing.
function busyIntervals(appointments, dateStr) {
  return (appointments || [])
    .filter((a) => a && a.date === dateStr && a.confirmation_status !== "cancelled")
    .map((a) => [startMinute(a), endMinute(a)])
    .filter(([s, e]) => s !== null && e !== null);
}

// Does [start,end) overlap any busy interval? (strict interval overlap)
function overlapsBusy(start, end, busy) {
  return busy.some(([bs, be]) => overlaps(start, end, bs, be));
}

/**
 * List genuinely-available whole-hour start times for one service on one date.
 *
 * @param {Object}   args
 * @param {{open:number,close:number}|null} args.dayHours  That day's open/close
 *        (from dayHoursFrom(settings, weekday)); null = closed that day.
 * @param {Array}    args.appointments  Rows with {date, hour, duration, confirmation_status}.
 * @param {string}   args.dateStr       Target date "YYYY-MM-DD".
 * @param {number}   args.durationMin   Service duration in minutes (default 60).
 * @param {number|null} args.nowHour    If the date is TODAY, the current local hour
 *        so past slots are excluded; null when the date is in the future.
 * @param {number} [args.stepMin=30]    Booking granularity in minutes.
 * @returns {Array<{hour:number,startMinute:number,label:string}>}  Bookable
 *          starts, ascending. `hour` is retained so existing callers that read
 *          it keep working; it is the whole-hour part of startMinute.
 */
export function listAvailableSlots({ dayHours, appointments, dateStr, durationMin, nowHour, stepMin = 30 }) {
  if (!dayHours) return []; // closed that day
  const duration = Number(durationMin) > 0 ? Number(durationMin) : 60;
  const open = Number(dayHours.open);
  const close = Number(dayHours.close);
  if (!Number.isFinite(open) || !Number.isFinite(close) || close <= open) return [];

  const busy = busyIntervals(appointments, dateStr);
  // slotsBetween already refuses any start whose treatment would run past
  // closing, so the old `end > close*60` guard is no longer needed here.
  return slotsBetween(open, close, stepMin, duration)
    .filter((start) => {
      // Past slots today. Compared in minutes now: at 14:20 the 14:30 slot is
      // still bookable, where the old whole-hour test discarded all of 14:00.
      if (nowHour != null && start <= Number(nowHour) * 60) return false;
      return !overlapsBusy(start, start + duration, busy);
    })
    .map((start) => ({ hour: Math.floor(start / 60), startMinute: start, label: fmtTime(start) }));
}
