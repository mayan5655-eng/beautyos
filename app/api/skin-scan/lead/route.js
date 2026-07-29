// app/api/skin-scan/lead/route.js
// Booking-intent lead capture (Phase 2 / A2): when a scanner visitor proceeds
// from /skin-scan to /book, the client fires this endpoint (keepalive) so she
// is captured as a "סורק העור" lead too — not only when she submits the
// WhatsApp form. Same de-dup by (tenant_id, phone) as the report send, so a
// visitor who does both never creates a duplicate lead.
//
// Service-role client: the leads table is RLS-protected and the caller is
// anonymous. Mirrors the auth posture of /api/skin-scan/send.

import { createClient } from "@supabase/supabase-js";
import { upsertScanLead } from "../../../../lib/leads";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const { tenantId, name, phone, report } = await request.json();
    // A lead needs a tenant + a phone (the dedup key). No phone -> nothing to
    // capture here; the /book flow will capture her on completion instead.
    if (!tenantId || !phone) {
      return Response.json({ success: false, error: "missing tenant or phone" }, { status: 400 });
    }
    await upsertScanLead(supabase, { tenantId, name, phone, report });
    return Response.json({ success: true });
  } catch (err) {
    console.error("skin-scan/lead error:", err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
