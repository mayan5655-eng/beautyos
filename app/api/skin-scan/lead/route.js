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
import { checkIpLimit, checkTenantLimit } from "../../../../lib/rateLimit";
import { verifyScanLink } from "../../../../lib/scanToken";
import { checkLeadPayload } from "../../../../lib/skinScanGuard";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    // Loosest of the three caps. This one fires automatically (keepalive) as
    // the scanner page navigates to /book, so it must never be the limit a real
    // visitor trips - it is here to bound a script writing junk leads into
    // someone else's account, nothing more. See lib/rateLimit.ts.
    const ipLimited = checkIpLimit(request, "skin-scan-lead");
    if (ipLimited) return ipLimited;

    const body = await request.json();
    // A lead writes into a business's CRM: it needs her SIGNED link, a mobile number, and only a small
    // whitelist of the report. (Until 2026-10-06 it needed neither the signature nor a real number, and
    // its upsert overwrote an existing lead's data for any tenant+phone the caller named.)
    const checked = checkLeadPayload({ ...body, signature: body.s }, verifyScanLink);
    if (!checked.ok) {
      return Response.json({ success: false, error: checked.error }, { status: checked.status });
    }
    const { tenantId, phone, name, report } = checked.lead;
    const tenantLimited = checkTenantLimit(tenantId, "skin-scan-lead");
    if (tenantLimited) return tenantLimited;

    await upsertScanLead(supabase, { tenantId, name, phone, report });
    return Response.json({ success: true });
  } catch (err) {
    console.error("skin-scan/lead error:", err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
