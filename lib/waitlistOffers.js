// lib/waitlistOffers.js
//
// Smart waitlist. When an appointment is cancelled (by the client's own link, or by her in the app), the people on the waiting list
// whom the slot FITS get one WhatsApp offer with their own claim link; the first to tap it gets the slot (app/api/claim, guarded by the
// database), and everyone else is told, kindly, that it went. She gets one line saying what happened.
//
// OFF by default, per business: settings.automations.waitlist_offers must be exactly true (Settings > הודעות). With it off nothing in
// here reads the waiting list or writes anything.
//
// Every gate that already protects clients applies, and a refusal is a reason, never an exception:
//   - the master pause (automations.paused) and a break (automations.quiet);
//   - Shabbat and night (21:00 to 08:00 Israel): not sent; she is told who is waiting, and the existing "offer it?" card still works;
//   - a slot under two hours away, or one that is taken again by the time this runs;
//   - anyone who asked to be removed (clients.marketing_opted_out_at) never gets an offer, even though they are on the list;
//   - a daily cap per business (automations.waitlist_daily_cap, default 6 offers in 24 hours), counted from the message log;
//   - the per-recipient cap across businesses (lib/outboundCap.js, type waitlist_offer), a phone a stranger typed into a booking page;
//   - sendWhatsApp's own rules: a demo tenant sends nothing, a reserved test number only ever reaches the manual queue, and while the
//     platform's automatic sending is off the offer waits in "הודעות מוכנות לשליחה".
// What she is told never claims more than happened: "sent" only for a message the provider accepted, "waiting" for a queued one.
//
// All database and WhatsApp access is passed in (db, send, notify) so the plain-node test runs it against fakes.

import { randomBytes } from "node:crypto";
import { clinicName } from "./clinicName.ts";
import { startMinute as apptStart, overlaps, fmtTime } from "./apptTime.ts";
import { phoneVariants } from "./clientData.ts";
import { minutesUntilIsrael } from "./ownerQuestions.js";
import { MARKETING_FOOTER } from "./marketingConsent.js";
import { chooseRecipients, offerQuietReason, phoneKey } from "./waitlistMatch.js";

export const OFFER_TYPE = "waitlist_offer";
export const TAKEN_TYPE = "waitlist_taken";
export const TOKEN_PREFIX = "wl"; // hex tokens never start with "wl", so a waitlist offer is recognisable by its link alone
export const DEFAULT_DAILY_CAP = 6;
export const MAX_PER_SLOT = 4;
export const OFFER_TTL_MINUTES = 240;
export const MIN_LEAD_MINUTES = 120;

export function waitlistSettings(automations) {
  const a = automations && typeof automations === "object" ? automations : {};
  const cap = Number(a.waitlist_daily_cap);
  return { enabled: a.waitlist_offers === true, paused: a.paused === true, quiet: a.quiet === true, cap: Number.isFinite(cap) && cap >= 1 && cap <= 30 ? Math.floor(cap) : DEFAULT_DAILY_CAP };
}

const niceDate = (date) => { const [, m, d] = String(date).split("-"); return d && m ? `${d}/${m}` : String(date); };
const plural = (n, one, many) => (n === 1 ? one : many);

export function offerMessage({ name, clinic, service, date, minute, url }) {
  return (
    `שלום${name ? ` ${name}` : ""}! 🌸\n` +
    `כאן ${clinic}. את ברשימת ההמתנה שלנו, והתפנה תור${service ? ` ל${service}` : ""} ב-${niceDate(date)} בשעה ${fmtTime(minute)}.\n` +
    `רוצה אותו? אפשר לתפוס כאן, והראשונה שלוחצת מקבלת:\n${url}\n\n${MARKETING_FOOTER}`
  );
}

export function takenMessage({ name, clinic, service, date, minute }) {
  return (
    `שלום${name ? ` ${name}` : ""} 🌸\n` +
    `התור${service ? ` ל${service}` : ""} ב-${niceDate(date)} בשעה ${fmtTime(minute)} כבר נתפס, מישהי הקדימה אותך הפעם.\n` +
    `את נשארת ברשימת ההמתנה של ${clinic}, ונעדכן אותך כשיתפנה עוד תור.`
  );
}

