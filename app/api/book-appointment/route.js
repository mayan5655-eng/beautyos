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
import { dayHoursFrom } from "../../../lib/businessHours";
import { confirmLinks } from "../../../lib/confirmToken";
import { APP_URL } from "../../../lib/appUrl";
import { greet, lines, hebrewDate, hebrewDateShort, timeRange, durationHe, mapsLink } from "../../../lib/messages.js";
import { normalizeIsraeliMobile, PHONE_ERROR_HE } from "../../../lib/phone";
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

    // The phone is the whole point of the booking: it is how she confirms it,
    // how the reminder reaches her, and how the cosmetician contacts her if
    // anything changes. Validated HERE and not only in the page, because the
    // page is a browser form and this route is reachable directly.
    //
    // Strict Israeli-mobile — the same rule the leads importer uses, and the
    // same sentence the page shows. A caller who gets past the client should
    // not receive a different explanation from the server.
    const phoneCheck = normalizeIsraeliMobile(phone);
    if (!phoneCheck.ok) {
      return Response.json(
        { success: false, error: PHONE_ERROR_HE[phoneCheck.reason] },
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

    // The service must be a real, ACTIVE row on this tenant's menu. Enforced
    // here and not only by which services the page renders, for the same
    // reason as business hours below: the page filters archived services out,
    // but this endpoint is reachable directly, so an old deep link (or a
    // crafted POST) could book a service she archived - archived means
    // archived everywhere. The row's own price and duration also override
    // whatever the client sent: the menu is hers, not the caller's.
    const { data: svcRows, error: svcError } = await supabase
      .from("service_prices")
      .select("name, price, duration, color, active")
      .eq("tenant_id", activeTenantId)
      .eq("name", service)
      .limit(1);
    if (svcError) {
      console.error("[book-appointment] service lookup failed:", svcError.message);
      return Response.json(
        { success: false, error: "לא הצלחנו לבדוק את השירות, נסי שוב" },
        { status: 500 }
      );
    }
    const svcRow = svcRows && svcRows[0];
    if (!svcRow || svcRow.active === false) {
      return Response.json(
        { success: false, error: "השירות הזה כבר לא זמין להזמנה. רעננו את העמוד לרשימה העדכנית." },
        { status: 409 }
      );
    }
    // Server-side truth for the booking's numbers. The client's values are
    // used only where the row is silent (a legacy row with null duration).
    const svcDuration = Number(svcRow.duration) > 0 ? Number(svcRow.duration) : Number(duration) > 0 ? Number(duration) : 60;
    const svcPrice = Number.isFinite(Number(svcRow.price)) ? Number(svcRow.price) : Number(price) || 0;
    const svcColor = svcRow.color || color || "#E91E63";

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

    // 0b. HER HOURS ARE HERS. The in-app picker now offers a margin either side
    //     of the working day so she can take one late client without editing
    //     her whole schedule. That is HER override, and it stops at this route:
    //     a stranger with the booking link gets the hours she published and
    //     nothing around them.
    //
    //     Enforced here and not only by which chips the page renders, for the
    //     same reason the minimum-notice rule above is: the page is a browser
    //     form and this endpoint is reachable directly. Until now nothing on
    //     the server looked at business hours at all, so a crafted POST could
    //     book 03:00, or a day she is closed - the page simply never offered
    //     it. That mattered less when an out-of-hours row could only have come
    //     from a hand-written request; now that she can legitimately create one
    //     herself, a client-created 03:00 would be indistinguishable from her
    //     own deliberate override.
    //
    //     Read once, here, and reused for the notification messages below.
    const { data: settingsRows } = await supabase
      .from("settings")
      .select("business_name, business_phone, business_hours, working_hours_start, working_hours_end, working_days, therapist_name, branding")
      .eq("tenant_id", activeTenantId)
      .limit(1);
    const settingsRow =
      settingsRows && settingsRows.length > 0 ? settingsRows[0] : null;

    {
      // Midday, not midnight: the weekday of a plain date is what is wanted,
      // and noon cannot be pushed across a day boundary by an offset.
      const weekday = new Date(String(date) + "T12:00:00").getDay();
      // With no settings row at all, dayHoursFrom falls back to its own legacy
      // defaults rather than returning null - so a missing row degrades to a
      // rule, never to no rule.
      const dh = dayHoursFrom(settingsRow, weekday);
      const bookedEnd = newStart + svcDuration;
      if (!dh) {
        return Response.json(
          { success: false, error: "העסק סגור בתאריך הזה. נא לבחור מועד אחר." },
          { status: 409 }
        );
      }
      if (newStart < dh.open * 60 || bookedEnd > dh.close * 60) {
        return Response.json(
          {
            success: false,
            error: `השעה הזו מחוץ לשעות הפעילות (${fmtTime(dh.open*60)}–${fmtTime(dh.close*60)}). נא לבחור מועד אחר.`,
          },
          { status: 409 }
        );
      }
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
        svcDuration,
        (sameDay || []).filter((a) => a.confirmation_status !== "cancelled")
      );
      if (clash) {
        return Response.json(
          { success: false, error: "השעה הזו כבר תפוסה, נא לבחור שעה אחרת" },
          { status: 409 }
        );
      }
    }

    // 0c. THE CLIENT THIS BOOKING BELONGS TO.
    //
    // Until now this route wrote name and client_phone onto the appointment and
    // NO client_id, and never looked one up. Every online booking was therefore
    // an orphan: it did not appear on the client's card, did not count towards
    // her last visit, did not feed the lapsed-client queue, and did not join
    // anything the cosmetician sees when she opens that woman's history.
    //
    // The quiet consequence was worse than the visible one. smartReminders
    // resolves a client from appt.client_id and skips the row when there is
    // none - so the review request never fired for a single self-booked visit.
    // The reviews feature was structurally blind to exactly the people most
    // likely to leave one: the ones who found her online.
    //
    // Matching is done on the NORMALISED number, not the stored string, because
    // clients.phone is a mix by history: rows converted from leads hold e164
    // ("972521234567") while rows she typed by hand hold whatever she typed
    // ("052-123-4567"). Comparing raw would create a second client for a woman
    // who is already in her book, which is worse than not matching at all.
    let clientId = null;
    let isReturningClient = false;
    try {
      const { data: existing } = await supabase
        .from("clients")
        .select("id, phone")
        .eq("tenant_id", activeTenantId);

      const match = (existing || []).find((c) => {
        const n = normalizeIsraeliMobile(c.phone);
        return n.ok && n.e164 === phoneCheck.e164;
      });

      if (match) {
        clientId = match.id;
        isReturningClient = true;
        // Her name is NOT overwritten from this form. The record is hers, and a
        // booking is not the place to rename a woman because she typed her name
        // differently this time.
      } else {
        const { data: created, error: createErr } = await supabase
          .from("clients")
          .insert({
            tenant_id: activeTenantId,
            name,
            // Stored normalised, so the next booking matches on the first try.
            phone: phoneCheck.e164,
            status: "active",
          })
          .select("id")
          .single();
        if (createErr) {
          // Not fatal. A booking that lands without a client card is the old
          // behaviour, and refusing the booking over it would be trading a
          // paying client for a tidy database.
          console.error("[book-appointment] client create failed:", createErr.message);
        } else {
          clientId = created?.id || null;
        }
      }
    } catch (linkErr) {
      console.error("[book-appointment] client link threw:", linkErr?.message || String(linkErr));
    }

    // 1. Save the appointment to Supabase
    const { data: appt, error } = await supabase
      .from("appointments")
      .insert({
        tenant_id: activeTenantId,
        name: name,
        client_phone: phone,
        // The link that was missing. Null only if the lookup and the create
        // both failed, which leaves exactly today's behaviour.
        client_id: clientId,
        service: service,
        date: date,
        // Both written during the transition: start_minute is what the app now
        // reads, hour keeps a deployment running the previous build correct.
        ...startFields(newStart),
        duration: svcDuration,
        price: svcPrice,
        color: svcColor,
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

    // 2. THIS tenant's business name + owner phone, from the row already read
    //    above for the hours check.
    const businessName = settingsRow?.business_name || "העסק";
    const ownerPhone = settingsRow?.business_phone || "";

    // 3. Send confirmation to the CLIENT
    try {
      // WHAT SHE NEEDS, in the order she needs it: what she booked and how
      // long it takes, when, where, with whom, and how to get out of it.
      //
      // The old version gave her the service, a raw ISO date and a start time.
      // "2026-09-05" does not tell anybody it is a Saturday, and a start time
      // with no duration does not let her plan the afternoon around it.
      //
      // THE CANCEL LINK IS THE POINT. It was not here at all: the reminder
      // carried one, but that goes out the day before. A client who books on
      // Monday for Saturday and then cannot come had no way to say so except
      // phoning, so she did not, and it became a no-show. A cancellation four
      // days out is a slot that can be refilled; a no-show is an hour already
      // spent. confirmToken was two files away the whole time.
      const brandJson = (settingsRow?.branding && typeof settingsRow.branding === "object") ? settingsRow.branding : {};
      const address = String(brandJson.public_address || brandJson.address || "").trim();
      const arrivalNote = String(brandJson.arrival_note || "").trim();
      const therapist = String(settingsRow?.therapist_name || "").trim();
      const { cancelUrl } = confirmLinks(APP_URL, appt.id);
      const durationText = durationHe(svcDuration);

      const clientMsg = lines(
        greet(name),
        `התור שלך ב${businessName} נקבע.`,
        "",
        durationText ? `${service} · ${durationText}` : service,
        `${hebrewDate(date)}, ${timeRange(newStart, svcDuration)}`,
        therapist ? `מטפלת: ${therapist}` : null,
        address ? "" : null,
        address ? `📍 ${address}` : null,
        address ? mapsLink(address) : null,
        arrivalNote ? "" : null,
        arrivalNote || null,
        "",
        "לא מתאים לך? אפשר לבטל כאן:",
        cancelUrl
      );
      await sendWhatsApp(phone, clientMsg, { name: name, type: "booking_confirm", tenantId: activeTenantId });
    } catch (waErr) {
      console.log("Client WhatsApp failed:", waErr.message);
    }

    // 4. Send alert to the BUSINESS OWNER (only if she has a phone set)
    if (ownerPhone) {
      try {
        // READ MID-TREATMENT, on a phone, one-handed. The first line has to
        // answer the only question she has while holding someone's face: WHEN,
        // and does it collide with anything.
        //
        // The old version opened with a bell emoji and put the date fourth, in
        // ISO. It also ended with "(נקבע דרך דף ההזמנות)" - provenance she does
        // not need in a notification, and which self_booked already records on
        // the row.
        //
        // "לקוחה חדשה" is possible only because this route now links the
        // booking to a client: it is the difference between greeting a stranger
        // and greeting someone whose last visit she can look up.
        const ownerMsg = lines(
          `תור חדש · ${hebrewDateShort(date)}, ${timeRange(newStart, svcDuration)}`,
          `${name} · ${service}${durationText ? ` (${durationText})` : ""}`,
          isReturningClient ? "לקוחה חוזרת" : "לקוחה חדשה",
          phone
        );
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
