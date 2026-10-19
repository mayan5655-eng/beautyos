// app/api/book-appointment/route.js
// Handles public self-booking: saves the appointment,
// notifies the business owner AND confirms to the client (WhatsApp)
// Multi-tenant: tenant is resolved from the `tenantId` sent by the /book page
// (which reads it from the ?t= URL param). Owner phone + business name are
// looked up per-tenant from settings.

import { createClient } from "@supabase/supabase-js";
import { after } from "next/server";

import { toMinutes, clashesWith, startFields, fmtTime } from "../../../lib/apptTime";
import { isTooSoonForSelfBooking, isTooFarAhead, resolveBookingRules, bookingTermsRequired } from "../../../lib/bookingPolicy";
import { dayHoursFrom } from "../../../lib/businessHours";
import { resolveLunch, overlapsLunch } from "../../../lib/lunchBreak";



import { sendBookingNotifications } from "../../../lib/bookingNotify";
import { normalizeIsraeliMobile, PHONE_ERROR_HE } from "../../../lib/phone";
import { checkIpLimit, checkTenantLimit, checkPhoneLimit, maskPhone } from "../../../lib/rateLimit";
import { raiseOpsAlert } from "../../../lib/opsAlert";
import { consentFields } from "../../../lib/marketingConsent.js";
import { suppressionHash } from "../../../lib/clientData";
import { APP_URL } from "../../../lib/appUrl";
import { growUiEnabled } from "../../../lib/grow/adapter";
import { activePolicy, recordConsentAndStart, releaseExpiredHolds } from "../../../lib/grow/cancelFees";
import { CARD_CONSENT_TEXT_HE } from "../../../lib/grow/tokenFlow";
import { feeAmount, policyAppliesToService } from "../../../lib/cancellationPolicy";
import { cancelDeps } from "../grow/_cancel";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// A blocked booking is written to ops_events, ONCE per key per window (event.first), after the response has gone. No WhatsApp: there is
// no operator number/send here, so the row is the whole alert. The phone is masked; a flood must not become a flood of writes.
const logBlock = (tenantId) => (e) => {
  if (!e.first) return;
  after(() =>
    raiseOpsAlert({
      db: supabase,
      source: "rate-limit:book-appointment",
      severity: "warning",
      message: `public booking blocked: ${e.scope} over ${e.policy}`,
      details: { scope: e.scope, policy: e.policy, key: e.scope === "phone" ? maskPhone(e.key) : e.key, tenantId: tenantId || null, retryAfterSec: e.retryAfterSec },
    }).catch(() => {})
  );
};