/** Honest summary of what a send returned: sent (provider accepted), queued (waiting in her list), blocked (test/demo), failed. */
export function classifySend(res) {
  if (res?.ok) return "sent";
  if (res?.queued) return "queued";
  if (res?.demoBlocked) return "blocked";
  return "failed";
}

async function dayIsFree(db, tenantId, date, minute, duration) {
  const { data, error } = await db.from("appointments").select("start_minute, hour, duration, confirmation_status").eq("tenant_id", tenantId).eq("date", date);
  if (error) return null;
  const dur = Number(duration) > 0 ? Number(duration) : 60;
  return !(data || []).some((a) => {
    if (a.confirmation_status === "cancelled") return false;
    const st = apptStart(a);
    if (st === null) return false;
    return overlaps(st, st + (Number(a.duration) > 0 ? Number(a.duration) : 60), minute, minute + dur);
  });
}

/**
 * Offer a slot that just freed to the waiting list. Never throws; the result says what happened.
 * @param {object} p
 * @param {any} p.db        service-role supabase client
 * @param {Function} p.send sendWhatsApp(phone, text, opts)
 * @param {Function} p.notify notifyOwner({ tenantId, kind, title, body, settingsRow })
 * @param {string} p.tenantId
 * @param {object} p.appt   the cancelled appointment { date, start_minute|hour, duration, service, client_id, client_phone }
 * @param {string} p.baseUrl  the app's own public URL (never taken from the request: the link goes into a message in her name)
 */
