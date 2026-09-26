// lib/nextClient.js
//
// The minute before a client walks in: who she is, when she was last here, and
// the two things a cosmetician remembers for a living - what she is allergic to
// and the small thing she said last time ("getting married in November").
// Everything comes from what the app already holds; nothing new to fill in
// except the note, which is the existing clients.notes field.
//
// Pure: startMinute/endMinute come in from the caller (lib/apptTime), so there
// are no imports and the wording is testable.

const pad = (n) => String(n).padStart(2, "0");
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** How long ago, said the way it is said. days >= 1. */
export function agoHe(days) {
  if (days <= 1) return "אתמול";
  if (days < 7) return `לפני ${days} ימים`;
  const w = Math.round(days / 7);
  if (days < 28) return w === 1 ? "לפני שבוע" : w === 2 ? "לפני שבועיים" : `לפני ${w} שבועות`;
  const m = Math.round(days / 30);
  if (m <= 1) return "לפני חודש";
  if (m === 2) return "לפני חודשיים";
  if (m < 12) return `לפני ${m} חודשים`;
  return m < 18 ? "לפני שנה" : "לפני יותר משנה";
}

/** "עכשיו", "בעוד 10 דקות", "בעוד רבע שעה", "בעוד חצי שעה". */
export function untilHe(minutes) {
  const m = Math.max(0, Math.round(minutes));
  if (m <= 1) return "עכשיו";
  if (m === 15) return "בעוד רבע שעה";
  if (m === 30) return "בעוד חצי שעה";
  return `בעוד ${m} דקות`;
}

/**
 * @param {object} p
 * @param {object[]} p.appointments   client appointments (any status)
 * @param {object[]} p.clients
 * @param {Date}     p.now
 * @param {(a:object)=>number|null} p.startMinute
 * @param {(a:object)=>number|null} p.endMinute
 * @param {number}   [p.windowMinutes=45]  how early the card appears
 * @returns {null | { appt, client, minutesUntil, lastVisit: {service:string, ago:string}|null, allergies:string, note:string, isNew:boolean }}
 */
export function buildNextClientBrief({ appointments, clients, now, startMinute, endMinute, windowMinutes = 45 }) {
  const today = isoDay(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const live = (appointments || []).filter((a) => a && a.confirmation_status !== "cancelled");

  const upcoming = live
    .filter((a) => a.date === today)
    .map((a) => ({ a, s: startMinute(a) }))
    .filter(({ s }) => s !== null && s !== undefined && s >= nowMin - 5 && s - nowMin <= windowMinutes)
    .sort((x, y) => x.s - y.s)[0];
  if (!upcoming) return null;

  const appt = upcoming.a;
  const client = (clients || []).find((c) => String(c.id) === String(appt.client_id)) || null;

  let lastVisit = null;
  if (appt.client_id) {
    const past = live
      .filter((a) => String(a.client_id) === String(appt.client_id) && a.id !== appt.id)
      .filter((a) => a.date < today || (a.date === today && (endMinute(a) ?? Infinity) <= nowMin))
      .sort((x, y) => (y.date + pad(startMinute(y) ?? 0)).localeCompare(x.date + pad(startMinute(x) ?? 0)))[0];
    if (past) {
      const days = Math.round((new Date(today + "T00:00:00") - new Date(past.date + "T00:00:00")) / 86400000);
      lastVisit = { service: String(past.service || "").trim(), ago: agoHe(Math.max(1, days)) };
    }
  }

  return {
    appt,
    client,
    minutesUntil: upcoming.s - nowMin,
    lastVisit,
    allergies: String(client?.allergies || "").trim(),
    note: String(client?.notes || "").trim(),
    isNew: !lastVisit,
  };
}
