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
