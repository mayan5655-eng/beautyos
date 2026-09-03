// app/api/send-smart-reminders/route.js
//
// Sends FOUR kinds of automated WhatsApp reminders, for ALL tenants:
//   1. winback      - clients whose last visit was 90+ days ago
//   2. package_done - clients who finished a treatment package
//   3. review       - clients who had a treatment ~2 days ago
//   4. birthday     - clients whose birthday is today
//
// Anti-spam: every send is logged to auto_reminders_log so the same client
// never gets the same reminder twice.
//
// Runs via Vercel Cron once a day. Multi-tenant aware.
// Supports ?dryRun=1 to PREVIEW without sending (used for manual testing).
//
// ── The logic lives in lib/reminders/smartReminders.js ─────────────────────
// This route is a thin wrapper that supplies the real database and the real
// WhatsApp sender. The engine is separate so it can be run against a synthetic
// 50-tenant dataset with a fake db and a fake sender - production data is far
// too small to exercise the scaling behaviour (9 clients, 0 lapsed), so that
// harness is the only honest proof the caps and the query-count fix work.
// See test-smart-reminders.js.

import { createClient } from "@supabase/supabase-js";
import { sendWhatsApp } from "../../../lib/whatsapp";
import { isAuthorizedCron, cronUnauthorized } from "../../../lib/cronAuth";
import { APP_URL } from "@/lib/appUrl";
import { reviewLink } from "@/lib/reviewToken";
import { runSmartReminders, DEFAULT_CAPS, DEFAULT_CONCURRENCY } from "../../../lib/reminders/smartReminders";

// Vercel's default function timeout is short (10-15s depending on plan) and was
// never declared here. This job makes several round trips before it sends
// anything, so state the ceiling rather than inherit whatever the plan gives.
// The caps in the engine keep the actual work well inside this.
export const maxDuration = 300;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  // Guard: only Vercel Cron (or a caller holding CRON_SECRET) may trigger this
  // all-tenant WhatsApp blast.
  if (!isAuthorizedCron(request)) return cronUnauthorized();

  try {
    const { searchParams } = new URL(request.url);
    const dryRun = searchParams.get("dryRun") === "1";

    const { results, stats } = await runSmartReminders({
      db: supabase,
      send: sendWhatsApp,
      dryRun,
      caps: DEFAULT_CAPS,
      concurrency: DEFAULT_CONCURRENCY,
      // The engine has no imports on purpose - it is built to run against a
      // synthetic dataset - so the signed link is built HERE, where the secret
      // and the base URL already live, and passed in.
      reviewLinkFor: (appointmentId) => reviewLink(APP_URL, appointmentId),
    });

    console.log(
      `[send-smart-reminders] ${dryRun ? "DRY RUN" : "live"} — ` +
      `queries=${stats.queries} considered=${stats.considered} ` +
      `selected=${stats.selected} deferred=${stats.deferredByCap} ` +
      `sent=${stats.sent} failed=${stats.failed} ms=${stats.ms}`
    );

    return Response.json({ success: true, dryRun, results, stats });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}

// Allow Vercel Cron (GET) to trigger the same logic
export async function GET(request) {
  return POST(request);
}