export async function POST(request) {
  try {
    // Abuse cap, per-IP, BEFORE the body is read - a flood should not get as
    // far as parsing JSON. This route is unauthenticated and runs on the
    // service-role key, so "how often" is the only lever there is.
    // See lib/rateLimit.ts for the numbers and why they are what they are.
    const ipLimited = checkIpLimit(request, "book-appointment", logBlock(null));
    if (ipLimited) return ipLimited;
    // The same caller over an hour: stops a slow script that stays under the ten-minute cap all day.
    const ipHourly = checkIpLimit(request, "book-appointment-hourly", logBlock(null));
    if (ipHourly) return ipHourly;

    const { name: rawName, phone, service, date, hour, startMinute, duration, price, color, tenantId, marketingConsent, acceptedTerms, acceptedPolicy, acceptedCardSave } =
      await request.json();
    // The page trims, but this route is reachable directly: collapse whitespace and cap the length so a megabyte
    // name cannot be stored or pasted into the owner's WhatsApp text.
    const name = String(rawName ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);

    // Basic validation
    if (!name || !phone || !service || !date || (hour === undefined && startMinute === undefined)) {
      return Response.json(
        { success: false, error: "חסרים פרטים" },
        { status: 400 }
      );
    }

    // A real calendar day only: "2026-02-30" used to pass the day arithmetic and fail inside Postgres as a raw 500.
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date + "T12:00:00Z").toISOString().slice(0, 10) !== date) {
      return Response.json({ success: false, error: "התאריך לא תקין, אפשר לבחור שוב?" }, { status: 400 });
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

    // Per PHONE NUMBER, a few attempts an hour: the number is validated above, so this key cannot be varied by typos.
    const phoneLimited = checkPhoneLimit(phoneCheck.e164, "book-appointment-hourly", logBlock(tenantId));
    if (phoneLimited) return phoneLimited;

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
    const tenantLimited = checkTenantLimit(activeTenantId, "book-appointment", logBlock(activeTenantId));
    if (tenantLimited) return tenantLimited;

    // The service must be a real, ACTIVE row on this tenant's menu. Enforced
    // here and not only by which services the page renders, for the same
    // reason as business hours below: the page filters archived services out,
    // but this endpoint is reachable directly, so an old deep link (or a
    // crafted POST) could book a service she archived - archived means
    // archived everywhere. The row's own price and duration also override
    // whatever the client sent: the menu is hers, not the caller's.
    //
    // Fired together, not one after another: none of these four reads
    // depends on another's RESULT, only on activeTenantId/date/service,
    // which are already known. The original code awaited them one at a
    // time - service, then settings, then same-day appointments, then the
    // full client list - which was four sequential Supabase round trips a
    // booking had to pay for before it could even start validating. Checked
    // below in the same order and with the same error precedence the
    // sequential version had, so behaviour is unchanged - only the waiting
    // is parallel now.
    // Her cancellation policy on top of Grow (lib/grow/cancelFees.ts). Read HERE, before the calendar is, because a deposit hold that ran out must be released
    // first: otherwise a slot whose 30 minutes are over would still look taken. Any failure (Grow screens off, no table yet, not connected) means "no policy":
    // the booking then works exactly as it always did. Never blocked by plan.
    let policy = null;
    let policyDeps = null;
    try {
      policyDeps = growUiEnabled() ? cancelDeps() : null;
      if (policyDeps) {
        await releaseExpiredHolds(policyDeps, activeTenantId);
        policy = await activePolicy(policyDeps, activeTenantId);
      }
    } catch (policyErr) {
      console.warn("[book-appointment] cancellation policy unreadable, booking without it:", policyErr?.message || String(policyErr));
      policy = null;
    }

    const [
      { data: svcRows, error: svcError },
      { data: settingsRows },
      { data: sameDay },
      { data: existing },
    ] = await Promise.all([
      supabase
        .from("service_prices")
        .select("*")
        .eq("tenant_id", activeTenantId)
        .eq("name", service)
        .limit(1),
      supabase
        .from("settings")
        .select("business_name, business_phone, business_hours, working_hours_start, working_hours_end, working_days, therapist_name, branding, automations")
        .eq("tenant_id", activeTenantId)
        .limit(1),
      supabase
        .from("appointments")
        .select("start_minute, hour, duration, confirmation_status")
        .eq("tenant_id", activeTenantId)
        .eq("date", date),
      supabase
        .from("clients")
        .select("id, phone")
        .eq("tenant_id", activeTenantId),
    ]);
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
    // Her own rules (Settings > calendar and services); the defaults are what this route enforced before they
    // existed. The same function the public page uses, so the two never disagree.
    const rules = resolveBookingRules(settingsRows && settingsRows[0] ? settingsRows[0].branding : null);
    // A deposit or a cancellation window is a condition of the booking: the page shows it and asks for a tick, and
    // the server refuses a booking that did not accept it (the route is reachable without the page).
    if (bookingTermsRequired(rules) && acceptedTerms !== true) {
      return Response.json(
        { success: false, error: "כדי לקבוע תור צריך לאשר את תנאי ההזמנה" },
        { status: 400 }
      );
    }
    // Her cancellation policy (read above, before the calendar was looked at). It was read there so that expired deposit holds were released first.
    // Deposit mode covers only the services she marked "requires deposit": any other service books exactly as it always did (no consent, no deposit, no hold).
    if (policy && !policyAppliesToService(policy.mode, svcRow)) policy = null;
    if (policy && acceptedPolicy !== true) {
      return Response.json(
        { success: false, error: "כדי לקבוע תור צריך לאשר את מדיניות הביטולים" },
        { status: 400 }
      );
    }
    // Saving the card is its own required tick (Grow's rule): the policy tick is not enough. Refused here, whatever the page sent.
    if (policy && policy.mode === "saved_card" && acceptedCardSave !== true) {
      return Response.json(
        { success: false, error: "כדי לשמור את הכרטיס צריך לאשר את שמירת פרטי האשראי" },
        { status: 400 }
      );
    }
    if (isTooSoonForSelfBooking(date, newStart, new Date(), rules.minLeadMinutes)) {
      const lead = rules.minLeadMinutes >= 60
        ? `${Math.round(rules.minLeadMinutes / 60)} שעות`
        : `${rules.minLeadMinutes} דקות`;
      return Response.json(
        {
          success: false,
          error: rules.minLeadMinutes > 0
            ? `ניתן לקבוע תור לפחות ${lead} מראש. אפשר לבחור מועד קצת יותר מאוחר?`
            : "המועד הזה כבר עבר. אפשר לבחור מועד קצת יותר מאוחר?",
        },
        { status: 409 }
      );
    }
    if (isTooFarAhead(date, rules.maxDaysAhead)) {
      return Response.json(
        { success: false, error: `ניתן לקבוע תור עד ${rules.maxDaysAhead} ימים מראש. אפשר לבחור מועד קרוב יותר?` },
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
    //     Fetched above, alongside the service row; reused for the
    //     notification messages below.
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
          { success: false, error: "העסק סגור בתאריך הזה, אפשר לבחור יום אחר?" },
          { status: 409 }
        );
      }
      if (newStart < dh.open * 60 || bookedEnd > dh.close * 60) {
        return Response.json(
          {
            success: false,
            error: `השעה הזו מחוץ לשעות הפעילות (${fmtTime(dh.open*60)}–${fmtTime(dh.close*60)}). אפשר לבחור מועד אחר.`,
          },
          { status: 409 }
        );
      }
    }

    // 0b2. HER BREAK IS HERS. A protected window she set once (lib/lunchBreak) that
    //      self-booking cannot take. Enforced here and not only by the busy slots the
    //      page shows, for the same reason as the hours check above. The message does
    //      not say why: a visitor does not need to know it is lunch.
    if (overlapsLunch(resolveLunch(settingsRow?.branding), newStart, svcDuration)) {
      return Response.json(
        { success: false, error: "השעה הזו כבר לא פנויה, אפשר לבחור שעה אחרת?" },
        { status: 409 }
      );
    }

    // 0. Reject double-booking: if a non-cancelled appointment already overlaps
    //    this slot on the same date for this tenant, fail with a friendly message
    //    instead of silently stacking a second appointment on top of it. Mirrors
    //    the in-app overlap guard (cancelled appointments free their slot).
    {
      // Fetched above, alongside the service/settings rows.
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
          { success: false, error: "השעה הזו כבר נתפסה, אפשר לבחור שעה אחרת?" },
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
      // Fetched above, alongside the service/settings/same-day rows.
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
        // The "updates and offers" checkbox changes NOTHING for a client who already has a card. Anyone can type any phone number into this public
        // form, so ticking the box here would let a stranger write a consent record for someone else's number (and, before, clear her opt-out).
        // Consent is recorded only when the form creates a NEW card (below); an existing client gives it on her card or in the consent form.
      } else {
        // A number that asked to stop messages before her card was erased stays suppressed: no consent is recorded from a booking form for it.
        let consentAllowed = marketingConsent === true;
        if (consentAllowed) {
          try {
            const { data: sup } = await supabase.from("marketing_suppressions").select("phone_hash").eq("tenant_id", activeTenantId).eq("phone_hash", suppressionHash(activeTenantId, phoneCheck.e164)).limit(1);
            if (sup && sup.length) consentAllowed = false;
          } catch { /* table not created yet: nothing is suppressed */ }
        }
        const baseRow = {
          tenant_id: activeTenantId,
          name,
          // Stored normalised, so the next booking matches on the first try.
          phone: phoneCheck.e164,
          status: "active",
        };
        let { data: created, error: createErr } = await supabase
          .from("clients")
          .insert(consentAllowed ? { ...baseRow, ...consentFields("booking_page") } : baseRow)
          .select("id")
          .single();
        if (createErr && consentAllowed) {
          // Most likely the consent columns do not exist yet (migration pending): keep the booking, drop only the consent.
          console.error("[book-appointment] client create with consent failed, retrying without it:", createErr.message);
          ({ data: created, error: createErr } = await supabase.from("clients").insert(baseRow).select("id").single());
        }
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
    const heldForDeposit = !!(policy && policy.mode === "deposit" && feeAmount(policy.deposit, svcPrice) > 0);
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
        // Deposit mode with a real deposit: held as PENDING for 30 minutes (the slot stays blocked); a paid deposit confirms it, an unpaid one releases it.
        confirmation_status: heldForDeposit ? "pending" : "confirmed",
        // True only after the WhatsApp message really went out (lib/bookingNotify.js sets it).
        confirmation_sent: false,
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
          { success: false, error: "השעה הזו כבר נתפסה, אפשר לבחור שעה אחרת?" },
          { status: 409 }
        );
      }
      console.error("[book-appointment] appointment insert failed:", error.message);
      return Response.json({ success: false, error: "משהו נתקע אצלנו, אפשר לנסות שוב בעוד רגע?" }, { status: 500 });
    }

    // 2. THIS tenant's business name + owner phone, from the row already read
    //    above for the hours check.
    const businessName = settingsRow?.business_name || "העסק";
    const ownerPhone = settingsRow?.business_phone || "";

    // 3+4. Client confirmation + owner alert, via the ONE shared template
    //      (lib/bookingNotify) - the same messages the gap-fill claim sends,
    //      so the two flows cannot drift. The long rationale for the message
    //      shape lives there.
    //
    //      Scheduled with next/server's after(), not awaited, on purpose.
    //      The appointment above is already committed - this must never be
    //      able to delay, let alone fail, the response the browser is
    //      waiting on. It used to be awaited here, which meant a slow
    //      WhatsApp attempt (or, after the open-launch redesign, the extra
    //      owner_notifications/push_subscriptions round-trips) sat directly
    //      in the booking critical path - on a cold start or a real network
    //      hiccup, long enough to hit a serverless timeout and hand the
    //      browser a 502/504 for a booking that had already succeeded.
    //      after() (not a bare un-awaited promise) is what actually keeps
    //      this running past the response on Vercel - a plain fire-and-
    //      forget promise can get frozen/dropped the instant the response is
    //      sent, which would make it a coin flip whether either message ever
    //      goes out at all. sendBookingNotifications already catches both
    //      its own halves internally (see that file); this .catch is only
    //      for a throw that somehow escapes both.
    // A held booking is not confirmed yet: its confirmation goes out when the deposit is paid (app/api/grow/_cancel.ts afterPaidHook).
    if (!heldForDeposit) after(() =>
      sendBookingNotifications({
        settingsRow,
        tenantId: activeTenantId,
        appointmentId: appt.id,
        name,
        phone,
        service,
        date,
        startMinute: newStart,
        duration: svcDuration,
        isReturningClient,
      }).catch((notifyErr) => {
        console.error("[book-appointment] notifications failed:", notifyErr?.message || String(notifyErr));
      })
    );

    // What she agreed to is stored, and the next step opens on Grow's hosted page (save a card, or pay the deposit). The booking stands whatever
    // happens here: a step that could not start is reported to the page and stays visible to her.
    let policyStep = null;
    if (policy && policyDeps) {
      try {
        const r = await recordConsentAndStart(policyDeps, {
          tenantId: activeTenantId, appointmentId: String(appt.id), clientId: clientId ? String(clientId) : null, clientName: name, phone,
          servicePrice: svcPrice, serviceName: service, policy, returnUrl: `${APP_URL}/book?t=${activeTenantId}`, cardConsentText: CARD_CONSENT_TEXT_HE,
        });
        policyStep = r.step;
      } catch (stepErr) {
        console.error("[book-appointment] policy consent failed:", stepErr?.message || String(stepErr));
        policyStep = { kind: policy.mode, url: null, error: "failed" };
      }
    }

    return Response.json({
      success: true,
      appointmentId: appt.id,
      policyStep,
      // What she asked for up front, so the confirmation screen can say how to pay it.
      deposit: rules.depositAmount > 0 ? { amount: rules.depositAmount, note: rules.depositNote } : null,
    });
  } catch (err) {
    console.error("[book-appointment] failed:", err?.message);
    return Response.json({ success: false, error: "משהו נתקע אצלנו, אפשר לנסות שוב בעוד רגע?" }, { status: 500 });
  }
}
