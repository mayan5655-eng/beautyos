// app/api/send-reminders/route.js
// Sends WhatsApp reminders for tomorrow's appointments, for ALL tenants.
// Runs via Vercel Cron once a day. Multi-tenant aware: each reminder uses
// the correct business name for the tenant that owns that appointment.

import { createClient } from "@supabase/supabase-js";
import { sendWhatsApp } from "../../../lib/whatsapp";
import { isAuthorizedCron, cronUnauthorized } from "../../../lib/cronAuth";
import { confirmLinks } from "../../../lib/confirmToken";
import { startMinute } from "../../../lib/apptTime";
import { greet, lines, hebrewDate, timeRange } from "../../../lib/messages.js";
import { isPersonal } from "../../../lib/calendarKind";
import { isMissingColumnError } from "../../../lib/pgError";

// Vercel's default function timeout is short (10-15s depending on plan) and was
// never declared here. This job sends serially to every tenant's appointments
// for tomorrow, so at ~40 sends/day across 50 tenants it needs headroom the
// default does not give.
export const maxDuration = 300;

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
    //
    // CANCELLED ROWS ARE EXCLUDED, and that filter is the whole point of this
    // query rather than a detail of it. Cancelling is a soft update - the row
    // keeps its date and its phone number - so without this the job read a
    // cancelled appointment as an upcoming one and sent its client a reminder
    // for a visit she had already called off, with live confirm and cancel
    // links on the end of it. Every other reader of this table already applies
    // the same rule: lib/apptTime, /api/availability, the booking guard, the
    // in-app calendar and the appointments_no_overlap constraint all treat a
    // cancelled row as a slot that is free and an appointment that is not
    // happening. This job was the one that did not.
    //
    // Filtered in the query rather than in the loop below so a cancelled row
    // never reaches the send path at all, and so "how many are there" in the
    // early return below counts real appointments.
    // `kind` separates a client appointment from one of her own personal
    // events - an accountant meeting, a course, a day off - which live in this
    // same table so that they block a booking through the overlap constraint.
    // Nobody is expecting a WhatsApp about those.
    //
    // Asked for optionally, and dropped if the database has not got the column
    // yet: this file deploys before add_appointment_kind.sql is applied by
    // hand, and a reminder run that fails outright because it named a column
    // too early would be a worse bug than the one it prevents. Without the
    // column every row reads as an appointment, which is exactly today's
    // behaviour. Same bet, and the same test for it, as softCancelAppointment
    // makes for the cancel-audit columns.
    const COLS = "id, name, service, date, hour, start_minute, client_phone, tenant_id, confirmation_status";
    const loadTomorrow = (cols) => supabase
      .from("appointments")
      .select(cols)
      .eq("date", tomorrow)
      .neq("confirmation_status", "cancelled");

    let { data: appointments, error } = await loadTomorrow(COLS + ", kind");
    if (isMissingColumnError(error)) {
      ({ data: appointments, error } = await loadTomorrow(COLS));
    }

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

    // Master switch: "השהיית כל האוטומציות" (settings.automations.paused).
    // A tenant-wide gate ON TOP of reminders_enabled - when it is on, nothing
    // automated goes out for that tenant at all.
    // Fails open: only a literal true pauses, so a missing column or a
    // malformed JSONB value can never silently stop a paying tenant's messages.
    const tenantPaused = (tenantId) => {
      const autos = settingsByTenant[tenantId]?.automations;
      return !!(autos && typeof autos === "object" && autos.paused === true);
    };
    // One log line per tenant per run, not per appointment.
    const pausedLogged = new Set();

    // Same fallback as send-reminder-manual. Without it, a missing env var in
    // production silently produced links reading "undefined/confirm?id=..." -
    // and only on the cron path, so the manual button would have looked fine
    // while every automatic reminder went out broken.
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://beautyos-theta.vercel.app";

    // Send a reminder to each appointment, using its tenant's business name.
    const results = [];
    for (const appt of appointments) {
      // Her own blocked-out time is not a client and has nobody to remind.
      // Checked explicitly rather than left to the missing client_phone below,
      // so this never depends on a personal event not acquiring one.
      if (isPersonal(appt)) continue;
      // Master pause first: it overrides the per-type toggle below.
      if (tenantPaused(appt.tenant_id)) {
        if (!pausedLogged.has(appt.tenant_id)) {
          console.log(`[send-reminders] skipped: automations paused for tenant ${appt.tenant_id}`);
          pausedLogged.add(appt.tenant_id);
        }
        results.push({ name: appt.name, status: "מושהה (השהיית אוטומציות)" });
        continue;
      }
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
      // Signed: /api/confirm now requires a token binding the id to the action.
      const { confirmUrl: confirmLink, cancelUrl: cancelLink } = confirmLinks(baseUrl, appt.id);

      // Same voice as the booking confirmation she already received: the same
      // greeting, the same mark, the same way of saying a date. She is hearing
      // from one business, and until now every message sounded like a different
      // one.
      const message = lines(
        greet(appt.name),
        `תזכורת לתור שלך ב${businessName}.`,
        "",
        appt.service,
        `${hebrewDate(appt.date)}, ${timeRange(startMinute(appt), appt.duration)}`,
        "",
        `לאישור: ${confirmLink}`,
        `לביטול: ${cancelLink}`
      );

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