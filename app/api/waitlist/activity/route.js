// app/api/waitlist/activity/route.js
//
// GET: the waiting-list card's "what happened" lines, from the smart waitlist's own offers of the last 14 days
// (lib/waitlistActivity.js). READ ONLY. The tenant comes from her session (get_user_tenant_id), never from the request; the read
// uses the service-role key and is always filtered by that tenant. Also says whether the automatic offer is on, so the card can
// tell her in one line what happens when a slot frees.

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "../../../../lib/supabase/server";
import { waitlistActivity } from "../../../../lib/waitlistActivity.js";
import { waitlistOffersOn } from "../../../../lib/waitlistFlag.js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function GET() {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ success: false, error: "לא מחובר" }, { status: 401 });
    const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
    if (!tenantId) return Response.json({ success: false, error: "לא זוהה עסק" }, { status: 400 });

    const since = new Date(Date.now() - 14 * 86400000).toISOString();
    const [{ data: settingsRow }, { data: rows, error }] = await Promise.all([
      admin.from("settings").select("*").eq("tenant_id", tenantId).maybeSingle(),
      admin.from("slot_offers")
        .select("token, slot_date, slot_start_minute, slot_hour, service, client_name, status, claimed_at, expires_at, created_at")
        .eq("tenant_id", tenantId).like("token", "wl%").gte("created_at", since)
        .order("created_at", { ascending: false }).limit(200),
    ]);
    if (error) return Response.json({ success: false, error: "לא הצלחנו לקרוא את ההצעות כרגע" }, { status: 500 });
    return Response.json({ success: true, on: waitlistOffersOn(settingsRow), items: waitlistActivity(rows || []) });
  } catch (err) {
    console.error("[waitlist/activity] failed:", err?.message || String(err));
    return Response.json({ success: false, error: "משהו נתקע אצלנו, אפשר לנסות שוב בעוד רגע" }, { status: 500 });
  }
}
