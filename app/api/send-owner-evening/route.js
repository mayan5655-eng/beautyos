// app/api/send-owner-evening/route.js
// The evening summary, per tenant that opted in. The work is in
// lib/eveningRun.js (paged reads, one isolated job per tenant, a report of
// whoever it did not finish); this file supplies the database and the senders.
import { createClient } from "@supabase/supabase-js";
import { notifyOwner } from "../../../lib/ownerNotify.js";
import { isAuthorizedCron, cronUnauthorized } from "../../../lib/cronAuth";
import { startMinute, endMinute } from "../../../lib/apptTime";
import { isPersonal } from "../../../lib/calendarKind";
import { isMissingColumnError } from "../../../lib/pgError";
import { buildEveningSummary, isQuietEvening } from "../../../lib/eveningSummary.js";
import { runEveningSummaries } from "../../../lib/eveningRun.js";
import { describeMissed } from "../../../lib/cronFanout.js";
import { sendWhatsApp } from "../../../lib/whatsapp";
import { raiseOpsAlert } from "../../../lib/opsAlert.js";

// 120 s ceiling: stop starting tenants at 60 s, none may run past 30 s.
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

async function alertOperator(text, severity = "error", details = null) {
  await raiseOpsAlert({
    db: supabase, send: sendWhatsApp, to: String(process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || "").trim(),
    source: "send-owner-evening", severity, message: text, details,
  });
}

export async function POST(request) {
  if (!isAuthorizedCron(request)) return cronUnauthorized();
  try {
    if (isQuietEvening()) return Response.json({ success: true, sent: 0, message: "ערב שבת, לא שולחים" });

    const run = await runEveningSummaries({
      db: supabase,
      date: israelTomorrow(),
      deps: { notifyOwner, buildEveningSummary, startMinute, endMinute, isPersonal, isMissingColumnError },
    });
    if (run.none) return Response.json({ success: true, sent: 0, message: "אף אחת לא הפעילה" });

    const missed = describeMissed("סיכום ערב", run.fanout);
    if (missed) {
      console.error(`[owner-evening] INCOMPLETE ${JSON.stringify(run.fanout)}`);
      await alertOperator(missed, "error", { fanout: run.fanout });
    }
    return Response.json({ success: run.fanout.complete, sent: run.sent, fanout: run.fanout }, { status: run.fanout.complete ? 200 : 207 });
  } catch (e) {
    console.error("[owner-evening] threw:", e?.message || String(e));
    await alertOperator(`סיכום ערב - ההרצה נעצרה ולא נשלח אף סיכום: ${e?.message || String(e)}`);
    return Response.json({ success: false, error: "internal" }, { status: 500 });
  }
}

export async function GET(request) {
  return POST(request);
}
