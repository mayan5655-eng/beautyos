// app/api/messages/route.js
// Returns WhatsApp messages from the log, for ONE tenant only.
//
// MULTI-TENANT: this endpoint uses the service-role key (which bypasses RLS),
// so we MUST filter by tenant_id explicitly. The tenant is passed as ?t=<tenantId>.
// Without this filter, one business could see another's client messages.

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const tenantId = url.searchParams.get("t");

    if (!tenantId) {
      return Response.json(
        { success: false, error: "חסר מזהה עסק" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
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