// app/api/send-reminders/route.js
// Sends WhatsApp reminders for tomorrow's appointments

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

    // Get all appointments for tomorrow
    const { data: appointments, error } = await supabase
      .from("appointments")
      .select("id, name, service, date, hour, client_phone")
      .eq("date", tomorrow);

    if (error) {
      return Response.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!appointments || appointments.length === 0) {
      return Response.json({ success: true, sent: 0, message: "אין תורים מחר" });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL;

    // Send a reminder to each appointment
    const results = [];
    for (const appt of appointments) {
      if (!appt.client_phone) {
        results.push({ name: appt.name, status: "אין מספר טלפון" });
        continue;
      }

      const confirmLink = `${baseUrl}/confirm?id=${appt.id}&action=confirm`;
      const cancelLink = `${baseUrl}/confirm?id=${appt.id}&action=cancel`;

      const message =
        `שלום ${appt.name}! 💆‍♀️ תזכורת לתור שלך ב-BeautyOS:\n` +
        `📅 ${appt.date} בשעה ${appt.hour}:00\n` +
        `✨ טיפול: ${appt.service}\n\n` +
        `✅ לאישור התור: ${confirmLink}\n` +
        `🚫 לביטול התור: ${cancelLink}`;

      const res = await sendWhatsApp(appt.client_phone, message, {
        name: appt.name,
        type: "reminder",
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
