// app/api/send-reminders/route.js
// Sends WhatsApp reminders for tomorrow's appointments, for ALL tenants.
// Runs via Vercel Cron once a day. Multi-tenant aware: each reminder uses
// the correct business name for the tenant that owns that appointment.

import { createClient } from "@supabase/supabase-js";
import { sendWhatsApp } from "../../../lib/whatsapp";

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

export async function POST() {
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

    // Load all business names once, so we don't query settings per appointment.
    // Map of tenant_id -> business_name.
    const { data: settingsRows } = await supabase
      .from("settings")
      .select("tenant_id, business_name");
    const businessNameByTenant = {};
    (settingsRows || []).forEach((row) => {
      businessNameByTenant[row.tenant_id] = row.business_name || "העסק";
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL;

    // Send a reminder to each appointment, using its tenant's business name.
    const results = [];
    for (const appt of appointments) {
      if (!appt.client_phone) {
        results.push({ name: appt.name, status: "אין מספר טלפון" });
        continue;
      }

      const businessName = businessNameByTenant[appt.tenant_id] || "העסק";
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

// Allow Vercel Cron (which uses GET) to trigger the same logic
export async function GET() {
  return POST();
}