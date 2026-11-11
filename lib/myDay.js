// lib/myDay.js
//
// "היום שלי": the one card for the morning. Pure: the caller passes what the dashboard already holds (nothing is fetched here),
// plus startMinute / endMinute / isPersonal so this file has no imports of its own beyond closingList.
//
// It answers three questions, in her voice and in this order:
//   1. who is coming today, at what time, and how long she is free between them
//   2. what needs her: a visit with no payment recorded, tomorrow's client who has not confirmed, a lead nobody answered
//   3. for each of those, ONE action (pay / remind / call back)
// It never sends anything. "remind" opens WhatsApp with the message already written (the same path as the calendar's reminder
// button), "call" is a tel: link, "pay" opens the cashier on that visit.
//
// Rows are capped (see CAPS) so a tenant with thousands of rows renders a screenful, and everything that does not fit is
// counted ("ועוד N") and left to the "דורש תשומת לב" list further down, which still has all of it.

import { unpaidVisits } from "./closingList.js";
import { tr } from "./i18n/tr.ts";

export const MIN_GAP_MINUTES = 20;
export const LEAD_WINDOW_DAYS = 14;
export const CAPS = { pay: 2, remind: 3, call: 2, total: 5 };

const pad = (n) => String(n).padStart(2, "0");
export const hhmm = (m) => (m === null || m === undefined || !Number.isFinite(Number(m)) ? "" : `${pad(Math.floor(Number(m) / 60) % 24)}:${pad(Number(m) % 60)}`);

/** 45 -> "45 דק׳", 60 -> "שעה", 90 -> "שעה וחצי", 120 -> "שעתיים", 150 -> "שעתיים וחצי", 200 -> "3 שע׳ ו-20 דק׳". */
export function durationHe(min) {
  const m = Math.round(Number(min) || 0);
  if (m < 60) return tr("{0} דק׳", [m]);
  const h = Math.floor(m / 60), r = m % 60;
  const hours = h === 1 ? tr("שעה") : h === 2 ? tr("שעתיים") : tr("{0} שע׳", [h]);
  if (r === 0) return hours;
  if (r === 30 && h <= 2) return tr("{0} וחצי", [hours]);
  return tr("{0} שע׳ ו-{1} דק׳", [h, r]);
}

/** Whole days, not hours, once it is more than a day: "מהבוקר", "מאתמול", "כבר 3 ימים". */
export function waitingHe(since, now) {
  const t = since ? new Date(since).getTime() : NaN;
  if (!Number.isFinite(t)) return "";
  const mins = Math.max(0, Math.floor((now.getTime() - t) / 60000));
  if (mins < 60) return tr("פנתה לפני כמה דקות");
  if (mins < 24 * 60) return tr("פנתה לפני {0}", [Math.floor(mins / 60) === 1 ? "שעה" : Math.floor(mins / 60) + " שעות"]);
  const days = Math.floor(mins / (24 * 60));
  return days === 1 ? tr("פנתה אתמול") : tr("פנתה לפני {0} ימים", [days]);
}

/** Digits only, Israeli local 05x -> international, for a tel: link that works from any in-app browser. */
export function telHref(phone) {
  const d = String(phone || "").replace(/[^\d+]/g, "");
  return d.length >= 7 ? `tel:${d}` : "";
}

/**
 * Today's timeline.
 * @returns {{rows:Record<string, any>[], count:number, firstStart:number|null, lastEnd:number|null, freeMinutes:number, headline:string}}
 */
export function buildTimeline({ entries, now, startMinute, endMinute, isPersonal }) {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const live = (entries || [])
    .filter((a) => a && a.confirmation_status !== "cancelled" && startMinute(a) !== null)
    .sort((a, b) => startMinute(a) - startMinute(b));
  let nextAssigned = false;
  const rows = live.map((a, i) => {
    const s = startMinute(a);
    const e = endMinute(a) ?? s;
    const personal = !!isPersonal(a);
    const done = e <= nowMin;
    const current = !done && s <= nowMin;
    let state = done ? "done" : current ? "now" : "later";
    if (state === "later" && !nextAssigned) { state = "next"; nextAssigned = true; }
    const nxt = live[i + 1];
    const nextStart = nxt ? startMinute(nxt) : null;
    const gap = nextStart !== null ? nextStart - e : 0;
    // A gap is only news while it is still ahead of her.
    const gapAfter = nxt && gap >= MIN_GAP_MINUTES && nextStart > nowMin ? { minutes: Math.min(gap, nextStart - Math.max(e, nowMin)), until: nxt.name || "" } : null;
    return {
      id: a.id, appt: a, personal, state, time: hhmm(s), end: hhmm(e),
      title: personal ? (String(a.note || "").trim() || tr("אירוע אישי")) : (a.name || tr("לקוחה")),
      sub: personal ? tr("אישי") : (a.service || ""),
      confirmed: a.confirmation_status === "confirmed",
      gapAfter: gapAfter && gapAfter.minutes >= MIN_GAP_MINUTES ? gapAfter : null,
    };
  });
  const clientRows = rows.filter((r) => !r.personal);
  const freeMinutes = rows.reduce((t, r) => t + (r.gapAfter ? r.gapAfter.minutes : 0), 0);
  const n = clientRows.length;
  const first = rows.length ? startMinute(live[0]) : null;
  const last = rows.length ? Math.max(...live.map((a) => endMinute(a) ?? 0)) : null;
  let headline;
  if (n === 0) headline = tr("אין תורים היום. יום רגוע ☕");
  else if (n === 1) headline = tr("תור אחד היום, ב-{0}", [hhmm(startMinute(clientRows[0].appt))]);
  else headline = tr("{0} תורים היום, מ-{1} עד {2}", [n, hhmm(startMinute(clientRows[0].appt)), hhmm(Math.max(...clientRows.map((r) => endMinute(r.appt) ?? 0)))]);
  return { rows, count: n, firstStart: first, lastEnd: last, freeMinutes, headline };
}

