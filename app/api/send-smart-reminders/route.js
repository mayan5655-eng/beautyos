// app/api/send-smart-reminders/route.js
// Sends THREE kinds of automated WhatsApp reminders, for ALL tenants:
//   1. winback      - clients whose last visit was 90+ days ago
//   2. package_done - clients who finished a treatment package
//   3. review       - clients who had a treatment ~2 days ago (review request)
//
// Anti-spam: every send is logged to auto_reminders_log so the same client
// never gets the same reminder twice.
//
// Runs via Vercel Cron once a day. Multi-tenant aware.
// Supports ?dryRun=1 to PREVIEW without sending (used for manual testing).

import { createClient } from "@supabase/supabase-js";
import { sendWhatsApp } from "../../../lib/whatsapp";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Returns "YYYY-MM-DD" for `daysAgo` days before today (Israel timezone)
function dateNDaysAgo(daysAgo) {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Jerusalem" })
  );
  now.setDate(now.getDate() - daysAgo);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Check whether a given reminder was already logged (anti-spam)
async function alreadySent(tenantId, clientId, type, referenceId) {
  const { data } = await supabase
    .from("auto_reminders_log")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .eq("reminder_type", type)
    .eq("reference_id", referenceId || "")
    .limit(1);
  return !!(data && data.length > 0);
}

// Record that a reminder was sent (anti-spam)
async function logSent(tenantId, clientId, type, referenceId) {
  await supabase.from("auto_reminders_log").insert({
    tenant_id: tenantId,
    client_id: clientId,
    reminder_type: type,
    reference_id: referenceId || "",
  });
}
export async function POST(request) {
  try {
    const { searchParams } = new URL(request.url);
    const dryRun = searchParams.get("dryRun") === "1";

    // Load all business names once: tenant_id -> business_name
    const { data: settingsRows } = await supabase
      .from("settings")
      .select("tenant_id, business_name");
    const businessNameByTenant = {};
    (settingsRows || []).forEach((row) => {
      businessNameByTenant[row.tenant_id] = row.business_name || "BeautyOS";
    });

    // Load all clients once (we need phone + tenant + id)
    const { data: clients } = await supabase
      .from("clients")
      .select("id, name, phone, tenant_id");
    const clientById = {};
    (clients || []).forEach((c) => { clientById[c.id] = c; });

    const results = { winback: [], package_done: [], review: [] };

    // Helper: send (or preview) one reminder + log it
    async function handleReminder(client, type, referenceId, message) {
      if (!client || !client.phone) {
        results[type].push({ name: client?.name || "?", status: "אין טלפון" });
        return;
      }
      // Skip if we already sent this exact reminder
      if (await alreadySent(client.tenant_id, client.id, type, referenceId)) {
        return;
      }
      if (dryRun) {
        results[type].push({ name: client.name, status: "תצוגה מקדימה (לא נשלח)" });
        return;
      }
      const res = await sendWhatsApp(client.phone, message, {
        name: client.name,
        type: `auto_${type}`,
        tenantId: client.tenant_id,
      });
      if (res.ok) await logSent(client.tenant_id, client.id, type, referenceId);
      results[type].push({ name: client.name, status: res.ok ? "נשלח" : "נכשל" });
    }

    // ============================================================
    // 1. WINBACK - clients whose last appointment was 90+ days ago
    // ============================================================
    const cutoff90 = dateNDaysAgo(90);
    const { data: allAppts } = await supabase
      .from("appointments")
      .select("client_id, date, tenant_id");
    const lastVisitByClient = {};
    (allAppts || []).forEach((a) => {
      if (!a.client_id || !a.date) return;
      const prev = lastVisitByClient[a.client_id];
      if (!prev || a.date > prev) lastVisitByClient[a.client_id] = a.date;
    });

    for (const [clientId, lastDate] of Object.entries(lastVisitByClient)) {
      if (lastDate >= cutoff90) continue; // visited recently - skip
      const client = clientById[clientId];
      if (!client) continue;
      const businessName = businessNameByTenant[client.tenant_id] || "BeautyOS";
      const message =
        `שלום ${client.name}! 💗\n` +
        `מתגעגעים אלייך ב${businessName}!\n` +
        `מזמן לא ראינו אותך — נשמח לפנק אותך בטיפול ✨\n` +
        `רוצה לקבוע תור? פשוט כתבי לנו 😊`;
      await handleReminder(client, "winback", lastDate, message);
    }

    // ============================================================
    // 2. PACKAGE DONE - finished packages not yet notified
    // ============================================================
    const { data: pkgs } = await supabase
      .from("packages")
      .select("id, client_id, service, total_sessions, used_sessions, active, tenant_id");
    for (const pkg of pkgs || []) {
      const finished =
        pkg.active === false ||
        (pkg.total_sessions != null &&
          pkg.used_sessions != null &&
          Number(pkg.used_sessions) >= Number(pkg.total_sessions));
      if (!finished) continue;
      const client = clientById[pkg.client_id];
      if (!client) continue;
      const businessName = businessNameByTenant[client.tenant_id] || "BeautyOS";
      const message =
        `שלום ${client.name}! ✨\n` +
        `סיימת את חבילת ${pkg.service} ב${businessName} — כל הכבוד! 💆‍♀️\n` +
        `רוצה לחדש ולהמשיך את הטיפולים? נשמח להכין לך חבילה חדשה 💗`;
      await handleReminder(client, "package_done", pkg.id, message);
    }

    // ============================================================
    // 3. REVIEW REQUEST - treatment ~2 days ago
    // ============================================================
    const reviewDay = dateNDaysAgo(2);
    const { data: reviewAppts } = await supabase
      .from("appointments")
      .select("id, client_id, service, date, tenant_id")
      .eq("date", reviewDay);
    for (const appt of reviewAppts || []) {
      const client = clientById[appt.client_id];
      if (!client) continue;
      const businessName = businessNameByTenant[client.tenant_id] || "BeautyOS";
      const message =
        `שלום ${client.name}! 💗\n` +
        `תודה שביקרת אצלנו ב${businessName}!\n` +
        `נשמח מאוד אם תשאירי לנו ביקורת ⭐\n` +
        `זה לוקח רק דקה ועוזר לנו מאוד 🙏`;
      await handleReminder(client, "review", appt.id, message);
    }

    return Response.json({ success: true, dryRun, results });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}

// Allow Vercel Cron (GET) to trigger the same logic
export async function GET(request) {
  return POST(request);
}