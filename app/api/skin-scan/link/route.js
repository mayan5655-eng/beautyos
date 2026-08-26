// app/api/skin-scan/link/route.js
//
// GET /api/skin-scan/link
//
// Returns HER signed scanner link, plus where she stands against this month's
// ceiling. Authenticated; tenant resolved from the session, never a param.
//
// ── Why the link has to be minted here ─────────────────────────────────────
// beautyos.jsx used to build the scanner URL in the browser by string
// concatenation. It cannot do that any more: the URL now carries an HMAC and
// the signing secret is server-only. So the browser asks for the link instead
// of assembling it.
//
// ── Why the quota rides along ──────────────────────────────────────────────
// The ceiling is enforced against the CLIENT, in a request the cosmetician is
// not part of. Without this she would discover the cap only by noticing her
// leads had stopped - a silent cap on a lead-capture funnel is exactly how you
// lose a month. Returning used/limit here lets the scanner card in the app show
// her where she stands BEFORE she reaches it.
//
// Both numbers come from lib/skinScanQuota.ts, the same module the public route
// enforces with. If they disagreed she would be told she has room while her
// clients were being refused.

import { createClient as createServerClient } from "../../../../lib/supabase/server";
import { buildScanUrl } from "../../../../lib/scanToken";
import { getQuotaStatus } from "../../../../lib/skinScanQuota";

function appBase() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://beautyos-theta.vercel.app"
  ).replace(/\/+$/, "");
}

export async function GET() {
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

    console.log(`[skin-scan/link] TENANT FILTER: tenant_id = ${tenantId} (read only)`);

    const quota = await getQuotaStatus(tenantId);

    return Response.json({
      success: true,
      url: buildScanUrl(appBase(), tenantId),
      used: quota.used,
      limit: quota.limit,
      remaining: quota.remaining,
      // True when the count could not be read. The UI shows nothing rather than
      // a confident wrong number.
      unknown: quota.unknown,
    });
  } catch (err) {
    console.error("[skin-scan/link] threw:", err.message);
    return Response.json(
      { success: false, error: "לא הצלחנו להפיק את הקישור" },
      { status: 500 }
    );
  }
}
