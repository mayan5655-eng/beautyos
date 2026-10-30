// app/api/send-greetings/route.js
//
// Daily job for personal greetings (birthday, "שנה אצלי", holiday). Runs at the same times as the smart reminders (vercel.json),
// for every business that switched at least one greeting on. Everything is OFF until she turns it on (lib/greetings/greetings.js).
//
// Greetings are outreach: lib/whatsapp.js can only QUEUE them in "הודעות מוכנות לשליחה", and she sends each one from her own
// WhatsApp. This job never sends to a client by itself, and its answer says queued, not sent.
//
// ?dryRun=1 plans and counts without queueing or logging.
// ?tenant=<id> runs for that one business only (the smoke test uses it so a test run never touches anyone else's queue).

import { createClient } from "@supabase/supabase-js";
import { sendWhatsApp } from "../../../lib/whatsapp";
import { isAuthorizedCron, cronUnauthorized } from "../../../lib/cronAuth";
import { markCronRun } from "../../../lib/cronHeartbeat.js";
import { isDemoTenantId } from "../../../lib/demoTenants.ts";
import { readAllRows } from "../../../lib/pagedRead.js";
import { anyGreetingOn, normalizeGreetings, sendWindow } from "../../../lib/greetings/greetings.js";
import { queueGreetingsForTenant } from "../../../lib/greetings/run.js";
import { holidaysBetween, isYomTov } from "../../../lib/greetings/calendar.ts";

export const maxDuration = 300;

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function POST(request) {
  if (!isAuthorizedCron(request)) return cronUnauthorized();
  await markCronRun('send-greetings');
  try {
    const params = new URL(request.url).searchParams;
    const dryRun = params.get("dryRun") === "1";
    const onlyTenant = params.get("tenant") || null;
    const now = new Date();
    const win = sendWindow(now, { isYomTov });
    if (!win.ok && !dryRun) return Response.json({ success: true, queued: 0, held: win.reason });

    const rows = await readAllRows(supabase, "settings", { columns: "id, tenant_id, automations", order: "tenant_id" });
    if (rows.error || !rows.complete) throw new Error(`settings read failed: ${rows.error?.message || "incomplete"}`);
    const tenants = (rows.data || []).filter((r) => {
      const a = r.automations && typeof r.automations === "object" ? r.automations : {};
      if (onlyTenant && r.tenant_id !== onlyTenant) return false;
      return !isDemoTenantId(r.tenant_id) && a.paused !== true && anyGreetingOn(normalizeGreetings(a.greetings));
    });

    const summary = { tenants: tenants.length, queued: 0, failed: 0, deferred: 0, errors: 0, results: [] };
    for (const t of tenants) {
      try {
        const r = await queueGreetingsForTenant({ db: supabase, send: sendWhatsApp, tenantId: t.tenant_id, now, holidaysFor: holidaysBetween, isYomTov, dryRun });
        summary.queued += r.queued + r.sent;
        summary.failed += r.failed;
        summary.deferred += r.deferred;
        summary.results.push({ tenantId: t.tenant_id, queued: r.queued, failed: r.failed, deferred: r.deferred, held: r.held });
      } catch (err) {
        summary.errors++;
        console.error(`[send-greetings] tenant ${t.tenant_id} failed:`, err?.message);
      }
    }
    console.log(`[send-greetings] ${dryRun ? "DRY RUN" : "live"} tenants=${summary.tenants} queued=${summary.queued} failed=${summary.failed} errors=${summary.errors}`);
    return Response.json({ success: true, dryRun, ...summary });
  } catch (err) {
    console.error("[send-greetings] aborted:", err?.message);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET(request) {
  return POST(request);
}
