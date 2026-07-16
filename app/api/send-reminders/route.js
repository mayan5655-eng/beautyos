// app/api/send-reminders/route.js
// Sends WhatsApp reminders for tomorrow's appointments, for ALL tenants.
// Runs via Vercel Cron once a day. Multi-tenant aware: each reminder uses
// the correct business name for the tenant that owns that appointment.

import { createClient } from "@supabase/supabase-js";
import { sendWhatsApp } from "../../../lib/whatsapp";
import { isAuthorizedCron, cronUnauthorized } from "../../../lib/cronAuth";

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
    console.log("TOMORROW DATE:", tomorrow);

    // Get all of tomorrow's appointments (across all tenants).
    // We include tenant_id so we can label each message with the right business.
    const { data: appointments, error } = await supabase
      .from("appointments")
      .select("id, name, service, date, hour, client_phone, tenant_id")
      .eq("date", tomorrow);

    if (error) {
      return Response.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!appointments || appointments.length === 0) {
      return Response.json({ success: true, sent: 0, message: "אין תורים מחר" });
    }

    // Load all settings rows once, so we don't query per appointment. We read
    // the whole row (select "*") rather than named columns on purpose: the
    // reminders_enabled toggle column may not exist yet in every environment,
    // and "*" can't fail on a missing column the way an explicit select would.
    // Map of tenant_id -> settings row.
    const { data: settingsRows } = await supabase.from("settings").select("*");
    const settingsByTenant = {};
    (settingsRows || []).forEach((row) => {
      settingsByTenant[row.tenant_id] = row;
    });

    // Appointment reminders are ON by default: a tenant is skipped only when it
    // has explicitly turned reminders_enabled off. undefined/null (column absent
    // or never set) counts as ON, so behavior matches how the cron ran before
    // the toggle existed.
    const remindersEnabled = (tenantId) =>
      settingsByTenant[tenantId]?.reminders_enabled !== false;

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL;

    // Send a reminder to each appointment, using its tenant's business name.
    const results = [];
    for (const appt of appointments) {
      // Respect the tenant's "appointment reminders" automation toggle.
      if (!remindersEnabled(appt.tenant_id)) {
        results.push({ name: appt.name, status: "מושבת (הגדרות)" });
        continue;
      }
      if (!appt.client_phone) {
        results.push({ name: appt.name, status: "אין מספר טלפון" });
        continue;
      }

      const businessName = settingsByTenant[appt.tenant_id]?.business_name || "העסק";
      const confirmLink = `${baseUrl}/confirm?id=${appt.id}&action=confirm`;
      const cancelLink = `${baseUrl}/confirm?id=${appt.id}&action=cancel`;

      const message =
        `שלום ${appt.name}! 💆‍♀️ תזכורת לתור שלך ב-${businessName}:\n` +
        `📅 ${appt.date} בשעה ${appt.hour}:00\n` +
        `✨ טיפול: ${appt.service}\n\n` +
        `✅ לאישור התור: ${confirmLink}\n` +
        `🚫 לביטול התור: ${cancelLink}`;

      const res = await sendWhatsApp(appt.client_phone, message, {
        name: appt.name,
        type: "reminder",
        tenantId: appt.tenant_id,
      });

      results.push({ name: appt.name, status: res.ok ? "נשלח" : "נכשל" });
    }

    return Response.json({ success: true, date: tomorrow, results });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}

// Allow Vercel Cron (which uses GET) to trigger the same logic. The request is
// passed through so the same authorization guard runs on GET too.
export async function GET(request) {
  return POST(request);
}