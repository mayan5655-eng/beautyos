// app/api/send-owner-evening/route.js
// The evening message to HER: tomorrow in ten seconds (lib/eveningSummary).
// Runs via Vercel Cron once a day, for every tenant that turned it on.
//
// Opt-in: branding.evening_summary === true. A daily message nobody asked for is
// the opposite of calm, so the default is off and the toggle sits in Settings,
// hours tab. It goes only to her own number, from the same platform number as
// every other owner alert, and is skipped when she has paused automations.
//
// Never on Friday or Saturday evening (lib/eveningSummary.isQuietEvening).
// Cron time is UTC: 17:00 UTC is 20:00 in summer and 19:00 in winter in Israel.

import { createClient } from "@supabase/supabase-js";
import { sendWhatsApp } from "../../../lib/whatsapp";
import { isAuthorizedCron, cronUnauthorized } from "../../../lib/cronAuth";
import { startMinute, endMinute } from "../../../lib/apptTime";
import { isPersonal } from "../../../lib/calendarKind";
import { isMissingColumnError } from "../../../lib/pgError";
import { buildEveningSummary, isQuietEvening } from "../../../lib/eveningSummary.js";

export const maxDuration = 120;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function israelTomorrow() {
  const now = new Date();
  const il = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
  il.setDate(il.getDate() + 1);
  return `${il.getFullYear()}-${String(il.getMonth() + 1).padStart(2, "0")}-${String(il.getDate()).padStart(2, "0")}`;
}

export async function POST(request) {
  if (!isAuthorizedCron(request)) return cronUnauthorized();
  try {
    if (isQuietEvening()) return Response.json({ success: true, sent: 0, message: "ערב שבת, לא שולחים" });

    // Only the tenants who asked. branding is the existing home for small per-clinic
    // switches; the filter is done here rather than in SQL so a missing key is "off".
    const { data: settingsRows, error: sErr } = await supabase
      .from("settings")
      .select("tenant_id, business_phone, branding, automations");
    if (sErr) return Response.json({ success: false, error: sErr.message }, { status: 500 });

    const wanted = (settingsRows || []).filter((r) => {
      const b = r.branding && typeof r.branding === "object" ? r.branding : {};
      const paused = r.automations && typeof r.automations === "object" && r.automations.paused === true;
      return b.evening_summary === true && !paused && String(r.business_phone || "").trim();
    });
    if (!wanted.length) return Response.json({ success: true, sent: 0, message: "אף אחת לא הפעילה" });

    const date = israelTomorrow();
    const COLS = "id, name, service, date, hour, start_minute, duration, tenant_id, confirmation_status";
    const load = (cols) => supabase.from("appointments").select(cols).eq("date", date).neq("confirmation_status", "cancelled");
    let { data: appts, error } = await load(COLS + ", kind");
    if (isMissingColumnError(error)) ({ data: appts, error } = await load(COLS));
    if (error) return Response.json({ success: false, error: error.message }, { status: 500 });

    let sent = 0;
    for (const r of wanted) {
      const mine = (appts || []).filter((a) => a.tenant_id === r.tenant_id && !isPersonal(a));
      const msg = buildEveningSummary({ date, appointments: mine, startMinute, endMinute });
      if (!msg) continue; // an empty day is not worth a message
      try {
        await sendWhatsApp(r.business_phone, msg, { name: "בעלת העסק", type: "owner_alert", tenantId: r.tenant_id });
        sent++;
      } catch (e) {
        console.error("[owner-evening] send failed for", r.tenant_id, e?.message || String(e));
      }
    }
    return Response.json({ success: true, sent });
  } catch (e) {
    console.error("[owner-evening] threw:", e?.message || String(e));
    return Response.json({ success: false, error: "internal" }, { status: 500 });
  }
}

export async function GET(request) {
  return POST(request);
}
