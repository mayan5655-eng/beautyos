// app/api/leads/mark-contacted/route.js
//
// Stamps the contact trail (last_contacted_at, first_contacted_at, contact_attempts) for leads she has
// actually opened a WhatsApp chat for. POST { leadIds: [uuid, ...] }.
//
// send-bulk used to stamp this when it QUEUED the wa.me links, before she had tapped anything: close the
// sheet without tapping and every lead still read as contacted. The sheet now calls this on each tap.
//
// Session client only, tenant from get_user_tenant_id, every write filtered by that tenant_id.

import { createClient as createServerClient } from "../../../../lib/supabase/server";
import { requireActiveTenant } from "../../../../lib/planGuard";

const isUuid = (s) => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export async function POST(request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ success: false, error: "לא מחובר" }, { status: 401 });

    const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
    if (!tenantId) return Response.json({ success: false, error: "לא זוהה עסק" }, { status: 400 });

    const guard = await requireActiveTenant(supabase);
    if (!guard.ok) return guard.response;

    const body = await request.json().catch(() => ({}));
    const ids = Array.isArray(body.leadIds) ? [...new Set(body.leadIds.filter(isUuid))].slice(0, 200) : [];
    if (ids.length === 0) return Response.json({ success: false, error: "לא נבחרו פניות" }, { status: 400 });

    const { data: rows, error } = await supabase
      .from("leads")
      .select("id, contact_attempts, first_contacted_at")
      .eq("tenant_id", tenantId)
      .in("id", ids);
    if (error) return (console.error("[leads/mark-contacted] failed:", error?.message), Response.json({ success: false, error: "משהו נתקע אצלנו, אפשר לנסות שוב בעוד רגע" }, { status: 500 }));

    const nowIso = new Date().toISOString();
    const writes = await Promise.all(
      (rows || []).map((lead) =>
        supabase
          .from("leads")
          .update({
            last_contacted_at: nowIso,
            first_contacted_at: lead.first_contacted_at || nowIso,
            contact_attempts: (Number(lead.contact_attempts) || 0) + 1,
          })
          .eq("id", lead.id)
          .eq("tenant_id", tenantId)
      )
    );
    const failed = writes.filter((w) => w.error).length;
    if (failed) return Response.json({ success: false, error: "לא הצלחנו לסמן את כל הפניות" }, { status: 500 });
    return Response.json({ success: true, marked: (rows || []).length, at: nowIso });
  } catch (err) {
    return (console.error("[leads/mark-contacted] failed:", err?.message), Response.json({ success: false, error: "משהו נתקע אצלנו, אפשר לנסות שוב בעוד רגע" }, { status: 500 }));
  }
}
