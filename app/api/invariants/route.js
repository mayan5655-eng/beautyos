// app/api/invariants/route.js
//
// The nightly check that compares what the system claims to what is there.
//
// Runs on the Vercel cron. Returns the full report as JSON either way, and
// SENDS A MESSAGE ONLY WHEN SOMETHING IS WRONG - which is the design decision
// that keeps it useful. A job that reports "all clear" every night is a job
// whose output stops being read within a fortnight, and then it is another
// assertion nobody checks, which is the exact failure it exists to catch.
//
// Silence means healthy. A message means look.

import { createClient } from "@supabase/supabase-js";
import { isAuthorizedCron, cronUnauthorized } from "../../../lib/cronAuth";
import { sendWhatsApp } from "../../../lib/whatsapp";
import { runInvariants, formatInvariantReport } from "../../../lib/invariants.js";
import { staleSupportMessages, formatStaleSupportLine } from "../../../lib/supportInbox.ts";
import { checkInstanceState } from "../../../lib/greenApi/health.ts";

export const maxDuration = 120;

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  // Same gate as the other crons: this reads across every tenant on the
  // service key, so it is not something an anonymous caller gets to trigger.
  if (!isAuthorizedCron(request)) return cronUnauthorized();
  return run();
}

// GET so it can be opened by hand while investigating, behind the same gate.
export async function GET(request) {
  if (!isAuthorizedCron(request)) return cronUnauthorized();
  return run();
}

async function run() {
  try {
    const { results, failures, errors } = await runInvariants(admin);

    // Logged in full every run, healthy or not. The Vercel log is the record;
    // the WhatsApp is the interrupt, and the two should not be the same thing.
    console.log("[invariants]", JSON.stringify({ failures: failures.length, errors: errors.length, results }));

    // Not a data-integrity invariant (see lib/supportInbox.ts's own header on
    // why it lives separately) - folded into the SAME nightly message rather
    // than a second alert channel, so there is one thing to watch, not two.
    const staleSupport = await staleSupportMessages(admin, 2);
    if (staleSupport.error) console.error("[invariants] stale-support check failed:", staleSupport.error);
    const staleSupportLine = formatStaleSupportLine(staleSupport);

    // GreenAPI itself, not our own database: found 2026-10-01 by hand that
    // "sent" in whatsapp_messages can be true while the WhatsApp session is
    // logged out, because GreenAPI's own API accepts the call regardless.
    // console.error (not .log) on purpose - this line must survive in Vercel's
    // logs even if the WhatsApp alert below is the one message that can't
    // arrive, since a down WhatsApp session is exactly what would swallow it.
    // The admin panel (app/dashboard/admin/AdminClient.tsx) is the real,
    // WhatsApp-independent surface for this; this is the best-effort second one.
    const greenApiState = await checkInstanceState();
    const greenApiDown = !greenApiState.ok || !greenApiState.authorized;
    if (greenApiDown) {
      console.error("[invariants] GreenAPI session is not authorized:", JSON.stringify(greenApiState));
    }
    const greenApiLine = greenApiDown
      ? `וואטסאפ לא מחובר: ${greenApiState.ok ? `stateInstance="${greenApiState.stateInstance}"` : greenApiState.error} - שום הודעה אוטומטית לא מגיעה. בדקי ב-dashboard/admin או בקונסולת GreenAPI.`
      : "";

    const report = [formatInvariantReport({ failures, errors }), staleSupportLine, greenApiLine].filter(Boolean).join("\n\n");
    let notified = false;

    if (report) {
      const to = String(process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || "").trim();
      if (to) {
        try {
          await sendWhatsApp(to, `בדיקת נתונים יומית\n\n${report}`, { name: "Kalmea", type: "invariants" });
          notified = true;
        } catch (waErr) {
          // A failed notification must not fail the check. The finding is in
          // the log either way, and losing the report because the messenger
          // was down would be the worse outcome.
          console.error("[invariants] notify failed:", waErr?.message || String(waErr));
        }
      }
    }

    return Response.json({
      success: true,
      healthy: failures.length === 0 && errors.length === 0 && !staleSupport.count,
      notified,
      failures,
      errors,
      results,
      staleSupportMessages: staleSupport.count,
    });
  } catch (err) {
    console.error("[invariants] threw:", err?.message || String(err));
    return Response.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}
