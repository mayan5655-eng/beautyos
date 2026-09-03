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

    const report = formatInvariantReport({ failures, errors });
    let notified = false;

    if (report) {
      const to = String(process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || "").trim();
      if (to) {
        try {
          await sendWhatsApp(to, `בדיקת נתונים יומית\n\n${report}`, { name: "BloomOS", type: "invariants" });
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
      healthy: failures.length === 0 && errors.length === 0,
      notified,
      failures,
      errors,
      results,
    });
  } catch (err) {
    console.error("[invariants] threw:", err?.message || String(err));
    return Response.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}
