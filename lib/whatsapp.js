// lib/whatsapp.js
// Sends WhatsApp messages via GreenAPI

import { createClient } from "@supabase/supabase-js";
// readCredentials import removed: per-tenant instances are no longer used for sending.
import { toWhatsAppNumber, waLink } from "./phone.ts";
import { enforcePublicCap, isPublicType } from "./outboundCap.js";
import { isDemoTenantId } from "./demoTenants.ts";
import { isUtilityAutoSendEnabled } from "./platformSettings.js";

// ── UTILITY vs OUTREACH, per message type ───────────────────────────────────
// Open-launch decision: nothing sends itself automatically EXCEPT the few
// types a client is actively expecting as part of the appointment she
// already booked - and even those fall back to the manual queue the instant
// the central number fails, rather than disappearing into a "failed" log
// row nobody is looking at. Everything else (win-back, gap-fill offers,
// birthday/package/review nudges, lead bulk-sends) is outreach and is ALWAYS
// manual, with no flag that can turn it automatic - that distinction is the
// whole safety design, not a launch-day default to relax later.
//
// "owner_alert" is here too, but it is NOT a blanket client-outreach type:
// lib/ownerNotify.js only ever calls sendWhatsApp with this type when the
// TENANT has opted in (settings.automations.owner_alert_whatsapp === true,
// off by default - Settings → automations). One message to one fixed
// number she already expects to hear from is a different risk shape than
// fan-out to many different client numbers, which is why it's allowed to
// be utility-eligible at all; the opt-in gate lives one layer up, not here.
const UTILITY_TYPES = new Set(["reminder", "booking_confirm", "receipt", "skin_report", "owner_alert"]);

// Messages to Kalmea's OPERATOR, never to a client: the public-send ceiling
// (cap_alert) and every monitoring message the crons and the nightly invariants
// job send (invariants). These are sent for real. They used to be limited to
// cap_alert, so everything sent as "invariants" fell into the manual-only rule
// below - queued as a tenant-less pending_manual row, shown nowhere, delivered to
// nobody - while its callers assumed the operator had been told. See
// test-ops-alert.js.
const PLATFORM_OPS_TYPES = new Set(["cap_alert", "invariants"]);

function isUtilityType(type) {
  return UTILITY_TYPES.has(String(type || ""));
}

// Global fallback credentials (used when a tenant hasn't connected her own).
const ENV_ID_INSTANCE = process.env.GREENAPI_ID_INSTANCE;
const ENV_API_TOKEN = process.env.GREENAPI_API_TOKEN;
const ENV_API_URL = process.env.GREENAPI_API_URL;
const DEFAULT_API_URL = "https://api.green-api.com";

// Supabase client for logging messages + reading per-tenant credentials.
const supabaseLog = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Resolve the GreenAPI credentials to send WITH.
//
// ── ONE INSTANCE: THE CENTRAL KALMEA NUMBER ────────────────────────────────
// Per-tenant GreenAPI instances are DEAD, by decision, after a cosmetician's
// personal WhatsApp number was restricted for being connected to the API.
// Connecting a personal number to an automation API is a ban risk no tenant
// should carry, so the product no longer offers it: every automated message
// (reminders, confirmations, receipts - utility only) goes out from the
// platform's own number, attributed in the message body to her business.
// Marketing never goes through GreenAPI at all - it is sent by the
// cosmetician herself, from her own WhatsApp app, via wa.me compose links.
//
// A previous iteration held the opposite rule ("the env instance is never
// used on a tenant's behalf") to avoid messages arriving from an unfamiliar
// number. That trade lost: an unfamiliar sender is explainable in the message
// text; a banned personal number is not recoverable at all.
//
// Tenant credentials still stored in settings are deliberately ignored here.
// The whatsapp-webhook inbound path still matches on green_api_instance for
// legacy tenants; nothing new writes those columns.
async function resolveCredentials(_tenantId) {
  return {
    idInstance: ENV_ID_INSTANCE,
    apiToken: ENV_API_TOKEN,
    apiUrl: ENV_API_URL || DEFAULT_API_URL,
    source: "env",
    connected: !!(ENV_ID_INSTANCE && ENV_API_TOKEN),
  };
}

