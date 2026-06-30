// app/api/messages/route.js
// Returns WhatsApp messages from the log, for the LOGGED-IN cosmetician's
// tenant only.
//
// SECURITY: the tenant is resolved from the AUTHENTICATED session
// (get_user_tenant_id() over the user's cookies) - never from a client-supplied
// query param. This prevents one business from reading another's messages by
// guessing a tenant id. The actual read uses the service-role key (to bypass
// RLS), but is always filtered by the session-derived tenant_id.

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "../../../lib/supabase/server";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET() {
  try {
    // 1. Identify the caller from their session cookies.
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ success: false, error: "לא מחובר" }, { status: 401 });
    }

    // 2. Resolve THEIR tenant with the same RPC the RLS policies use.
    const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
    if (!tenantId) {
      return Response.json({ success: false, error: "לא זוהה עסק" }, { status: 400 });
    }

    // 3. Read only this tenant's messages.
    const { data, error } = await admin
      .from("whatsapp_messages")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return Response.json({ success: false, error: error.message }, { status: 500 });
    }

    return Response.json({ success: true, messages: data });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
