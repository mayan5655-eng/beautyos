// app/api/slots/offer/route.js
// Gap-fill: when a slot frees up, offer it to the best-matching clients at once
// via a WhatsApp claim link. First valid click wins (enforced by the DB — see
// slot-offers.sql). Sends REAL WhatsApp, so it only runs when the tenant has
// explicitly enabled gap-fill in settings (checked here, server-side, too).
//
// SECURITY: tenant comes from the AUTHENTICATED session (get_user_tenant_id),
// never the request body. Candidate selection + token generation + sending all
// happen here, so the client only says "this slot freed up" — it can't inject
// recipients. Reads/inserts use the service-role key but are always filtered by
// the session-derived tenant_id. Mirrors app/api/leads/send-bulk/route.js.

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "../../../../lib/supabase/server";
import { sendWhatsApp } from "../../../../lib/whatsapp";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MAX_CANDIDATES = 6;      // cap on how many clients get an offer
const OFFER_TTL_HOURS = 4;     // how long a claim link stays valid
const LAPSED_DAYS = 30;        // "lapsed" = not seen in this many days (or never)

// Whole days between an "YYYY-MM-DD" date and now; Infinity if never visited.
function daysSince(dateStr) {
  if (!dateStr) return Infinity;
  const t = new Date(`${dateStr}T00:00:00`).getTime();
  if (isNaN(t)) return Infinity;
  return Math.floor((Date.now() - t) / 86400000);
}

export async function POST(request) {
  try {
    // 1. Identify the caller and resolve THEIR tenant.
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ success: false, error: "לא מחובר" }, { status: 401 });
    const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
    if (!tenantId) return Response.json({ success: false, error: "לא זוהה עסק" }, { status: 400 });

    // 2. Validate the freed slot.
    const body = await request.json().catch(() => ({}));
    const service = typeof body.service === "string" ? body.service.trim() : "";
    const slotDate = typeof body.date === "string" ? body.date : "";
    const slotHour = Number.parseInt(body.hour, 10);
    const duration = body.duration != null ? Number(body.duration) : null;
    const excludeClientId = body.cancelledClientId ? String(body.cancelledClientId) : null;
    if (!slotDate || !Number.isFinite(slotHour)) {
      return Response.json({ success: false, error: "פרטי תור חסרים" }, { status: 400 });
    }

    // 3. Server-side toggle check (defense in depth — nothing sends when off).
    const { data: settingsRow } = await admin
      .from("settings").select("gap_fill_enabled").eq("tenant_id", tenantId).maybeSingle();
    if (!settingsRow || settingsRow.gap_fill_enabled !== true) {
      return Response.json({ success: true, skipped: true, reason: "disabled", sent: 0 });
    }

    // 4. Load this tenant's clients, appointment history, and active waitlist.
    const [{ data: clients }, { data: appts }, { data: waitlistRows }] = await Promise.all([
      admin.from("clients").select("id, name, phone").eq("tenant_id", tenantId),
      admin.from("appointments").select("client_id, service, date").eq("tenant_id", tenantId),
      admin.from("waitlist").select("client_id, client_name, phone, service").eq("tenant_id", tenantId).eq("status", "waiting"),
    ]);
    const clientById = new Map((clients || []).map((c) => [String(c.id), c]));

    // Last visit per client + who has had the freed service before.
    const lastVisit = new Map();
    const hadService = new Set();
    for (const a of appts || []) {
      if (!a.client_id) continue;
      const k = String(a.client_id);
      if (a.date && (!lastVisit.has(k) || a.date > lastVisit.get(k))) lastVisit.set(k, a.date);
      if (service && a.service === service) hadService.add(k);
    }

    // Build candidates in the required priority order, deduped by client + phone.
    const seenClient = new Set();
    const seenPhone = new Set();
    const candidates = [];
    const add = (clientId, name, phone) => {
      if (candidates.length >= MAX_CANDIDATES) return;
      const cid = clientId ? String(clientId) : null;
      const ph = (phone || "").trim();
      if (!ph) return;                                   // no phone -> can't reach
      if (cid && cid === excludeClientId) return;        // skip who just cancelled
      if (cid && seenClient.has(cid)) return;
      if (seenPhone.has(ph)) return;
      if (cid) seenClient.add(cid);
      seenPhone.add(ph);
      candidates.push({ clientId: cid, name: name || null, phone: ph });
    };
    // Furthest-lapsed first.
    const byLapsed = (ids) =>
      [...ids].sort((a, b) => daysSince(lastVisit.get(b)) - daysSince(lastVisit.get(a)));

    // (a) Waitlist entries matching the freed service — the strongest signal.
    for (const w of waitlistRows || []) {
      if (service && w.service && w.service !== service) continue;
      const c = w.client_id ? clientById.get(String(w.client_id)) : null;
      add(w.client_id, w.client_name || c?.name, w.phone || c?.phone);
    }
    // (b) Lapsed clients (not seen in LAPSED_DAYS+), furthest back first.
    const lapsedIds = byLapsed((clients || [])
      .map((c) => String(c.id))
      .filter((cid) => daysSince(lastVisit.get(cid)) >= LAPSED_DAYS));
    for (const cid of lapsedIds) { const c = clientById.get(cid); if (c) add(cid, c.name, c.phone); }
    // (c) Clients who had this service before, furthest back first.
    for (const cid of byLapsed([...hadService])) { const c = clientById.get(cid); if (c) add(cid, c.name, c.phone); }

    if (candidates.length === 0) {
      return Response.json({ success: true, sent: 0, reason: "no_candidates" });
    }

    // 5 + 6. One offer row per candidate (DB generates the unique token), then a
    //        WhatsApp with that candidate's claim link.
    const origin =
      request.headers.get("origin") ||
      (request.headers.get("host") ? `https://${request.headers.get("host")}` : "");
    const expiresAt = new Date(Date.now() + OFFER_TTL_HOURS * 3600 * 1000).toISOString();
    const hh = String(slotHour).padStart(2, "0");
    const [yy, mm, dd] = slotDate.split("-");
    const niceDate = dd && mm ? `${dd}/${mm}` : slotDate;

    let sent = 0, failed = 0;
    for (const cand of candidates) {
      const { data: offer, error: insErr } = await admin
        .from("slot_offers")
        .insert({
          tenant_id: tenantId,
          slot_date: slotDate,
          slot_hour: slotHour,
          service: service || null,
          duration,
          client_id: cand.clientId,
          client_name: cand.name,
          phone: cand.phone,
          status: "sent",
          expires_at: expiresAt,
        })
        .select("token")
        .single();
      if (insErr || !offer?.token) { failed++; continue; }

      const claimUrl = `${origin}/claim/${offer.token}`;
      const message =
        `שלום${cand.name ? ` ${cand.name}` : ""}! ✦\n` +
        `התפנה תור${service ? ` ל${service}` : ""} ב-${niceDate} בשעה ${hh}:00.\n` +
        `רוצה אותו? לחצי כאן לתפוס — הראשונה שתלחץ, התור שלה:\n${claimUrl}`;

      const res = await sendWhatsApp(cand.phone, message, {
        name: cand.name, type: "slot_offer", tenantId,
      });
      if (res.ok) sent++; else failed++;
    }

    return Response.json({ success: true, sent, failed, candidates: candidates.length });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