// Saves a sent message to the whatsapp_messages table
async function logMessage({ name, phone, body, type, status, greenApiId, errorDetail, tenantId }) {
  try {
    await supabaseLog.from("whatsapp_messages").insert({
      tenant_id: tenantId || null,
      recipient_name: name || null,
      recipient_phone: phone,
      message_body: body,
      message_type: type || "general",
      status: status,
      green_api_id: greenApiId || null,
      error_detail: errorDetail || null,
    });
  } catch (e) {
    // Logging failure should not break message sending
    console.error("Failed to log message:", e.message);
  }
}

// Digits for a GreenAPI chat id, or null when the value cannot be a phone.
//
// This used to strip separators, swap a leading 0 for 972, and return whatever
// was left. "abc" became "abc@c.us", which GreenAPI rejects — so a booking made
// with a junk number saved fine, sent nothing, and told nobody. The client
// believed she had an appointment; the cosmetician had one she could not
// contact; neither of them learned anything was wrong.
//
// Returning null is what lets sendWhatsApp refuse deliberately, log the reason
// against the message row, and hand the caller a result it can act on, instead
// of firing a request that was never going to arrive.
//
// LENIENT on purpose — see the two-function split in lib/phone.ts. This runs
// against numbers ALREADY on file, in every shape a year of imports has
// produced ("0542845655" typed in the app, "972526666306" from an export) plus
// the occasional genuinely foreign number GreenAPI can deliver to. The strict
// Israeli-mobile rule belongs at the point of entry, not here: applying it to
// sends would silently stop messaging real clients whose numbers have worked
// all along.
function formatPhone(phone) {
  return toWhatsAppNumber(phone);
}

// isWhatsAppConnected() used to live here: "true only when THIS tenant has
// connected her OWN instance". Once resolveCredentials stopped ever answering
// "tenant", it could only return false - and three routes (send-receipt,
// send-reminder-manual, the lapsed send) were gated on it, so each refused
// every call with "WhatsApp is not connected". Removed in the truth pass:
// utility messages go from the platform number with no gate, marketing goes
// through wa.me from her own phone, and nothing asks the question any more.

