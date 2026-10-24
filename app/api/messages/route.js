// app/api/messages/route.js
// WhatsApp messages of the LOGGED-IN cosmetician's tenant only:
//   GET                          the log (last 100, any status)
//   GET ?status=pending_manual   the manual send queue, with the exact count
//   PATCH { id }                 she opened a queued message in WhatsApp: mark it sent
//
// SECURITY: the tenant is resolved from the AUTHENTICATED session
// (get_user_tenant_id() over the user's cookies) - never from a client-supplied
// query param. This prevents one business from reading another's messages by
// guessing a tenant id. The actual read uses the service-role key (to bypass
// RLS), but is always filtered by the session-derived tenant_id.
//
// Why the queue goes through here and not a browser read: whatsapp_messages has
// no SELECT/UPDATE policy for `authenticated`, so the dashboard's own read came
// back empty (200, []) and the "mark sent" update touched 0 rows without an
// error. Every queued booking confirmation was invisible to her (found
// 2026-10-23 on a fresh tenant). This route needs no migration.

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "../../../lib/supabase/server";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const failed = (where, err) => (console.error(`[messages] ${where} failed:`, err?.message), Response.json({ success: false, error: "משהו נתקע אצלנו, אפשר לנסות שוב בעוד רגע" }, { status: 500 }));

// The caller's tenant, or the Response to return instead.
async function callerTenant() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { res: Response.json({ success: false, error: "לא מחובר" }, { status: 401 }) };
  }
  // Same RPC the RLS policies use.
  const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
  if (!tenantId) {
    return { res: Response.json({ success: false, error: "לא זוהה עסק" }, { status: 400 }) };
  }
  return { tenantId };
}

export async function GET(request) {
  try {
    const { tenantId, res } = await callerTenant();
    if (res) return res;

    const status = new URL(request.url).searchParams.get("status");
    if (status && status !== "pending_manual") {
      return Response.json({ success: false, error: "סטטוס לא מוכר" }, { status: 400 });
    }

    let q = admin
      .from("whatsapp_messages")
      .select("*", status ? { count: "exact" } : undefined)
      .eq("tenant_id", tenantId);
    if (status) q = q.eq("status", status);
    const { data, error, count } = await q.order("created_at", { ascending: false }).limit(100);

    if (error) return failed("read", error);
    return Response.json(status ? { success: true, messages: data, count } : { success: true, messages: data });
  } catch (err) {
    return failed("read", err);
  }
}

export async function PATCH(request) {
  try {
    const { tenantId, res } = await callerTenant();
    if (res) return res;

    const { id } = await request.json().catch(() => ({}));
    if (!id || typeof id !== "string") {
      return Response.json({ success: false, error: "חסר מזהה הודעה" }, { status: 400 });
    }

    // Only a message of hers that is still waiting. Anything else is 404, so the
    // dashboard never shows "sent" for a row that did not change.
    const { data, error } = await admin
      .from("whatsapp_messages")
      .update({ status: "sent" })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .eq("status", "pending_manual")
      .select("id");

    if (error) return failed("mark sent", error);
    if (!data?.length) {
      return Response.json({ success: false, error: "ההודעה לא נמצאה ברשימה" }, { status: 404 });
    }
    return Response.json({ success: true });
  } catch (err) {
    return failed("mark sent", err);
  }
}
