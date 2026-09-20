// app/api/community/route.js
// Public read of a tenant's community feed (no auth needed).
// Uses the service role key on the server to bypass RLS, then returns ONLY
// the safe public fields for the requested tenant.

import { createClient } from "@supabase/supabase-js";
import { checkIpLimit, checkTenantLimit } from "../../../lib/rateLimit";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request) {
  // Per-IP first, before the tenant is even read: the only unauthenticated
  // route that had no limit at all, and it hands back a business phone for
  // any tenant id. Same shape as every other public route.
  const ipLimited = checkIpLimit(request, "community");
  if (ipLimited) return ipLimited;
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("t");
    if (!tenantId || !UUID_RE.test(tenantId)) {
      return Response.json({ success: false, error: "missing tenant" }, { status: 400 });
    }
    const tenantLimited = checkTenantLimit(tenantId, "community");
    if (tenantLimited) return tenantLimited;

    // Business name for the header (best-effort)
    const [postsRes, settingsRes] = await Promise.all([
      supabase
        .from("community_posts")
        .select("id, title, body, image_url, post_type, cta_label, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("settings")
        .select("business_name, primary_color, business_phone")
        .eq("tenant_id", tenantId)
        .limit(1),
    ]);

    const settings =
      settingsRes.data && settingsRes.data.length > 0 ? settingsRes.data[0] : {};

    return Response.json({
      success: true,
      posts: postsRes.data || [],
      business: {
        name: settings.business_name || "",
        color: settings.primary_color || "#C77B92",
        phone: settings.business_phone || "",
      },
    });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
