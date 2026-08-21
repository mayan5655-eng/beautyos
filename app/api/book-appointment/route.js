// app/api/book-appointment/route.js
// Handles public self-booking: saves the appointment,
// notifies the business owner AND confirms to the client (WhatsApp)
// Multi-tenant: tenant is resolved from the `tenantId` sent by the /book page
// (which reads it from the ?t= URL param). Owner phone + business name are
// looked up per-tenant from settings.

import { createClient } from "@supabase/supabase-js";
import { sendWhatsApp } from "../../../lib/whatsapp";
import { toMinutes, clashesWith, startFields, fmtTime } from "../../../lib/apptTime";
import { isTooSoonForSelfBooking, SELF_BOOKING_MIN_LEAD_MINUTES } from "../../../lib/bookingPolicy";
import { checkIpLimit, checkTenantLimit } from "../../../lib/rateLimit";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    // Abuse cap, per-IP, BEFORE the body is read - a flood should not get as
    // far as parsing JSON. This route is unauthenticated and runs on the
    // service-role key, so "how often" is the only lever there is.
    // See lib/rateLimit.ts for the numbers and why they are what they are.
    const ipLimited = checkIpLimit(request, "book-appointment");
    if (ipLimited) return ipLimited;

    const { name, phone, service, date, hour, startMinute, duration, price, color, tenantId } =
      await request.json();

    // Basic validation
    if (!name || !phone || !service || !date || (hour === undefined && startMinute === undefined)) {
      return Response.json(
        { success: false, error: "חסרים פרטים" },
        { status: 400 }
      );
    }

    // Tenant must be explicit. We never fall back to a default business -
    // a booking with no tenant must fail rather than land in someone else's
    // account. The /book page passes ?t=<tenantId> through to here.
    if (!tenantId) {
      return Response.json(
        { success: false, error: "קישור ההזמנה אינו תקין (חסר מזהה עסק)" },
        { status: 400 }
      );
    }
    const activeTenantId = tenantId;

    // The second cap, keyed on the business rather than the caller. This is the
    // one that holds when the requests come from many addresses, and it is what
    // stops a stranger filling one cosmetician's day.
    const tenantLimited = checkTenantLimit(activeTenantId, "book-appointment");
    if (tenantLimited) return tenantLimited;

    // Wire format, explicit on BOTH sides - never one field carrying two
    // meanings:
    //   startMinute : minutes from midnight (870 = 14:30)   <- preferred
    //   hour        : a WHOLE hour (14), the legacy field
    //
    // A bare number in `hour` is HOURS. Passing it straight through toMinutes()
    // read it as minutes instead, which silently turned every 09:00 public
    // booking into 00:09. Declared out here because the insert below needs it.
    let newStart = null;
    if (startMinute !== undefined && startMinute !== null) {
      newStart = toMinutes(startMinute);
    } else if (typeof hour === "string" && hour.includes(":")) {
      newStart = toMinutes(hour);
    } else if (hour !== undefined && hour !== null && hour !== "") {
      const asHour = Number(hour);
      newStart = Number.isFinite(asHour) && asHour >= 0 && asHour <= 23 ? asHour * 60 : null;
    }
    if (newStart === null) {
      return Response.json(
        { success: false, error: "שעה לא תקינה" },
        { status: 400 }
      );
    }

    // 0a. Minimum notice. Enforced HERE, not only by hiding slots in the page:
    //     hiding is a display filter and anyone can post to this endpoint
    //     directly. Same shape and same failure direction as the overlap check
    //     below - unparseable input is refused rather than waved through.
    //
    //     Scoped to public self-booking only. The in-app modal does not come
    //     through this route, so she can still add a walk-in starting now, and
    //     gap-fill has its own lead rule in app/api/slots/offer.
    if (isTooSoonForSelfBooking(date, newStart)) {
      return Response.json(
        {
          success: false,
          error: `ניתן לקבוע תור לפחות ${Math.round(SELF_BOOKING_MIN_LEAD_MINUTES / 60)} שעות מראש. נא לבחור מועד מאוחר יותר.`,
        },
        { status: 409 }
      );
    }

    // 0. Reject double-booking: if a non-cancelled appointment already overlaps
    //    this slot on the same date for this tenant, fail with a friendly message
    //    instead of silently stacking a second appointment on top of it. Mirrors
    //    the in-app overlap guard (cancelled appointments free their slot).
    {
      const { data: sameDay } = await supabase
        .from("appointments")
        .select("start_minute, hour, duration, confirmation_status")
        .eq("tenant_id", activeTenantId)
        .eq("date", date);
      // start_minute is the truth; hour*60 is the fallback for rows written
      // before the migration or by an older deployment mid-rollout. Doing this
      // arithmetic by hand here was what let a half-hour booking look free
      // against a full-hour one.
      const clash = clashesWith(
        newStart,
        Number(duration || 60),
        (sameDay || []).filter((a) => a.confirmation_status !== "cancelled")
      );
      if (clash) {
        return Response.json(
          { success: false, error: "השעה הזו כבר תפוסה, נא לבחור שעה אחרת" },
          { status: 409 }
        );
      }
    }

    // 1. Save the appointment to Supabase
    const { data: appt, error } = await supabase
      .from("appointments")
      .insert({
        tenant_id: activeTenantId,
        name: name,
        client_phone: phone,
        service: service,
        date: date,
        // Both written during the transition: start_minute is what the app now
        // reads, hour keeps a deployment running the previous build correct.
        ...startFields(newStart),
        duration: duration || 60,
        price: price || 0,
        color: color || "#E91E63",
        self_booked: true,
        confirmation_status: "confirmed",
        confirmation_sent: true,
      })
      .select()
      .single();

    if (error) {
      // A concurrent booking race → "slot taken", not a raw 500. Two codes,
      // two guarantees:
      //   23505 uniq_appt_slot_active  - someone took the same START MINUTE.
      //   23P01 appointments_no_overlap - someone took an OVERLAPPING range,
      //         e.g. her 14:30+30 landed inside an existing 14:00+60. This is
      //         the case the overlap check above cannot win against a parallel
      //         writer: both requests can read "free" before either inserts.
      if (error.code === "23505" || error.code === "23P01") {
        return Response.json(
          { success: false, error: "השעה הזו כבר תפוסה, נא לבחור שעה אחרת" },
          { status: 409 }
        );
      }
      return Response.json({ success: false, error: error.message }, { status: 500 });
    }

    // 2. Get THIS tenant's business name + owner phone from settings
    const { data: settingsRows } = await supabase
      .from("settings")
      .select("business_name, business_phone")
      .eq("tenant_id", activeTenantId)
      .limit(1);
    const settingsRow =
      settingsRows && settingsRows.length > 0 ? settingsRows[0] : null;
    const businessName = settingsRow?.business_name || "העסק";
    const ownerPhone = settingsRow?.business_phone || "";

    // 3. Send confirmation to the CLIENT
    try {
      const clientMsg =
        `שלום ${name}! 💗\n` +
        `התור שלך נקבע בהצלחה ב${businessName} ✨\n\n` +
        `✨ טיפול: ${service}\n` +
        `📅 תאריך: ${date}\n` +
        `🕐 שעה: ${fmtTime(newStart)}\n\n` +
        `נשמח לראותך! 😊`;
      await sendWhatsApp(phone, clientMsg, { name: name, type: "booking_confirm", tenantId: activeTenantId });
    } catch (waErr) {
      console.log("Client WhatsApp failed:", waErr.message);
    }

    // 4. Send alert to the BUSINESS OWNER (only if she has a phone set)
    if (ownerPhone) {
      try {
        const ownerMsg =
          `🔔 נקבע תור חדש!\n\n` +
          `👤 ${name}\n` +
          `📞 ${phone}\n` +
          `✨ ${service}\n` +
          `📅 ${date} בשעה ${fmtTime(newStart)}\n\n` +
          `(נקבע דרך דף ההזמנות)`;
        await sendWhatsApp(ownerPhone, ownerMsg, { name: "בעלת העסק", type: "owner_alert", tenantId: activeTenantId });
      } catch (waErr) {
        console.log("Owner WhatsApp failed:", waErr.message);
      }
    }

    return Response.json({ success: true, appointmentId: appt.id });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
