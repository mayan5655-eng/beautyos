// lib/closingList.js
//
// "Before you go home": the few things she would otherwise remember at 23:00 in
// bed. At most three lines, and when there are none, the card says so - the
// empty sentence is the point of it. Pure: the caller passes what it already
// holds, plus endMinute (from lib/apptTime) so this file has no imports.
//
// What it looks at, and deliberately nothing more:
//   * visits that have ended, have a price, and have no receipt yet
//     (today, and the two days before, so yesterday's forgotten one shows)
//   * tomorrow's clients who have not confirmed
// It does not guess about payments made another way (a package, a bank
// transfer she has not logged): the wording says "no receipt yet", never "did
// not pay".
//
// Unanswered client messages are not here: the app does not hold inbound
// WhatsApp threads client-side, so listing them would mean a new read for a
// line that is not always true. Not built; better absent than approximate.

const MAX_ITEMS = 3;
const LOOKBACK_DAYS = 2;

/** "דנה", "דנה ולאה", "דנה, לאה ומיה", "דנה, לאה, מיה ועוד 2". */
export function joinNames(names, max = 3) {
  const list = (names || []).map((n) => String(n || "").trim()).filter(Boolean);
  if (list.length <= 1) return list[0] || "";
  if (list.length <= max) return list.slice(0, -1).join(", ") + " ו" + list[list.length - 1];
  return list.slice(0, max).join(", ") + " ועוד " + (list.length - max);
}

const pad = (n) => String(n).padStart(2, "0");
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * @param {object} p
 * @param {object[]} p.appointments   her client appointments (any status)
 * @param {object[]} p.receipts       live receipts (voids already removed)
 * @param {Date}     p.now
 * @param {(a:object)=>number|null} p.endMinute
 * @returns {{ items: {key:string,text:string,appt?:object}[], allClear: boolean }}
 */
export function buildClosingList({ appointments, receipts, now, endMinute }) {
  const today = isoDay(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const from = isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - LOOKBACK_DAYS));
  const tomorrow = isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));

  const paid = new Set((receipts || []).map((r) => String(r.appointment_id)).filter((x) => x && x !== "null"));
  const live = (appointments || []).filter((a) => a && a.confirmation_status !== "cancelled");

  const ended = (a) => {
    if (a.date < today) return true;
    if (a.date > today) return false;
    const e = endMinute(a);
    return e !== null && e !== undefined && e <= nowMin;
  };
  const noReceipt = live
    .filter((a) => a.date >= from && a.date <= today && Number(a.price) > 0 && ended(a) && !paid.has(String(a.id)))
    .sort((a, b) => (a.date + String(a.start_minute ?? "")).localeCompare(b.date + String(b.start_minute ?? "")));

  const items = [];
  const todays = noReceipt.filter((a) => a.date === today);
  const earlier = noReceipt.filter((a) => a.date < today);
  if (todays.length) items.push({ key: "no-receipt-today", text: `היום עוד אין קבלה על: ${joinNames(todays.map((a) => a.name))}.`, appt: todays[0] });
  if (earlier.length) items.push({ key: "no-receipt-earlier", text: `מהימים האחרונים עוד אין קבלה על: ${joinNames(earlier.map((a) => a.name))}.`, appt: earlier[0] });

  const unconfirmed = live.filter((a) => a.date === tomorrow && a.confirmation_status !== "confirmed");
  if (unconfirmed.length) items.push({ key: "tomorrow-unconfirmed", text: `למחר עוד לא אישרו: ${joinNames(unconfirmed.map((a) => a.name))}.` });

  const out = items.slice(0, MAX_ITEMS);
  return { items: out, allClear: out.length === 0 };
}

export const ALL_CLEAR_HE = "אין כלום שמחכה לך. אפשר ללכת הביתה.";
