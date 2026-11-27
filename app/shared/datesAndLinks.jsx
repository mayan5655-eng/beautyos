"use client";
// app/shared/datesAndLinks.jsx — dates (the week of a day, Hebrew date text) and the WhatsApp link a message is sent through.
//
// Moved out of app/beautyos.jsx by scripts/extract-module.mjs, byte for byte: nothing between the two markers below was
// rewritten. app/beautyos.jsx imports every name this file exports; scripts/check-screens.mjs holds the two lists and the
// declarations equal. When a test reads app/beautyos.jsx, scripts/test-source-view.mjs puts this body back in its place.
import { withAdLabel } from "@/lib/marketingConsent";

/* @module-body */
// ============================================================
// HELPER FUNCTIONS
// ============================================================

/** The Sunday that begins the Israeli week containing `date`. Midnight, local. */
function weekSundayOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // getDay(): 0 = Sunday, so subtracting it always lands on this week's Sunday.
  d.setDate(d.getDate() - d.getDay());
  return d;
}

/**
 * The seven days of the Israeli week containing `date`: ראשון through שבת.
 *
 * SNAPS to Sunday rather than treating its argument as the first column. The
 * week used to start on whatever day it happened to be, so the columns shifted
 * every morning and "the week" meant a different seven days depending on when
 * she opened it. Snapping here rather than at the call sites makes it
 * impossible for any caller to disagree about where the week begins - which is
 * exactly how the six-day version drifted into four places.
 */
function getWeekDates(date) {
  const sunday = weekSundayOf(date);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    days.push(d);
  }
  return days;
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

function formatDateHe(date) {
  return `${date.getDate()}/${date.getMonth()+1}`;
}

function waLink(phone) {
  if (!phone) return null;
  const clean = phone.replace(/\D/g,"");
  const intl = clean.startsWith("0") ? "972" + clean.slice(1) : clean;
  return `https://wa.me/${intl}`;
}

// "2026-10-25" -> "25.10.2026" for Hebrew screens; anything else comes back as it was.
function fmtDateHe(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? `${Number(m[3])}.${Number(m[2])}.${m[1]}` : String(iso || "");
}

function waMsg(phone, msg) {
  if (!phone) return null;
  const clean = phone.replace(/\D/g,"");
  const intl = clean.startsWith("0") ? "972" + clean.slice(1) : clean;
  // A promotional message opens with "פרסומת" (lib/marketingConsent.js withAdLabel); anything else is unchanged.
  return `https://wa.me/${intl}?text=${encodeURIComponent(withAdLabel(msg))}`;
}
// The browser has no signing secret and must never be given one, so the signed
// links are minted by /api/confirm/link, which checks the session and that the
// appointment belongs to the caller's tenant. Returns null if that fails, so a
// caller never sends a reminder carrying a link that cannot work.
async function fetchConfirmLinks(apptId) {
  try {
    const res = await fetch(`/api/confirm/link?id=${encodeURIComponent(apptId)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) return null;
    return { confirmUrl: data.confirmUrl, cancelUrl: data.cancelUrl, rescheduleUrl: data.rescheduleUrl || null };
  } catch {
    return null;
  }
}
/* @module-end */
export {
  fetchConfirmLinks, fmtDateHe, formatDate, formatDateHe, getWeekDates, waLink, waMsg, weekSundayOf,
};
