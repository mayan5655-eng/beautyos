// app/api/rebook/today/route.js
//
// GET: "who gets a 'time for the next one' reminder today" for HER business, as Settings > הודעות shows it under the switch.
// READ ONLY: sends nothing, writes nothing. The rules are the daily run's own (lib/reminders/rebookPlan.js rebookToday), so the
// list she reads is the list the run works from. The tenant comes from her session (get_user_tenant_id), never from the request;
// the reads use the service-role key and are always filtered by that tenant.

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "../../../../lib/supabase/server";
import { readAllRows } from "../../../../lib/pagedRead.js";
import { canMarket } from "../../../../lib/marketingConsent.js";
import { businessFieldsOf } from "../../../../lib/businessFields.ts";
import { REBOOK_TYPE, defaultRebookDays } from "../../../../lib/reminders/rebook.js";
import { rebookToday } from "../../../../lib/reminders/rebookPlan.js";
import { DEFAULT_CAPS } from "../../../../lib/reminders/smartReminders.js";
import { checkTenantLimit } from "../../../../lib/rateLimit";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function GET() {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ success: false, error: "לא מחובר" }, { status: 401 });
    const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
    if (!tenantId) return Response.json({ success: false, error: "לא זוהה עסק" }, { status: 400 });
    const limited = checkTenantLimit(tenantId, "owner-lists");
    if (limited) return limited;

    const byTenant = (q) => q.eq("tenant_id", tenantId);
    const [st, cl, ap, sv, lg] = await Promise.all([
      admin.from("settings").select("*").eq("tenant_id", tenantId).maybeSingle(),
      readAllRows(admin, "clients", { columns: "*", filter: byTenant }),
      readAllRows(admin, "appointments", { columns: "id, client_id, date, tenant_id, confirmation_status, service", filter: byTenant }),
      readAllRows(admin, "service_prices", { columns: "*", filter: byTenant }),
      readAllRows(admin, "auto_reminders_log", { columns: "tenant_id, client_id, reminder_type, reference_id", order: ["client_id", "reference_id"], filter: (q) => q.eq("tenant_id", tenantId).eq("reminder_type", REBOOK_TYPE) }),
    ]);
    // A list built from a partial read would name the wrong people: say so instead.
    // The menu too (PR #39 review): without it a treatment she set to 0 ("never") could be listed, so no menu means no list.
    if (st.error || cl.error || ap.error || lg.error || sv.error || !cl.complete || !ap.complete || !lg.complete || !sv.complete) {
      return Response.json({ success: false, error: "לא הצלחנו לקרוא את כל הנתונים כרגע, אפשר לנסות שוב בעוד רגע" }, { status: 503 });
    }
    const settings = st.data || {};
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const plan = rebookToday({
      settings,
      clients: cl.data,
      appointments: ap.data,
      services: sv.data,
      logRows: lg.data,
      today,
      canMarket,
      defaultDays: defaultRebookDays(businessFieldsOf(settings)),
    });
    // Only the fields the list shows: names, the treatment, days. No phones leave the server here.
    const pick = (x) => ({ name: x.name, service: x.service, daysSince: x.daysSince, interval: x.interval, source: x.source, reason: x.reason });
    return Response.json({
      success: true,
      on: plan.on, visible: plan.visible, paused: plan.paused,
      perDayCap: DEFAULT_CAPS.perTenant,
      ready: plan.ready.slice(0, 50).map(pick),
      readyCount: plan.ready.length,
      skipped: plan.skipped.slice(0, 50).map(pick),
      sentToday: plan.sentToday.slice(0, 50).map((x) => ({ name: x.name, service: x.service })),
      serviceDaysReady: (sv.data || []).length === 0 || (sv.data || []).some((r) => Object.prototype.hasOwnProperty.call(r, "rebook_days")),
    });
  } catch (err) {
    console.error("[rebook/today] failed:", err?.message || String(err));
    return Response.json({ success: false, error: "משהו נתקע אצלנו, אפשר לנסות שוב בעוד רגע" }, { status: 500 });
  }
}
