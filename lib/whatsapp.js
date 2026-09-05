// lib/whatsapp.js
// Sends WhatsApp messages via GreenAPI

import { createClient } from "@supabase/supabase-js";
// readCredentials import removed: per-tenant instances are no longer used for sending.
import { toWhatsAppNumber } from "./phone";

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
// ── ONE INSTANCE: THE CENTRAL BLOOMOS NUMBER ───────────────────────────────
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

// True ONLY when THIS tenant has connected her OWN GreenAPI instance.
//
// It used to return true whenever any credentials resolved - including the
// platform's env instance - so it answered "is this platform able to send at
// all", not "has SHE connected WhatsApp". Every tenant therefore read as
// connected the moment the platform had an instance configured, the Settings
// prompt to connect looked unnecessary, and her clients received messages from
// a number that was not hers.
export async function isWhatsAppConnected(tenantId) {
  if (!tenantId) return false; // a per-tenant question with no tenant is a no
  const cred = await resolveCredentials(tenantId);
  return cred.source === "tenant" && !!(cred.idInstance && cred.apiToken && cred.apiUrl);
}

// Main function: sends a WhatsApp text message and logs it
export async function sendWhatsApp(phone, message, options = {}) {
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

  // Her own instance, or nothing. Never another business's number.
  const cred = await resolveCredentials(options.tenantId);
  if (!cred.connected) {
    const refused = {
      ok: false,
      notConnected: true,
      error: "WhatsApp is not connected for this business",
    };
    console.error(
      `[whatsapp] REFUSED to send for tenant ${options.tenantId || "(none)"}: ` +
      `no GreenAPI instance of her own. Refusing rather than sending from the ` +
      `platform instance, which would reach her client from the wrong number.`
    );
    // Still logged, so a business wondering why nothing went out can be told.
    await logMessage({
      name: options.name,
      phone,
      body: message,
      type: options.type,
      status: "failed",
      greenApiId: null,
      errorDetail: JSON.stringify(refused),
      tenantId: options.tenantId,
    });
    return refused;
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