export async function offerFreedSlot({ db, send, notify, tenantId, appt, baseUrl, now = new Date(), newToken = () => TOKEN_PREFIX + randomBytes(16).toString("hex") }) {
  const done = (status, extra = {}) => ({ status, offered: 0, ...extra });
  try {
    if (!tenantId || !appt) return done("bad_input");
    if (appt.kind === "personal") return done("personal_block");
    const { data: settingsRow } = await db.from("settings").select("business_name, business_phone, automations").eq("tenant_id", tenantId).maybeSingle();
    const cfg = waitlistSettings(settingsRow?.automations);
    if (!cfg.enabled) return done("off");
    if (cfg.paused) return done("paused");
    if (cfg.quiet) return done("break");

    const minute = apptStart(appt);
    const date = String(appt.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || minute == null) return done("bad_slot");
    const service = typeof appt.service === "string" ? appt.service.trim() : "";
    if (!service) return done("no_service");
    if (minutesUntilIsrael(date, minute, now) < MIN_LEAD_MINUTES) return done("too_soon");
    const duration = Number(appt.duration) > 0 ? Number(appt.duration) : 60;

    const free = await dayIsFree(db, tenantId, date, minute, duration);
    if (free === null) return done("calendar_unreadable");
    if (!free) return done("slot_taken");

    const { data: waiting, error: wErr } = await db.from("waitlist").select("*").eq("tenant_id", tenantId).eq("status", "waiting").eq("service", service);
    if (wErr) return done("waitlist_unreadable");
    const slot = { date, startMinute: minute, service };

    // Who is already holding an offer for this slot (from this feature or the "offer it?" card) is never offered it twice.
    const { data: existing } = await db.from("slot_offers").select("phone, status").eq("tenant_id", tenantId).eq("slot_date", date).eq("slot_start_minute", minute).in("status", ["sent", "claimed"]);
    const alreadyOfferedPhones = new Set((existing || []).map((o) => phoneKey(o.phone)).filter(Boolean));

    const variants = [...new Set((waiting || []).flatMap((w) => phoneVariants(w.phone)))];
    const optedOutPhones = new Set();
    if (variants.length) {
      const { data: cl, error: cErr } = await db.from("clients").select("phone, marketing_opted_out_at").eq("tenant_id", tenantId).in("phone", variants);
      if (cErr) return done("clients_unreadable"); // cannot prove nobody opted out: send nothing
      for (const c of cl || []) if (c.marketing_opted_out_at) optedOutPhones.add(phoneKey(c.phone));
    }

    // The person who just cancelled is not offered her own slot back, even if she is on the list under another entry.
    let cancelledPhone = appt.client_phone || null;
    if (!cancelledPhone && appt.client_id) {
      const { data: cc } = await db.from("clients").select("phone").eq("tenant_id", tenantId).eq("id", appt.client_id).maybeSingle();
      cancelledPhone = cc?.phone || null;
    }
    const { chosen, skipped } = chooseRecipients(waiting, { slot, cancelledClientId: appt.client_id, cancelledPhone, optedOutPhones, alreadyOfferedPhones });
    if (!chosen.length) return done("no_match", { skipped });

    const when = `${service} ב-${niceDate(date)} בשעה ${fmtTime(minute)}`;
    const quiet = offerQuietReason(now);
    if (quiet) {
      await notify({
        tenantId, kind: "waitlist", settingsRow,
        title: "התפנה תור ויש מי שמחכה",
        body: `התפנה ${when}. ${chosen.length === 1 ? "אחת" : chosen.length} מרשימת ההמתנה ${plural(chosen.length, "מתאימה", "מתאימות")}, אבל בשבת ובלילה אני לא שולחת הודעות. אפשר להציע את התור בבוקר מהיומן.`,
      }).catch(() => {});
      return done("quiet_hours", { reason: quiet, matching: chosen.length });
    }

    const since = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
    const { count: usedCount, error: capErr } = await db.from("whatsapp_messages").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("message_type", OFFER_TYPE).gte("created_at", since);
    if (capErr) return done("cap_unreadable"); // a cap that cannot be read is a cap that cannot be kept
    const room = cfg.cap - (usedCount || 0);
    if (room <= 0) {
      await notify({ tenantId, kind: "waitlist", settingsRow, title: "התפנה תור, הגעת לתקרה היומית", body: `התפנה ${when}. כבר יצאו ${usedCount} הצעות ב-24 השעות האחרונות, וזו התקרה שהגדרת, אז לא שלחתי עוד. אפשר להציע ידנית מהיומן.` }).catch(() => {});
      return done("daily_cap", { matching: chosen.length });
    }

    const clinic = clinicName(settingsRow);
    const expiresAt = new Date(Math.min(now.getTime() + OFFER_TTL_MINUTES * 60000, now.getTime() + (minutesUntilIsrael(date, minute, now) - 15) * 60000)).toISOString();
    const counts = { sent: 0, queued: 0, blocked: 0, failed: 0 };
    for (const w of chosen.slice(0, Math.min(MAX_PER_SLOT, room))) {
      const token = newToken();
      const { error: insErr } = await db.from("slot_offers").insert({
        tenant_id: tenantId, slot_date: date, slot_start_minute: minute, slot_hour: Math.floor(minute / 60), service, duration,
        client_id: w.client_id || null, client_name: w.client_name || null, phone: w.phone, token, status: "sent", expires_at: expiresAt,
      });
      if (insErr) { console.error("[waitlistOffers] offer row failed:", insErr.message); counts.failed++; continue; }
      const text = offerMessage({ name: w.client_name, clinic, service, date, minute, url: `${baseUrl}/claim/${token}` });
      let res;
      try { res = await send(w.phone, text, { name: w.client_name || null, type: OFFER_TYPE, tenantId }); } catch (e) { res = { ok: false, error: String(e?.message || e) }; }
      const kind = classifySend(res);
      counts[kind]++;
      // A link nobody received must not stay live: it would only let someone who was never told take the slot.
      if (kind === "failed" || kind === "blocked") await db.from("slot_offers").update({ status: "cancelled" }).eq("token", token);
    }
    const offered = counts.sent + counts.queued;
    if (offered === 0) return done("nothing_offered", { counts, matching: chosen.length });

    const parts = [];
    if (counts.sent) parts.push(`שלחתי הצעה ל${counts.sent === 1 ? "אחת" : `-${counts.sent}`} מרשימת ההמתנה`);
    if (counts.queued) parts.push(`${counts.queued} ${plural(counts.queued, "הצעה מחכה", "הצעות מחכות")} ב"הודעות מוכנות לשליחה", ועוד לא ${plural(counts.queued, "יצאה", "יצאו")}`);
    await notify({
      tenantId, kind: "waitlist", settingsRow,
      title: counts.sent ? "הצעתי את התור שהתפנה" : "הצעות לתור שהתפנה מחכות לך",
      body: `התפנה ${when}. ${parts.join(". ")}. הראשונה שתלחץ על הקישור מקבלת את התור, ואעדכן אותך.`,
    }).catch(() => {});
    return done("offered", { offered, counts, matching: chosen.length, skipped });
  } catch (e) {
    console.error("[waitlistOffers] offerFreedSlot failed:", e?.message || String(e));
    return done("error");
  }
}

