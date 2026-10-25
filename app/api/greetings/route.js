// app/api/greetings/route.js
//
// The greetings screen (Settings > messages) for the LOGGED-IN cosmetician's business only; the tenant comes from her session,
// never from the request.
//   GET                                 her saved switches and texts, this week's plan, and the greetings already queued, honestly labelled
//   POST { action:"preview", config }   the plan for a DRAFT config (nothing is saved, nothing is queued)
//   POST { action:"save", config }      saves the switches/texts and the names she unticked
//
// Saving only writes settings.automations.greetings. Nothing is sent from here: the daily job (api/send-greetings) queues the
// greetings, and she sends each from "הודעות מוכנות לשליחה".

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "../../../lib/supabase/server";
import { normalizeGreetings, GREETING_TYPES, HOLIDAY_CHOICES, DEFAULT_TEXTS, sendWindow } from "../../../lib/greetings/greetings.js";
import { planForTenant } from "../../../lib/greetings/run.js";
import { holidaysBetween, isYomTov } from "../../../lib/greetings/calendar.ts";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const failed = (where, err) => (console.error(`[greetings] ${where} failed:`, err?.message), Response.json({ success: false, error: "משהו נתקע אצלנו, אפשר לנסות שוב בעוד רגע" }, { status: 500 }));

async function callerTenant() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { res: Response.json({ success: false, error: "לא מחוברת" }, { status: 401 }) };
  const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
  if (!tenantId) return { res: Response.json({ success: false, error: "לא זוהה עסק" }, { status: 400 }) };
  return { tenantId };
}

const publicPlan = (p) => ({
  today: p.today, to: p.to, clientCount: p.clientCount,
  items: p.items.map((i) => ({ clientId: i.clientId, name: i.name, occasion: i.occasion, ref: i.ref, holidayKey: i.holidayKey, sendOn: i.sendOn, message: i.message, skipped: i.skipped })),
  held: p.held.reduce((acc, h) => ((acc[h.reason] = (acc[h.reason] || 0) + 1), acc), {}),
});

const meta = () => ({ holidays: HOLIDAY_CHOICES, defaultTexts: DEFAULT_TEXTS, window: sendWindow(new Date(), { isYomTov }).reason });

export async function GET() {
  try {
    const { tenantId, res } = await callerTenant();
    if (res) return res;
    const plan = await planForTenant({ db: admin, tenantId, holidaysFor: holidaysBetween, isYomTov });
    const types = Object.values(GREETING_TYPES).map((t) => `auto_${t}`);
    const { data: recent } = await admin.from("whatsapp_messages")
      .select("id, recipient_name, message_type, status, created_at, green_api_id, delivery_status, error_detail")
      .eq("tenant_id", tenantId).in("message_type", types).order("created_at", { ascending: false }).limit(20);
    return Response.json({ success: true, config: plan.cfg, plan: publicPlan(plan), recent: recent || [], ...meta() });
  } catch (err) {
    return failed("read", err);
  }
}

export async function POST(request) {
  try {
    const { tenantId, res } = await callerTenant();
    if (res) return res;
    const body = await request.json().catch(() => ({}));
    const config = normalizeGreetings(body.config);
    if (body.action === "preview") {
      const plan = await planForTenant({ db: admin, tenantId, config, holidaysFor: holidaysBetween, isYomTov });
      return Response.json({ success: true, config, plan: publicPlan(plan), ...meta() });
    }
    if (body.action !== "save") return Response.json({ success: false, error: "פעולה לא מוכרת" }, { status: 400 });

    const { data: row, error: readErr } = await admin.from("settings").select("id, automations").eq("tenant_id", tenantId).maybeSingle();
    if (readErr) return failed("settings read", readErr);
    if (!row) return Response.json({ success: false, error: "ההגדרות של העסק עדיין לא נשמרו, כדאי להשלים קודם את פרטי העסק" }, { status: 409 });
    const automations = { ...(row.automations && typeof row.automations === "object" ? row.automations : {}), greetings: config };
    const { data, error } = await admin.from("settings").update({ automations }).eq("tenant_id", tenantId).select("id").maybeSingle();
    if (error || !data) return failed("save", error || { message: "no row updated" });
    const plan = await planForTenant({ db: admin, tenantId, config, holidaysFor: holidaysBetween, isYomTov });
    return Response.json({ success: true, config, plan: publicPlan(plan), ...meta() });
  } catch (err) {
    return failed("write", err);
  }
}