// Main function: sends a WhatsApp text message and logs it
export async function sendWhatsApp(phone, message, options = {}) {
  // First check, before even the phone format: a demo tenant (lib/demoTenants.ts)
  // must never send a real WhatsApp message. No logMessage() either - a fake
  // tenant gets no fabricated entry in a real message log.
  if (isDemoTenantId(options.tenantId)) {
    console.log(`[whatsapp] BLOCKED send for demo tenant ${options.tenantId} (type=${options.type || "?"})`);
    return { ok: false, demoBlocked: true, error: "זו תצוגה - במערכת שלך זה באמת יישלח" };
  }

  // An unusable number is refused here, before any credential lookup or network
  // call. It is still LOGGED, with the reason, because the whole point is that
  // this used to fail invisibly: a booking with a junk phone saved, sent
  // nothing, and appeared nowhere. Now it appears in her message log as a
  // failure she can see and fix.
  const digits = formatPhone(phone);
  if (!digits) {
    const refused = {
      ok: false,
      invalidPhone: true,
      error: "Phone number is not usable",
    };
    console.error(
      `[whatsapp] REFUSED to send for tenant ${options.tenantId || "(none)"}: ` +
      `phone ${JSON.stringify(String(phone ?? ""))} is not a usable number.`
    );
    await logMessage({
      name: options.name,
      phone,
      body: message,
      type: options.type,
      status: "failed",
      errorDetail: "invalid phone number",
      tenantId: options.tenantId,
    });
    return refused;
  }
  const chatId = digits + "@c.us";

  // ── Manual vs automatic, decided per message TYPE, not globally ──────────
  // 'cap_alert' bypasses this entirely: it is Kalmea's own operator being
  // told a tenant hit her public-send ceiling, never a tenant-facing
  // message, and was never part of what "no automated outreach" meant.
  const isPlatformOpsAlert = PLATFORM_OPS_TYPES.has(String(options.type || ""));
  const manualOnly =
    !isPlatformOpsAlert &&
    (!isUtilityType(options.type) || !(await isUtilityAutoSendEnabled(supabaseLog)));

  if (manualOnly) {
    const link = waLink(phone, message);
    const queued = {
      ok: false,
      queued: true,
      waLink: link,
      reason: isUtilityType(options.type) ? "auto_disabled" : "manual_type",
    };
    await logMessage({
      name: options.name,
      phone,
      body: message,
      type: options.type,
      status: "pending_manual",
      tenantId: options.tenantId,
    });
    return queued;
  }

  // From here down: a utility type, with the admin toggle on (or a platform
  // ops alert) - attempt the real send, and fall back to the SAME manual
  // queue on anything that goes wrong, rather than a dead-end "failed" row.
  // This is the whole safety net: automatic never means "or silently lost".
  const fallbackToQueue = async (reason, errorDetail) => {
    const link = waLink(phone, message);
    await logMessage({
      name: options.name,
      phone,
      body: message,
      type: options.type,
      status: "pending_manual",
      errorDetail,
      tenantId: options.tenantId,
    });
    return { ok: false, queued: true, waLink: link, reason, fellBackFromAuto: true };
  };

  // Her own instance, or nothing. Never another business's number.
  const cred = await resolveCredentials(options.tenantId);
  if (!cred.connected) {
    console.error(`[whatsapp] central number not connected for tenant ${options.tenantId || "(none)"}; queueing for manual send instead.`);
    return fallbackToQueue("not_connected", "central WhatsApp number not connected");
  }

  // The daily ceiling on what a stranger can make this number send. Only the
  // message types the public routes produce are counted (lib/outboundCap.js);
  // a reminder never passes through here (not a PUBLIC_TYPE). A tenant hitting
  // this falls back to her manual queue rather than vanishing - the ceiling
  // protects the number, not the client who's still owed a confirmation.
  if (isPublicType(options.type) && options.tenantId) {
    const verdict = await enforcePublicCap({
      db: supabaseLog,
      tenantId: options.tenantId,
      type: options.type,
      send: sendWhatsApp,
      operatorPhone: process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP,
    });
    if (!verdict.allowed) {
      return fallbackToQueue("capped", `daily public-send ceiling (${verdict.count}/${verdict.cap})`);
    }
  }

  const url = `${cred.apiUrl}/waInstance${cred.idInstance}/sendMessage/${cred.apiToken}`;

  let result;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, message }),
    });

    const rawText = await response.text();

    if (!response.ok) {
      result = { ok: false, httpStatus: response.status, greenApiResponse: rawText };
    } else {
      try {
        const data = JSON.parse(rawText);
        result = { ok: true, data };
      } catch {
        result = { ok: false, parseError: true, rawText };
      }
    }
  } catch (err) {
    result = { ok: false, error: err.message };
  }

  if (!result.ok && !isPlatformOpsAlert) {
    // The live send failed - fall back rather than log a dead "failed" row.
    // Platform ops alerts (cap_alert) are the one exception: there is no
    // "manual queue" for Kalmea's own operator to tap through, so those keep
    // the old log-and-report behaviour.
    return fallbackToQueue("send_failed", JSON.stringify(result));
  }

  // Log the message to Supabase (does not block sending)
  await logMessage({
    name: options.name,
    phone: phone,
    body: message,
    type: options.type,
    status: result.ok ? "sent" : "failed",
    greenApiId: result.ok ? result.data?.idMessage : null,
    errorDetail: result.ok ? null : JSON.stringify(result),
    tenantId: options.tenantId,
  });

  return result;
}