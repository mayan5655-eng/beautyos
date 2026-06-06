// app/api/community/route.js
// Public read of a tenant's community feed (no auth needed).
// Uses the service role key on the server to bypass RLS, then returns ONLY
// the safe public fields for the requested tenant.

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("t");
    if (!tenantId) {
      return Response.json({ success: false, error: "missing tenant" }, { status: 400 });
    }

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
