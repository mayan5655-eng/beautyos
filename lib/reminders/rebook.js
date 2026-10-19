// lib/reminders/rebook.js
//
// "Time for your next one?" - the most repeatable revenue a nail tech or a
// cosmetician has. A gel manicure lasts about three weeks and a facial about
// five; a client who left without booking the next visit usually means to,
// and simply forgets until the nails are already grown out. The checkout
// already offers the next date (beautyos.jsx, rebooking chips); this catches
// the clients who said "I'll let you know".
//
// The rule, per client:
//   - her interval: the median gap between HER OWN past visits (she knows her
//     rhythm better than any default), 7-120 days; with fewer than two gaps on
//     record, the business's default: 21 days for a nails-only business,
//     otherwise 35;
//   - she has NO future appointment (not cancelled) - a booked client is never
//     asked to book;
//   - today is between interval+2 and interval+14 days after her last visit.
//     One window, so it is one timely nudge, not a drip; after it the 90-day
//     win-back is the next and only message;
//   - reference_id is the last visit's date: one nudge per visit, and a new
//     visit makes her eligible again next cycle.
//
// OFF by default (automations.rebook_enabled === true turns it on, in
// Settings > messages): it is a new kind of message, and she decides whether
// her clients get it. Promotional, so marketing consent is required
// (lib/marketingConsent.js), checked by the caller.

export const REBOOK_TYPE = 'rebook';
export const REBOOK_GRACE_DAYS = 2;
export const REBOOK_WINDOW_DAYS = 14;
const MIN_INTERVAL = 7;
const MAX_INTERVAL = 120;

/** The business default, from its fields: nails-only -> 21 days, anything else -> 35. */
export function defaultRebookDays(businessFields) {
  const f = Array.isArray(businessFields) ? businessFields : [];
  return f.length === 1 && f[0] === 'nails' ? 21 : 35;
}

const dayNum = (d) => Math.floor(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000);

/** Median gap in days between consecutive distinct visit dates, or null with fewer than two gaps. */
export function typicalIntervalDays(visitDates) {
  const days = [...new Set((visitDates || []).filter((d) => /^\d{4}-\d{2}-\d{2}/.test(String(d))).map((d) => String(d).slice(0, 10)))]
    .sort()
    .map(dayNum);
  const gaps = [];
  for (let i = 1; i < days.length; i++) gaps.push(days[i] - days[i - 1]);
  const usable = gaps.filter((g) => g >= MIN_INTERVAL && g <= MAX_INTERVAL);
  if (usable.length < 2) return null;
  usable.sort((a, b) => a - b);
  const mid = Math.floor(usable.length / 2);
  return usable.length % 2 ? usable[mid] : Math.round((usable[mid - 1] + usable[mid]) / 2);
}

/**
 * Who is due a rebooking nudge today.
 *
 * @param {object} p
 * @param {Array<{client_id: any, date: any, tenant_id: any, service?: any, confirmation_status?: any}>} p.appointments  every appointment (complete read)
 * @param {string} p.today  'YYYY-MM-DD' (Israel)
 * @param {(tenantId: string) => number} p.defaultDaysFor
 * @returns {Array<{clientId, tenantId, lastDate, lastService, interval, daysSince}>}
 */
export function rebookCandidates({ appointments, today, defaultDaysFor }) {
  const byClient = new Map();
  for (const a of appointments || []) {
    if (!a || !a.client_id || !a.date || a.confirmation_status === 'cancelled') continue;
    const k = String(a.client_id);
    if (!byClient.has(k)) byClient.set(k, []);
    byClient.get(k).push(a);
  }
  const t = dayNum(today);
  const out = [];
  for (const [clientId, list] of byClient) {
    if (list.some((a) => String(a.date).slice(0, 10) > today)) continue; // already booked
    const past = list.filter((a) => String(a.date).slice(0, 10) <= today);
    if (!past.length) continue;
    past.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const last = past[past.length - 1];
    const lastDate = String(last.date).slice(0, 10);
    const interval = typicalIntervalDays(past.map((a) => a.date)) ?? defaultDaysFor(last.tenant_id);
    const daysSince = t - dayNum(lastDate);
    if (daysSince < interval + REBOOK_GRACE_DAYS || daysSince > interval + REBOOK_WINDOW_DAYS) continue;
    out.push({ clientId, tenantId: last.tenant_id, lastDate, lastService: last.service || '', interval, daysSince });
  }
  return out;
}

/** "3 שבועות" / "יותר משבועיים" / "יותר מ-3 שבועות" - how long it has been, the way she would say it. */
export function sinceHe(days) {
  const w = Math.floor(days / 7);
  const exact = days % 7 <= 1;
  if (w < 1) return `${days} ימים`;
  const unit = w === 1 ? 'שבוע' : w === 2 ? 'שבועיים' : `${w} שבועות`;
  if (exact) return unit;
  return w <= 2 ? `יותר מ${unit}` : `יותר מ-${unit}`;
}
