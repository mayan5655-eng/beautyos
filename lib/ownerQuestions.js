// lib/ownerQuestions.js
//
// owner_questions: the "one question" card on her home screen. A question is
// a yes/no she answers; a yes runs the matching route with her session
// (gap_fill -> app/api/slots/offer). Nothing here ever sends a message.

import { readAllRows } from "./pagedRead.js";
import { canMarket } from "./marketingConsent.js";
import { startMinute } from "./apptTime.ts";

// Would a YES on this question reach anyone? Checked BEFORE the question is
// created - an empty compose window is worse than no question at all. Both
// insert paths (app/api/questions for the app, askGapFillAfterClientCancel
// below for a client's own cancel link) run this check first. The filters mirror the yes-path
// routes; if those change, change these with them:
//   gap_fill  -> app/api/slots/offer   (waitlist match / lapsed 30d+ / had this service)
//   comeback  -> app/api/clients/comeback (last visit before the break, within 240d)
export async function hasCandidates(admin, tenantId, kind, payload) {
  const today = new Date().toISOString().slice(0, 10);
  // Paged: a plain select returns at most max_rows (1,000) without saying so, so a
  // tenant with a long history had her "last visit" worked out from a fragment and
  // was offered questions that reach nobody (or none that do). lib/pagedRead.js.
  const [cl, ap] = await Promise.all([
    readAllRows(admin, "clients", { columns: "*", filter: (q) => q.eq("tenant_id", tenantId) }),
    readAllRows(admin, "appointments", { columns: "id, client_id, service, date", filter: (q) => q.eq("tenant_id", tenantId) }),
  ]);
  // A read that could not be finished is an unknown answer, not an empty one.
  if (cl.error || ap.error || !cl.complete || !ap.complete) throw new Error("could not read the history needed to check who a question would reach");
  const clients = cl.data;
  const appts = ap.data;
  const lastVisit = new Map();
  const hadService = new Set();
  for (const a of appts || []) {
    if (!a.client_id || !a.date || a.date > today) continue;
    const k = String(a.client_id);
    if (!lastVisit.has(k) || a.date > lastVisit.get(k)) lastVisit.set(k, a.date);
    if (kind === "gap_fill" && payload.service && a.service === payload.service) hadService.add(k);
  }
  const daysSince = (d) => d ? Math.floor((Date.now() - new Date(`${d}T00:00:00`).getTime()) / 86400000) : Infinity;

  if (kind === "gap_fill") {
    const { data: waitlist } = await admin
      .from("waitlist").select("client_id, phone, service")
      .eq("tenant_id", tenantId).eq("status", "waiting");
    const excluded = payload.cancelledClientId ? String(payload.cancelledClientId) : null;
    for (const w of waitlist || []) {
      if (payload.service && w.service && w.service !== payload.service) continue;
      if (w.phone || (w.client_id && (clients || []).some((c) => String(c.id) === String(w.client_id) && c.phone))) return true;
    }
    // Waitlist entries above asked to be told, so they stay. Everyone else is marketing: consent required (lib/marketingConsent.js).
    return (clients || []).some((c) => {
      if (!c.phone || String(c.id) === excluded || !canMarket(c)) return false;
      const cid = String(c.id);
      return daysSince(lastVisit.get(cid)) >= 30 || hadService.has(cid);
    });
  }

  // comeback: someone whose last visit predates the break, within 240 days of it.
  const quietStart = payload.quiet_start;
  if (!quietStart) return false;
  const floorMs = new Date(`${quietStart}T00:00:00`).getTime() - 240 * 86400000;
  return (clients || []).some((c) => {
    if (c.status === "archived" || !c.phone || !canMarket(c)) return false;
    const lv = lastVisit.get(String(c.id));
    if (!lv || lv > quietStart) return false;
    return new Date(`${lv}T00:00:00`).getTime() >= floorMs;
  });
}

/**
 * A client cancelled through her own link (app/api/confirm). The slot is free
 * and the owner was told (lib/cancelNotify.js) - but until now nothing offered
 * it to anyone unless SHE was the one who cancelled in the app. This asks her,
 * the same card and the same yes-path as an in-app cancel with auto mode off.
 *
 * It ASKS, even when gap_fill_enabled is on: the automatic offer runs from her
 * signed-in app (app/api/slots/offer needs her session), and a public link
 * must never be able to make messages go out in her name.
 *
 * Skips: master pause, a break (automations.quiet), a slot under 2 hours away,
 * the same slot already asked about, and nobody a yes would reach.
 * Best-effort: returns a reason string, never throws.
 */
export async function askGapFillAfterClientCancel(admin, { tenantId, appt, now = new Date() }) {
  try {
    const { data: st } = await admin.from("settings").select("automations").eq("tenant_id", tenantId).maybeSingle();
    const autos = st?.automations && typeof st.automations === "object" ? st.automations : {};
    if (autos.paused === true) return "paused";
    if (autos.quiet === true) return "quiet";
    const sm = startMinute(appt);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(appt?.date || "")) || sm == null) return "bad_slot";
    if (minutesUntilIsrael(appt.date, sm, now) < 120) return "too_soon";

    const payload = {
      date: appt.date,
      startMinute: Number(sm) || 0,
      service: typeof appt.service === "string" ? appt.service.slice(0, 120) : null,
      duration: Number(appt.duration) > 0 ? Number(appt.duration) : null,
      cancelledClientId: appt.client_id ? String(appt.client_id) : null,
    };
    const { data: dup } = await admin.from("owner_questions").select("id")
      .eq("tenant_id", tenantId).eq("kind", "gap_fill")
      .eq("payload->>date", payload.date).eq("payload->>startMinute", String(payload.startMinute)).limit(1);
    if (dup && dup.length) return "duplicate";

    if (!(await hasCandidates(admin, tenantId, "gap_fill", payload))) return "no_candidates";
    const { error } = await admin.from("owner_questions").insert({ tenant_id: tenantId, kind: "gap_fill", payload });
    if (error) { console.error("[ownerQuestions] client-cancel gap_fill insert failed:", error.message); return "insert_failed"; }
    return "asked";
  } catch (e) {
    console.error("[ownerQuestions] client-cancel gap_fill failed:", e?.message || String(e));
    return "error";
  }
}

/** Minutes from now until an Israel wall-clock date + minute (both read in Asia/Jerusalem). */
export function minutesUntilIsrael(date, minute, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
  const [y, m, d] = String(date).split("-").map(Number);
  const slot = Date.UTC(y, m - 1, d, 0, Number(minute));
  const cur = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return Math.round((slot - cur) / 60000);
}
