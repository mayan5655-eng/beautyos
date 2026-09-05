// app/api/questions/route.js
// Creates owner_questions rows - the ONLY insert path for them.
//
// These were client-side inserts under an RLS insert policy. Moved here so
// the browser holds no INSERT on the table at all: tenant comes from the
// authenticated session, the kind whitelist and payload shape are enforced
// where the client cannot edit them, and there is exactly one write path to
// reason about. Answering (status/result/answered_at) stays a client-side
// UPDATE under its column-limited grant.

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "../../../lib/supabase/server";
import { checkTenantLimit } from "../../../lib/rateLimit";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const KINDS = new Set(["gap_fill", "comeback"]);

// Would a YES on this question reach anyone? Checked BEFORE the question is
// created - an empty compose window is worse than no question at all, and
// because this route is the ONLY insert path, every caller (the UI today, a
// morning cron tomorrow) inherits the check. The filters mirror the yes-path
// routes; if those change, change these with them:
//   gap_fill  -> app/api/slots/offer   (waitlist match / lapsed 30d+ / had this service)
//   comeback  -> app/api/clients/comeback (last visit before the break, within 240d)
async function hasCandidates(tenantId, kind, payload) {
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: clients }, { data: appts }] = await Promise.all([
    admin.from("clients").select("id, name, phone, status").eq("tenant_id", tenantId),
    admin.from("appointments").select("client_id, service, date").eq("tenant_id", tenantId),
  ]);
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
    return (clients || []).some((c) => {
      if (!c.phone || String(c.id) === excluded) return false;
      const cid = String(c.id);
      return daysSince(lastVisit.get(cid)) >= 30 || hadService.has(cid);
    });
  }

  // comeback: someone whose last visit predates the break, within 240 days of it.
  const quietStart = payload.quiet_start;
  if (!quietStart) return false;
  const floorMs = new Date(`${quietStart}T00:00:00`).getTime() - 240 * 86400000;
  return (clients || []).some((c) => {
    if (c.status === "archived" || !c.phone) return false;
    const lv = lastVisit.get(String(c.id));
    if (!lv || lv > quietStart) return false;
    return new Date(`${lv}T00:00:00`).getTime() >= floorMs;
  });
}

export async function POST(request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ success: false, error: "לא מחוברת" }, { status: 401 });
    const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
    if (!tenantId) return Response.json({ success: false, error: "לא זוהה עסק" }, { status: 400 });

    const limited = checkTenantLimit(tenantId, "owner-questions");
    if (limited) return limited;

    const body = await request.json().catch(() => ({}));
    const kind = String(body.kind || "");
    if (!KINDS.has(kind)) {
      return Response.json({ success: false, error: "unknown kind" }, { status: 400 });
    }

    // Payload is rebuilt field-by-field per kind, never passed through whole:
    // it is data the card renders and the yes-path acts on, so an arbitrary
    // client object has no business landing in it.
    const p = body.payload || {};
    let payload;
    if (kind === "gap_fill") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p.date || ""))) {
        return Response.json({ success: false, error: "bad date" }, { status: 400 });
      }
      payload = {
        date: p.date,
        startMinute: Number(p.startMinute) || 0,
        service: typeof p.service === "string" ? p.service.slice(0, 120) : null,
        duration: Number(p.duration) > 0 ? Number(p.duration) : null,
        cancelledClientId: p.cancelledClientId ? String(p.cancelledClientId) : null,
      };
    } else {
      payload = {
        quiet_start: /^\d{4}-\d{2}-\d{2}$/.test(String(p.quiet_start || "")) ? p.quiet_start : null,
        quiet_end: /^\d{4}-\d{2}-\d{2}$/.test(String(p.quiet_end || "")) ? p.quiet_end : null,
      };
      if (!payload.quiet_end) {
        return Response.json({ success: false, error: "bad quiet_end" }, { status: 400 });
      }
      // One comeback question per break, enforced where the write happens.
      const { data: existing, error: dupErr } = await admin
        .from("owner_questions")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("kind", "comeback")
        .eq("payload->>quiet_end", payload.quiet_end)
        .limit(1);
      if (dupErr) {
        console.error("[questions] dedup read failed:", dupErr.message);
        return Response.json({ success: false, error: dupErr.message }, { status: 500 });
      }
      if (existing && existing.length > 0) {
        return Response.json({ success: true, duplicate: true });
      }
    }

    // No candidates, no question. success:true because nothing went wrong -
    // there is simply nobody a yes would reach.
    const anyone = await hasCandidates(tenantId, kind, payload);
    if (!anyone) {
      return Response.json({ success: true, skipped: "no_candidates" });
    }

    const { error } = await admin
      .from("owner_questions")
      .insert({ tenant_id: tenantId, kind, payload });
    if (error) {
      console.error("[questions] insert failed:", error.code || "", error.message);
      return Response.json({ success: false, error: error.message }, { status: 500 });
    }
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
