// app/api/send-monthly-report/route.js
//
// The note on the 1st of the month to HER (never to clients): "הדוח החודשי שלך: אוקטובר" with one short paragraph, opening
// /dashboard/monthly on the month that just ended. In-app notification and web push ONLY (lib/ownerNotify, whatsapp: false).
//
// On for every business by default: off with her own switch (Settings > My business, automations.monthly_report = false), the
// platform flag (automations.feature_flags.monthly_report_page = false), or the master pause. A month with nothing in it sends
// nothing. Never on Shabbat or yom tov: vercel.json runs this on the 1st to the 3rd, and lib/monthlyFull.ts monthlyCronDue
// lets only a working day through, so a 1st that falls on Shabbat moves to Sunday. A business that already got this month's
// note is skipped, so no day sends twice. One isolated job per tenant through lib/cronFanout.js. Authorised with CRON_SECRET.
import { createClient } from "@supabase/supabase-js";
import { notifyOwner } from "../../../lib/ownerNotify.js";
import { isAuthorizedCron, cronUnauthorized } from "../../../lib/cronAuth";
import { markCronRun } from "../../../lib/cronHeartbeat.js";
import { fanOut } from "../../../lib/cronFanout.js";
import { readAllRows } from "../../../lib/pagedRead.js";
import { isYomTov } from "../../../lib/greetings/calendar.ts";
import { isDemoTenantId } from "../../../lib/demoTenants.ts";
import { monthlyCronDue, monthlyNoticeOn, monthlyNotice, defaultReportMonth, monthKey, monthBounds } from "../../../lib/monthlyFull.ts";
import { loadMonthFull } from "../../../lib/monthlyFullLoad.ts";

export const maxDuration = 120;

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Already sent this month (since the 1st, a day early for the zone). A failed read is not proof of anything: the run goes
// ahead, the 1st to 3rd window and the working-day rule already allow at most a few attempts.
async function alreadySent(tenantId, now) {
  const since = new Date(now.getTime() - 4 * 864e5).toISOString();
  const { data, error } = await supabase.from("owner_notifications").select("id").eq("tenant_id", tenantId).eq("kind", "monthly_report").gte("created_at", since).limit(1);
  return !error && (data || []).length > 0;
}

export async function POST(request) {
  if (!isAuthorizedCron(request)) return cronUnauthorized();
  await markCronRun('send-monthly-report');
  try {
    const now = new Date();
    const due = monthlyCronDue(now, isYomTov);
    if (!due.run) return Response.json({ success: true, sent: 0, skipped: due.reason });

    const s = await readAllRows(supabase, "settings", { columns: "tenant_id, business_phone, automations, business_tax_status", order: "tenant_id" });
    if (s.error) throw new Error(`settings read failed: ${s.error.message}`);
    if (!s.complete) throw new Error(`settings could not be read completely (${s.fetched}/${s.total})`);
    const wanted = (s.data || []).filter((r) => monthlyNoticeOn(r) && !isDemoTenantId(String(r.tenant_id)));
    if (!wanted.length) return Response.json({ success: true, sent: 0, message: "אף אחת לא הפעילה" });

    const month = defaultReportMonth(now);
    const { outcomes, summary } = await fanOut(wanted, async (r) => {
      if (await alreadySent(r.tenant_id, now)) return "duplicate";
      const report = await loadMonthFull(supabase, r.tenant_id, r, month, now);
      const n = monthlyNotice(report);
      if (!n) return "empty";
      await notifyOwner({ tenantId: r.tenant_id, kind: "monthly_report", title: n.title, body: n.body, settingsRow: r, url: `/dashboard/monthly?m=${monthKey(month)}`, whatsapp: false });
      return "sent";
    }, { keyOf: (r) => r.tenant_id, concurrency: 4, budgetMs: 90_000, itemTimeoutMs: 30_000, now: () => Date.now() });

    return Response.json({ success: summary.complete, month: monthBounds(month).from.slice(0, 7), sent: outcomes.filter((o) => o.value === "sent").length, fanout: summary }, { status: summary.complete ? 200 : 207 });
  } catch (e) {
    console.error("[monthly-report] threw:", e?.message || String(e));
    return Response.json({ success: false, error: "internal" }, { status: 500 });
  }
}

export async function GET(request) {
  return POST(request);
}