/**
 * After a waiting-list offer was claimed: take the winner off the list, tell the others kindly that it went, tell her in one line.
 * Not for offers from the "offer it?" card (their tokens have no prefix): those people did not ask to be told.
 */
export async function afterWaitlistWin({ db, send, notify, tenantId, token, claimed, now = new Date() }) {
  const done = (status, extra = {}) => ({ status, ...extra });
  try {
    if (!String(token || "").startsWith(TOKEN_PREFIX)) return done("not_waitlist");
    const minute = apptStart({ start_minute: claimed.slot_start_minute, hour: claimed.slot_hour });
    if (minute === null) return done("bad_slot");
    const service = claimed.service || "";

    // The winner is no longer waiting: she has the appointment.
    const wv = phoneVariants(claimed.phone);
    if (wv.length) {
      const { error } = await db.from("waitlist").update({ status: "booked" }).eq("tenant_id", tenantId).eq("status", "waiting").eq("service", service).in("phone", wv);
      if (error) console.warn("[waitlistOffers] could not mark the winner as booked:", error.message);
    }

    const { data: others } = await db.from("slot_offers").select("token, phone, client_name, status, claimed_at")
      .eq("tenant_id", tenantId).eq("slot_date", claimed.slot_date).eq("slot_start_minute", minute).like("token", `${TOKEN_PREFIX}%`).neq("token", token);
    const { data: settingsRow } = await db.from("settings").select("business_name, business_phone, automations").eq("tenant_id", tenantId).maybeSingle();
    const clinic = clinicName(settingsRow);
    const losers = []; const seen = new Set();
    for (const o of others || []) {
      if (o.claimed_at || !["sent", "superseded"].includes(o.status)) continue;
      const k = phoneKey(o.phone);
      if (!k || seen.has(k) || k === phoneKey(claimed.phone)) continue;
      seen.add(k); losers.push(o);
    }
    const counts = { sent: 0, queued: 0, blocked: 0, failed: 0 };
    for (const o of losers) {
      await db.from("slot_offers").update({ status: "superseded" }).eq("token", o.token).eq("status", "sent");
      let res;
      try { res = await send(o.phone, takenMessage({ name: o.client_name, clinic, service, date: claimed.slot_date, minute }), { name: o.client_name || null, type: TAKEN_TYPE, tenantId }); } catch (e) { res = { ok: false }; }
      counts[classifySend(res)]++;
    }
    const who = claimed.client_name || "לקוחה";
    const bits = [`${who} תפסה את התור ל${service || "טיפול"} ב-${niceDate(claimed.slot_date)} בשעה ${fmtTime(minute)}, והוא כבר ביומן.`];
    if (counts.sent) bits.push(`${counts.sent} ${plural(counts.sent, "אחרת קיבלה", "אחרות קיבלו")} הודעה עדינה שהתור נתפס.`);
    if (counts.queued) bits.push(`${counts.queued} ${plural(counts.queued, "הודעה עדינה על שהתור נתפס מחכה", "הודעות עדינות על שהתור נתפס מחכות")} ב"הודעות מוכנות לשליחה".`);
    await notify({ tenantId, kind: "waitlist", settingsRow, title: "התור שהתפנה התמלא", body: bits.join(" ") }).catch(() => {});
    return done("won", { losers: losers.length, counts });
  } catch (e) {
    console.error("[waitlistOffers] afterWaitlistWin failed:", e?.message || String(e));
    return done("error");
  }
}
