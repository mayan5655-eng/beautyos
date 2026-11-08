// app/api/send-weekly-report/route.js
//
// The Sunday report to HER (not to clients), for every tenant that turned it on in Settings
// (automations.weekly_report === true). It reaches her the same way the evening summary does (lib/ownerNotify),
// so it is an in-app/push notification first and a WhatsApp only if she asked for owner alerts there.
//
// One isolated job per tenant through lib/cronFanout.js, bounded in time; a tenant whose week was empty gets
// nothing. Authorised with CRON_SECRET like every cron that fans out.
//
// 2026-11-05: the note is now the smart digest, "הסיכום השבועי שלך" (lib/weeklyDigest.ts): last week against the week
// before, up to three actions with one-tap links, one positive line. In-app notification and web push ONLY: no WhatsApp
// copy, even for an owner who turned on WhatsApp owner alerts, because automatic WhatsApp is hidden. It keeps the
// Shabbat and yom tov rule of the client crons (digestCronSlot: vercel.json has an early, a regular and a night entry),
// and a tenant who already got this week's digest is skipped, so no slot sends twice.
// The plain report below (reportFor, lib/weeklyReport.ts) is kept, not deleted: WEEKLY_DIGEST_OFF=1 brings it back.
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
import { buildDigest, digestCronSlot, DIGEST_TITLE } from "../../../lib/weeklyDigest";
import { loadDigestInput } from "../../../lib/weeklyDigestLoad";
import { isYomTov } from "../../../lib/greetings/calendar.ts";

export const maxDuration = 120;

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const dayKey = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(d);
const sumAmount = (rows) => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

async function reportFor(row, now) {
  const tenantId = row.tenant_id;
  const today = dayKey(now);
  // Seven days including today, and the seven before them (2026-10-21 audit: today-7 through today was EIGHT days, so the
  // week looked bigger than the one before it and the same Sunday was counted in two reports).
  const weekStart = dayKey(new Date(now.getTime() - 6 * 864e5));
  const prevStart = dayKey(new Date(now.getTime() - 13 * 864e5));
  const monthStart = today.slice(0, 8) + "01";
  const earliest = monthStart < prevStart ? monthStart : prevStart;
  // Appointments from the week's start too: read only from the 1st, "this week" early in a month counted just the days since
  // the 1st (2026-10-20 audit).
  const apptFrom = monthStart < weekStart ? monthStart : weekStart;

  // Timestamps are read from a day early and cut by the Israeli day below: a bare "YYYY-MM-DD" bound is UTC midnight, which is
  // 02:00-03:00 in Israel, so the first hours of the window were dropped (receipts of the earlier week, leads and new clients).
  const dayBefore = (key) => dayKey(new Date(new Date(`${key}T12:00:00Z`).getTime() - 864e5));
  const [rc, ap, ldRaw, clRaw] = await Promise.all([
    supabase.from("receipts").select("id, amount, created_at").eq("tenant_id", tenantId).gte("created_at", dayBefore(earliest)),
    supabase.from("appointments").select("date, kind, confirmation_status").eq("tenant_id", tenantId).gte("date", apptFrom).lte("date", today),
    supabase.from("leads").select("source, created_at").eq("tenant_id", tenantId).gte("created_at", dayBefore(weekStart)),
    supabase.from("clients").select("id, created_at").eq("tenant_id", tenantId).gte("created_at", dayBefore(weekStart)),
  ]);
  const inWeek = (r) => dayKey(new Date(r.created_at)) >= weekStart;
  const ld = { ...ldRaw, data: (ldRaw.data || []).filter(inWeek) };
  const cl = { ...clRaw, data: (clRaw.data || []).filter(inWeek) };
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

const digestOff = () => process.env.WEEKLY_DIGEST_OFF === "1";

// Already sent in the last four days: the slots are exclusive, this is the belt to their braces. A failed read is not
// proof of anything, so it lets the run go ahead (the slot rule alone already allows one run a week).
async function alreadySent(tenantId, now) {
  const { data, error } = await supabase.from("owner_notifications").select("id").eq("tenant_id", tenantId).eq("kind", "weekly_report")
    .gte("created_at", new Date(now.getTime() - 4 * 864e5).toISOString()).limit(1);
  return !error && (data || []).length > 0;
}

async function digestFor(row, now) {
  if (await alreadySent(row.tenant_id, now)) return "duplicate";
  const input = await loadDigestInput(supabase, row.tenant_id, row, now, isYomTov);
  const d = buildDigest(input);
  if (!d) return "empty";
  // whatsapp: false, the digest never goes out as a WhatsApp, whatever owner_alert_whatsapp says.
  await notifyOwner({ tenantId: row.tenant_id, kind: "weekly_report", title: DIGEST_TITLE, body: d.body, settingsRow: row, url: "/dashboard/digest", whatsapp: false });
  return "sent";
}

export async function POST(request) {
  if (!isAuthorizedCron(request)) return cronUnauthorized();
  await markCronRun('send-weekly-report');
  try {
    // Shabbat and yom tov first, before anything is read (lib/weeklyDigest.ts digestCronSlot). ?retry=1 is a manual rerun.
    const retry = new URL(request.url).searchParams.get("retry") === "1";
    const slot = digestCronSlot(new Date(), { isYomTov, retry });
    if (!slot.run) return Response.json({ success: true, sent: 0, skipped: slot.reason });
    const s = await readAllRows(supabase, "settings", { columns: "tenant_id, business_phone, branding, automations, business_hours, working_days, working_hours_start, working_hours_end", order: "tenant_id" });
    if (s.error) throw new Error(`settings read failed: ${s.error.message}`);
    if (!s.complete) throw new Error(`settings could not be read completely (${s.fetched}/${s.total})`);
    const wanted = (s.data || []).filter((r) => {
      const a = r.automations && typeof r.automations === "object" ? r.automations : {};
      return a.weekly_report === true && a.paused !== true;
    });
    if (!wanted.length) return Response.json({ success: true, sent: 0, message: "אף אחת לא הפעילה" });

    const now = new Date();
    const { outcomes, summary } = await fanOut(wanted, async (r) => {
      if (!digestOff()) return digestFor(r, now);
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
