// app/api/clients/lapsed/route.js
//
// GET /api/clients/lapsed?days=90
//
// The clients who have not been in for a while, longest-absent first, so SHE
// can decide who is worth contacting. The automation deliberately does not make
// that call any more - it knows the dates, she knows the people.
//
// READ ONLY. Sends nothing, writes nothing.
//
// ── Tenant ─────────────────────────────────────────────────────────────────
// Resolved from the SESSION via get_user_tenant_id(), never from a query param.
// The reads use the service-role key to bypass RLS but are always filtered by
// that session-derived tenant_id - the same shape as leads/send-bulk.
//
// ── "Lapsed" means lapsed, not "never came" ────────────────────────────────
// Only clients with at least one non-cancelled appointment can appear. Someone
// who has never booked is a different thing entirely and belongs in a different
// list; putting them here would quietly turn "we miss you" into a message to a
// person who has never met her.
//
// ── alreadyMessaged ────────────────────────────────────────────────────────
// Computed from auto_reminders_log with the SAME key the winback pass uses, so
// the row tells her the truth about whether anyone - the automation, or she
// herself last month - has already reached out about this particular absence.

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "../../../../lib/supabase/server";
import {
  computeLastVisits,
  WINBACK_TYPE,
} from "../../../../lib/reminders/smartReminders";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DEFAULT_DAYS = 90;
const MIN_DAYS = 30;
const MAX_DAYS = 3650;

/** Whole days between a YYYY-MM-DD date and today, in Israel time. */
function daysSince(dateStr, now = new Date()) {
  const today = new Date(new Date(now).toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
  const then = new Date(`${dateStr}T00:00:00`);
  if (isNaN(then.getTime())) return null;
  return Math.floor((today - then) / 86400000);
}

export async function GET(request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ success: false, error: "לא מחובר" }, { status: 401 });
    }
    const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
    if (!tenantId) {
      return Response.json({ success: false, error: "לא זוהה עסק" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    let days = Number(searchParams.get("days"));
    if (!Number.isFinite(days)) days = DEFAULT_DAYS;
    days = Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.round(days)));

    console.log(`[clients/lapsed] TENANT FILTER: tenant_id = ${tenantId} (read only, days=${days})`);

    const [{ data: clients, error: cErr }, { data: appts, error: aErr }] = await Promise.all([
      admin.from("clients").select("id, name, phone").eq("tenant_id", tenantId),
      admin
        .from("appointments")
        .select("client_id, date, confirmation_status")
        .eq("tenant_id", tenantId),
    ]);
    if (cErr || aErr) {
      console.error("[clients/lapsed] read failed:", (cErr || aErr).message);
      // "couldn't load" must never render as "no lapsed clients".
      return Response.json(
        { success: false, error: "לא הצלחנו לטעון את רשימת הלקוחות" },
        { status: 500 }
      );
    }

    const lastVisits = computeLastVisits(appts);

    // Only the winback rows for THIS tenant, keyed the way the cron keys them.
    const { data: logRows } = await admin
      .from("auto_reminders_log")
      .select("client_id, reference_id")
      .eq("tenant_id", tenantId)
      .eq("reminder_type", WINBACK_TYPE);
    const contacted = new Set((logRows || []).map((r) => `${r.client_id}|${r.reference_id || ""}`));

    const byId = {};
    (clients || []).forEach((c) => { byId[c.id] = c; });

    const rows = [];
    for (const [clientId, lastVisit] of Object.entries(lastVisits)) {
      const client = byId[clientId];
      if (!client) continue;              // another tenant's appointment, or deleted client
      const since = daysSince(lastVisit);
      if (since == null || since < days) continue;
      rows.push({
        id: client.id,
        name: client.name || "",
        phone: client.phone || null,
        lastVisit,
        daysSince: since,
        hasPhone: !!client.phone,
        alreadyMessaged: contacted.has(`${clientId}|${lastVisit}`),
      });
    }

    // Longest absent first - that is the order she wants to triage in.
    rows.sort((a, b) => b.daysSince - a.daysSince);

    return Response.json({
      success: true,
      days,
      total: rows.length,
      withPhone: rows.filter((r) => r.hasPhone).length,
      alreadyMessaged: rows.filter((r) => r.alreadyMessaged).length,
      clients: rows,
    });
  } catch (err) {
    console.error("[clients/lapsed] threw:", err.message);
    return Response.json(
      { success: false, error: "לא הצלחנו לטעון את רשימת הלקוחות" },
      { status: 500 }
    );
  }
}
