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

function pad2(n) {
  return String(n).padStart(2, "0");
}

// Busy [start,end) minute-intervals for a given date. Cancelled appointments
// free their slot — identical to the in-app apptBusy / clash logic.
function busyIntervals(appointments, dateStr) {
  return (appointments || [])
    .filter((a) => a && a.date === dateStr && a.confirmation_status !== "cancelled")
    .map((a) => {
      const s = Number(a.hour) * 60;
      return [s, s + Number(a.duration || 0)];
    });
}

// Does [start,end) overlap any busy interval? (strict interval overlap)
function overlapsBusy(start, end, busy) {
  return busy.some(([bs, be]) => start < be && bs < end);
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
 * @returns {Array<{hour:number,label:string}>}  Bookable start hours, ascending.
 */
export function listAvailableSlots({ dayHours, appointments, dateStr, durationMin, nowHour }) {
  if (!dayHours) return []; // closed that day
  const duration = Number(durationMin) > 0 ? Number(durationMin) : 60;
  const open = Number(dayHours.open);
  const close = Number(dayHours.close);
  if (!Number.isFinite(open) || !Number.isFinite(close) || close <= open) return [];

  const busy = busyIntervals(appointments, dateStr);
  const slots = [];
  for (let h = open; h < close; h++) {
    const start = h * 60;
    const end = start + duration;
    if (end > close * 60) continue; // treatment would run past closing time
    if (nowHour != null && h <= Number(nowHour)) continue; // past hour today
    if (overlapsBusy(start, end, busy)) continue; // taken
    slots.push({ hour: h, label: `${pad2(h)}:00` });
  }
  return slots;
}
