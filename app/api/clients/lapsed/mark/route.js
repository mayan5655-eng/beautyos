// app/api/clients/lapsed/mark/route.js
//
// POST /api/clients/lapsed/mark   { clientIds: string[] }
//
// Records that SHE has reached out to these lapsed clients about their current
// absence, so the automated win-back stays quiet for them. Sends nothing.
//
// ── Why marking is all that is left here ──────────────────────────────────
// This path used to be /api/clients/lapsed/send, which sent the message
// itself and then marked. It gated on isWhatsAppConnected, which asked for a
// tenant-owned GreenAPI instance after those were retired by decision
// (lib/whatsapp.js), so it refused every call with "WhatsApp is not
// connected" and pointed her at a settings screen that no longer exists.
// Marketing goes out from HER phone through wa.me - the same rule the
// comeback and gap-fill compose windows already follow - and the modal now
// opens one WhatsApp conversation per client with the message ready. The
// server's only remaining job is the suppression row, written when she taps
// a client, one at a time, so a message she did not send is never marked.
//
// ── The key ────────────────────────────────────────────────────────────────
// The row is keyed on the client's LAST VISIT DATE, computed exactly as the
// cron computes it (computeLastVisits), so the automation goes quiet for this
// absence and only this absence. Clients already marked for this absence are
// skipped rather than written twice.
//
// ── Tenant ─────────────────────────────────────────────────────────────────
// From the session, never the body. The ids from the browser only narrow the
// tenant-filtered read; a forged id for another tenant's client matches
// nothing.

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "../../../../../lib/supabase/server";
import {
  computeLastVisits,
  winbackLogRow,
  WINBACK_TYPE,
} from "../../../../../lib/reminders/smartReminders";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MAX_IDS = 200;

export async function POST(request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ success: false, error: "לא מחוברת" }, { status: 401 });
    }
    const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
    if (!tenantId) {
      return Response.json({ success: false, error: "לא זוהה עסק" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const clientIds = Array.isArray(body.clientIds)
      ? [...new Set(body.clientIds.filter((id) => typeof id === "string" && id))].slice(0, MAX_IDS)
      : [];
    if (clientIds.length === 0) {
      return Response.json({ success: false, error: "לא נבחרו לקוחות" }, { status: 400 });
    }

    const [{ data: clients, error: cErr }, { data: appts, error: aErr }, { data: logRows }] = await Promise.all([
      admin.from("clients").select("id").eq("tenant_id", tenantId).in("id", clientIds),
      admin.from("appointments").select("client_id, date, confirmation_status").eq("tenant_id", tenantId),
      admin.from("auto_reminders_log").select("client_id, reference_id").eq("tenant_id", tenantId).eq("reminder_type", WINBACK_TYPE),
    ]);
    if (cErr || aErr) {
      console.error("[clients/lapsed/mark] read failed:", (cErr || aErr).message);
      return Response.json({ success: false, error: "לא הצלחנו לטעון את הלקוחות" }, { status: 500 });
    }

    const lastVisits = computeLastVisits(appts);
    const already = new Set((logRows || []).map((r) => `${r.client_id}|${r.reference_id || ""}`));

    const rows = [];
    let skipped = 0;
    for (const c of clients || []) {
      const lv = lastVisits[c.id];
      if (!lv) { skipped++; continue; }                   // never visited: not lapsed, nothing to suppress
      if (already.has(`${c.id}|${lv}`)) { skipped++; continue; }
      rows.push(winbackLogRow(tenantId, c.id, lv));
    }

    let marked = 0;
    if (rows.length > 0) {
      const { error: mErr } = await admin.from("auto_reminders_log").insert(rows);
      if (mErr) {
        console.error(`[clients/lapsed/mark] SUPPRESSION WRITE FAILED for tenant ${tenantId}: ${mErr.message}`);
        return Response.json({ success: false, error: "לא הצלחנו לסמן; ייתכן שהלקוחה תקבל גם את הפנייה האוטומטית" }, { status: 500 });
      }
      marked = rows.length;
    }

    return Response.json({ success: true, marked, skipped });
  } catch (err) {
    console.error("[clients/lapsed/mark] threw:", err.message);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
