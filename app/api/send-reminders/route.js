// app/api/send-reminders/route.js
// Sends WhatsApp reminders for tomorrow's appointments, for ALL tenants.
// Runs via Vercel Cron once a day. Multi-tenant aware: each reminder uses
// the correct business name for the tenant that owns that appointment.
//
// The work lives in lib/reminders/dailyReminders.js: one job per tenant, run in
// parallel with a cap and in isolation, paged reads, and a report of every
// tenant it did not finish. This file supplies the real database, the real
// sender, and the alert that tells the operator who was missed.
//
// Retry: POST/GET /api/send-reminders?only=<tenantId>[,<tenantId>...] with the
// same cron secret re-runs just those tenants (the alert lists them) and skips
// any phone already reminded in the last 20 hours.

import { createClient } from "@supabase/supabase-js";
import { sendWhatsApp } from "../../../lib/whatsapp";
import { isAuthorizedCron, cronUnauthorized } from "../../../lib/cronAuth";
import { confirmLinks } from "../../../lib/confirmToken";
import { startMinute } from "../../../lib/apptTime";
import { isPersonal } from "../../../lib/calendarKind";
import { isMissingColumnError } from "../../../lib/pgError";
import { isDemoTenantId } from "../../../lib/demoTenants.ts";
import { runDailyReminders } from "../../../lib/reminders/dailyReminders.js";
import { describeMissed } from "../../../lib/cronFanout.js";
import { raiseOpsAlert } from "../../../lib/opsAlert.js";

// 300 s is the platform ceiling. The run stops STARTING tenants at 200 s and no
// tenant may take longer than 60 s, so it always ends by 260 s on its own terms
// and reports who it did not reach - rather than being killed mid-list.
export const maxDuration = 300;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Returns tomorrow's date as "YYYY-MM-DD" (Israel timezone)
function getTomorrowDate() {
  const now = new Date();
  const israelNow = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" })
  );
  israelNow.setDate(israelNow.getDate() + 1);

  const year = israelNow.getFullYear();
  const month = String(israelNow.getMonth() + 1).padStart(2, "0");
  const day = String(israelNow.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function POST(request) {
  // Guard: only Vercel Cron (or a caller holding CRON_SECRET) may trigger this
  // all-tenant WhatsApp blast.
  if (!isAuthorizedCron(request)) return cronUnauthorized();

  try {
    const tomorrow = getTomorrowDate();
    const onlyParam = new URL(request.url).searchParams.get("only");
    const only = onlyParam ? onlyParam.split(",").map((s) => s.trim()).filter(Boolean) : null;

    const run = await runDailyReminders({
      db: supabase,
      send: sendWhatsApp,
      tomorrow,
      baseUrl: process.env.NEXT_PUBLIC_APP_URL || "https://beautyos-theta.vercel.app",
      deps: { startMinute, isPersonal, confirmLinks, isDemoTenantId, isMissingColumnError },
      only,
    });

    if (run.empty) {
      return Response.json({ success: true, sent: 0, message: "אין תורים מחר" });
    }

    // Anything the run did not finish is said out loud, never left to be
    // noticed by a client who was not reminded.
    const missed = describeMissed(`תזכורות ל-${tomorrow}`, run.fanout);
    if (missed) {
      console.error(`[send-reminders] INCOMPLETE ${JSON.stringify(run.fanout)}`);
      await raiseOpsAlert({
        db: supabase, send: sendWhatsApp, to: String(process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || "").trim(),
        source: "send-reminders", severity: "error",
        message: `${missed}\n\nלהרצה חוזרת רק לאלה: /api/send-reminders?only=<מזהה מלא>`,
        details: { date: tomorrow, fanout: run.fanout },
      });
    }

    return Response.json({
      success: run.fanout.complete,
      date: tomorrow,
      results: run.results,
      fanout: run.fanout,
      report: null,
    }, { status: run.fanout.complete ? 200 : 207 });
  } catch (err) {
    console.error("[send-reminders] aborted:", err?.message || String(err));
    // An aborted run reminded NOBODY. That is the case most worth a message.
    await raiseOpsAlert({
      db: supabase, send: sendWhatsApp, to: String(process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || "").trim(),
      source: "send-reminders", severity: "error",
      message: `תזכורות מחר - ההרצה נעצרה ולא נשלחה אף תזכורת: ${err?.message || String(err)}`,
    });
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}

// Allow Vercel Cron (which uses GET) to trigger the same logic. The request is
// passed through so the same authorization guard runs on GET too.
export async function GET(request) {
  return POST(request);
}
