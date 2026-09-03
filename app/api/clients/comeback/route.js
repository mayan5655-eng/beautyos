// app/api/clients/comeback/route.js
// The comeback message: after a business break (quiet mode), send a warm
// "we're back" WhatsApp to the clients who lapsed during it - the ones whose
// last visit was before the break started.
//
// Fired only by an explicit YES on the comeback owner-question; there is no
// automatic path into this route. Mirrors app/api/slots/offer: tenant from the
// AUTHENTICATED session, candidate selection entirely server-side, dryRun
// returns who-and-what without sending.

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "../../../../lib/supabase/server";
import { requireActiveTenant } from "../../../../lib/planGuard";
import { sendWhatsApp } from "../../../../lib/whatsapp";
import { clinicName } from "../../../../lib/clinicName";
import { APP_URL } from "../../../../lib/appUrl";
import { checkTenantLimit } from "../../../../lib/rateLimit";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Caps: a comeback is one message per client, once per break, to people seen
// RECENTLY-ish before it - not the whole historical book.
const MAX_RECIPIENTS = 30;
const SEEN_WITHIN_DAYS_BEFORE_QUIET = 240;

export async function POST(request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ success: false, error: "לא מחוברת" }, { status: 401 });
    const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
    if (!tenantId) return Response.json({ success: false, error: "לא זוהה עסק" }, { status: 400 });

    const guard = await requireActiveTenant(supabase);
    if (!guard.ok) return guard.response;

    const tenantLimited = checkTenantLimit(tenantId, "comeback");
    if (tenantLimited) return tenantLimited;

    const body = await request.json().catch(() => ({}));
    // The last appointment date BEFORE the break, from the owner question's
    // payload. Clients seen after it were not lost to the break.
    const quietStart = typeof body.quietStart === "string" ? body.quietStart : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(quietStart)) {
      return Response.json({ success: false, error: "חסר תאריך תחילת ההפסקה" }, { status: 400 });
    }

    const { data: settingsRows } = await admin
      .from("settings")
      .select("business_name, therapist_name, branding, automations")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const autos = settingsRows?.automations;
    if (autos && typeof autos === "object" && autos.paused === true) {
      return Response.json({ success: true, skipped: true, reason: "automations_paused", sent: 0 });
    }
    const clinic = clinicName(settingsRows);

    const [{ data: clients }, { data: appts }] = await Promise.all([
      admin.from("clients").select("id, name, phone, status").eq("tenant_id", tenantId),
      admin.from("appointments").select("client_id, date").eq("tenant_id", tenantId),
    ]);

    // Last visit per client, from appointments up to today.
    const today = new Date().toISOString().slice(0, 10);
    const lastVisit = new Map();
    for (const a of appts || []) {
      if (!a.client_id || !a.date || a.date > today) continue;
      const k = String(a.client_id);
      if (!lastVisit.has(k) || a.date > lastVisit.get(k)) lastVisit.set(k, a.date);
    }

    const floorMs = new Date(`${quietStart}T00:00:00`).getTime() - SEEN_WITHIN_DAYS_BEFORE_QUIET * 86400000;
    const seenPhone = new Set();
    const candidates = [];
    for (const c of clients || []) {
      if (candidates.length >= MAX_RECIPIENTS) break;
      if (c.status === "archived") continue;
      const ph = (c.phone || "").trim();
      if (!ph || seenPhone.has(ph)) continue;
      const lv = lastVisit.get(String(c.id));
      if (!lv) continue;                                   // never visited: not "lost to the break"
      if (lv > quietStart) continue;                        // already back, or seen during/after
      if (new Date(`${lv}T00:00:00`).getTime() < floorMs) continue; // gone long before the break
      seenPhone.add(ph);
      candidates.push({ id: String(c.id), name: c.name || null, phone: ph });
    }

    const bookingUrl = `${APP_URL}/book?t=${tenantId}`;
    const messageFor = (name) =>
      `שלום${name ? ` ${name}` : ""}! ✦\n` +
      `כאן ${clinic} — חזרנו לפעילות והתגעגענו 💫\n` +
      `אפשר לקבוע תור כאן:\n${bookingUrl}`;

    if (body.dryRun === true) {
      return Response.json({
        success: true,
        dryRun: true,
        candidates: candidates.map((c) => ({
          name: c.name || "(ללא שם)",
          phone: c.phone.slice(0, 3) + "****" + c.phone.slice(-3),
          lastVisit: lastVisit.get(c.id) || null,
        })),
        message: messageFor(candidates[0]?.name || ""),
      });
    }

    if (candidates.length === 0) {
      return Response.json({ success: true, sent: 0, reason: "no_candidates" });
    }

    let sent = 0, failedCount = 0;
    for (const cand of candidates) {
      const res = await sendWhatsApp(cand.phone, messageFor(cand.name), {
        name: cand.name, type: "comeback", tenantId,
      });
      if (res.ok) sent++; else failedCount++;
    }

    return Response.json({ success: true, sent, failed: failedCount, candidates: candidates.length });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
