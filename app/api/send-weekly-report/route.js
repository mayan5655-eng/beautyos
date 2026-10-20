// app/api/send-weekly-report/route.js
//
// The Sunday report to HER (not to clients), for every tenant that turned it on in Settings
// (automations.weekly_report === true). It reaches her the same way the evening summary does (lib/ownerNotify),
// so it is an in-app/push notification first and a WhatsApp only if she asked for owner alerts there.
//
// One isolated job per tenant through lib/cronFanout.js, bounded in time; a tenant whose week was empty gets
// nothing. Authorised with CRON_SECRET like every cron that fans out.
import { createClient } from "@supabase/supabase-js";
import { notifyOwner } from "../../../lib/ownerNotify.js";
import { isAuthorizedCron, cronUnauthorized } from "../../../lib/cronAuth";
import { markCronRun } from '../../../lib/cronHeartbeat.js';
import { fanOut } from "../../../lib/cronFanout.js";
import { readAllRows } from "../../../lib/pagedRead.js";
import { liveReceipts } from "../../../lib/till";
import { resolveGoals, goalProgress } from "../../../lib/goals";
import { buildWeeklyReport } from "../../../lib/weeklyReport";
import { sourceLabelHe } from "../../../lib/leadSources";
import { isPersonal } from "../../../lib/calendarKind";

export const maxDuration = 120;

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const dayKey = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(d);
const sumAmount = (rows) => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

async function reportFor(row, now) {
  const tenantId = row.tenant_id;
  const today = dayKey(now);
  const weekStart = dayKey(new Date(now.getTime() - 7 * 864e5));
  const prevStart = dayKey(new Date(now.getTime() - 14 * 864e5));
  const monthStart = today.slice(0, 8) + "01";
  const earliest = monthStart < prevStart ? monthStart : prevStart;
  // Appointments from the week's start too: read only from the 1st, "this week" early in a month counted just the days since
  // the 1st (2026-10-20 audit).
  const apptFrom = monthStart < weekStart ? monthStart : weekStart;

  const [rc, ap, ld, cl] = await Promise.all([
    supabase.from("receipts").select("id, amount, created_at").eq("tenant_id", tenantId).gte("created_at", earliest),
    supabase.from("appointments").select("date, kind, confirmation_status").eq("tenant_id", tenantId).gte("date", apptFrom).lte("date", today),
    supabase.from("leads").select("source, created_at").eq("tenant_id", tenantId).gte("created_at", weekStart),
    supabase.from("clients").select("id, created_at").eq("tenant_id", tenantId).gte("created_at", weekStart),
  ]);
  if (rc.error || ap.error) throw new Error(`reads failed: ${(rc.error || ap.error).message}`);

  const ids = (rc.data || []).map((r) => r.id);
  let voids = [];
  if (ids.length) {
    const v = await supabase.from("receipt_voids").select("receipt_id, credit_status").in("receipt_id", ids);
    // A failed read is not "nothing voided": voided receipts would count as income in her numbers.
    if (v.error) throw new Error(`voids read failed: ${v.error.message}`);
    voids = v.data || [];
  }
  const live = liveReceipts(rc.data || [], voids);
  const inRange = (r, from, to) => { const d = dayKey(new Date(r.created_at)); return d >= from && (!to || d < to); };
  const weekRevenue = sumAmount(live.filter((r) => inRange(r, weekStart, null)));
  const prevWeekRevenue = sumAmount(live.filter((r) => inRange(r, prevStart, weekStart)));
  const monthRevenue = sumAmount(live.filter((r) => inRange(r, monthStart, null)));

  const readAppts = (ap.data || []).filter((a) => !isPersonal(a));
  const monthAppts = readAppts.filter((a) => a.date >= monthStart);
  const cancelled = monthAppts.filter((a) => a.confirmation_status === "cancelled");
  const weekAppts = readAppts.filter((a) => a.date >= weekStart);
  const bySource = new Map();
  for (const l of ld.data || []) {
    const k = sourceLabelHe(l.source);
    bySource.set(k, (bySource.get(k) || 0) + 1);
  }
  const top = [...bySource.entries()].sort((a, b) => b[1] - a[1])[0];

  const goals = resolveGoals(row.automations);
  return buildWeeklyReport({
    weekRevenue,
    prevWeekRevenue,
    bookings: weekAppts.filter((a) => a.confirmation_status !== "cancelled").length,
    cancellations: weekAppts.filter((a) => a.confirmation_status === "cancelled").length,
    newLeads: (ld.data || []).length,
    newClients: (cl.data || []).length,
    topSource: top && top[1] > 1 ? top[0] : null,
    monthRevenue: goalProgress(monthRevenue, goals.revenue),
    monthBookings: goalProgress(monthAppts.length - cancelled.length, goals.bookings),
    goals,
  });
}

export async function POST(request) {
  if (!isAuthorizedCron(request)) return cronUnauthorized();
  await markCronRun('send-weekly-report');
  try {
    const s = await readAllRows(supabase, "settings", { columns: "tenant_id, business_phone, branding, automations", order: "tenant_id" });
    if (s.error) throw new Error(`settings read failed: ${s.error.message}`);
    if (!s.complete) throw new Error(`settings could not be read completely (${s.fetched}/${s.total})`);
    const wanted = (s.data || []).filter((r) => {
      const a = r.automations && typeof r.automations === "object" ? r.automations : {};
      return a.weekly_report === true && a.paused !== true;
    });
    if (!wanted.length) return Response.json({ success: true, sent: 0, message: "אף אחת לא הפעילה" });

    const now = new Date();
    const { outcomes, summary } = await fanOut(wanted, async (r) => {
      const body = await reportFor(r, now);
      if (!body) return "empty";
      await notifyOwner({ tenantId: r.tenant_id, kind: "weekly_report", title: "השבוע שעבר בקצרה", body, settingsRow: r });
      return "sent";
    }, { keyOf: (r) => r.tenant_id, concurrency: 4, budgetMs: 60_000, itemTimeoutMs: 30_000, now: () => Date.now() });

    return Response.json({ success: summary.complete, sent: outcomes.filter((o) => o.value === "sent").length, fanout: summary }, { status: summary.complete ? 200 : 207 });
  } catch (e) {
    console.error("[weekly-report] threw:", e?.message || String(e));
    return Response.json({ success: false, error: "internal" }, { status: 500 });
  }
}

export async function GET(request) {
  return POST(request);
}