/**
 * What needs her, in order: payments, then tomorrow's reminders, then leads. One action each.
 * @returns {{items:Record<string, any>[], more:number}}
 */
export function buildNeeds({ clientAppts, tomorrowAppts, receipts, leads, leadsReady = true, paymentsReady = true, now, endMinute, startMinute, hasPhone }) {
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  // Receipts arrive with the history load, after today's visits. Until then every ended visit would look unpaid, so say nothing.
  const pay = !paymentsReady ? [] : unpaidVisits({ appointments: clientAppts, receipts, now, endMinute }).map((a) => ({
    key: `pay:${a.id}`, kind: "pay", appt: a, who: a.name || tr("לקוחה"),
    text: tr("{0}: עוד אין תשלום רשום", [a.name || "לקוחה"]),
    sub: `${a.date === today ? tr("היום") : tr("מהימים האחרונים")}${a.service ? ` · ${a.service}` : ""} · ₪${Number(a.price).toLocaleString("en-US")}`,
    action: tr("רישום תשלום"),
  }));
  const remind = (tomorrowAppts || [])
    .filter((a) => a && a.confirmation_status !== "cancelled" && a.confirmation_status !== "confirmed" && hasPhone(a))
    .sort((a, b) => Number(!!a.confirmation_sent) - Number(!!b.confirmation_sent) || (startMinute(a) ?? 0) - (startMinute(b) ?? 0))
    .map((a) => ({
      key: `remind:${a.id}`, kind: "remind", appt: a, who: a.name || tr("לקוחה"),
      text: tr("{0}: מחר ב-{1}, עוד לא אישרה", [a.name || "לקוחה", hhmm(startMinute(a))]),
      sub: a.confirmation_sent ? tr("התזכורת כבר הוכנה, אפשר להזכיר שוב") : tr("עוד לא נשלחה לה תזכורת"),
      action: a.confirmation_sent ? tr("הזכירי שוב") : tr("תזכורת בוואטסאפ"),
    }));
  const cutoff = now.getTime() - LEAD_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const call = !leadsReady ? [] : (leads || [])
    .filter((l) => l && (l.status === "new" || l.status === "no_answer") && telHref(l.phone))
    .map((l) => ({ l, at: l.received_at || l.created_at || null }))
    .filter(({ at }) => { if (!at) return true; const t = new Date(at).getTime(); return !Number.isFinite(t) || t >= cutoff; })
    .sort((x, y) => (new Date(x.at || 0).getTime() || 0) - (new Date(y.at || 0).getTime() || 0))
    .map(({ l, at }) => ({
      key: `call:${l.id}`, kind: "call", lead: l, who: l.name || tr("פנייה חדשה"),
      text: tr("{0}: עוד לא ענית לה", [l.name || "פנייה חדשה"]),
      sub: [waitingHe(at, now), l.service_interest].filter(Boolean).join(" · "),
      action: tr("חיוג חזרה"), href: telHref(l.phone),
    }));
  const all = [...pay, ...remind, ...call];
  const taken = { pay: 0, remind: 0, call: 0 };
  const items = [];
  for (const it of all) {
    if (items.length >= CAPS.total) break;
    if (taken[it.kind] >= CAPS[it.kind]) continue;
    taken[it.kind]++;
    items.push(it);
  }
  return { items, more: all.length - items.length };
}

/** The whole card. `isEmpty` is true only when there is truly nothing: no visits today and nothing waiting. */
export function buildMyDay(p) {
  const timeline = buildTimeline(p);
  const needs = buildNeeds(p);
  return { ...timeline, needs: needs.items, more: needs.more, isEmpty: timeline.rows.length === 0 && needs.items.length === 0 };
}

/** Per-tenant switch, same place as the other feature flags. On unless she (or an operator) turned it off. */
export function myDayEnabled(settings) {
  const f = settings?.automations?.feature_flags;
  return !(f && f.my_day === false);
}
