// lib/whatsapp.js
// Sends WhatsApp messages via GreenAPI

import { createClient } from "@supabase/supabase-js";
import { readCredentials } from "./greenApi/credentials";

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
// ── THE ENV INSTANCE IS NEVER USED ON A TENANT'S BEHALF ────────────────────
// This used to fall back to the global env instance whenever a tenant had not
// connected her own. That fallback silently sent one business's messages from
// ANOTHER phone number: the client got a WhatsApp from the platform's number,
// signed with her cosmetician's business name. She had no way to tell, because
// it looked like it worked - and "connect WhatsApp" in Settings looked
// optional, since everything already sent without it.
//
// Now a tenantId that has not connected resolves to connected:false and
// sendWhatsApp REFUSES rather than sending from the wrong number. Not sending
// is recoverable; a message from a stranger's number to her client is not.
//
// The env instance is kept for genuinely platform-level messages only - a call
// with NO tenantId at all - where there is no business to misrepresent.
//
// A tenant counts as connected only when BOTH instance id and token are
// present; url is optional (falls back to the env url, then GreenAPI's host).
async function resolveCredentials(tenantId) {
  if (tenantId) {
    try {
      // The token is AES-256-GCM at rest and is decrypted HERE, at the point of
      // use, never earlier and never in the browser. readCredentials also
      // tolerates the cutover window in which a row may still hold the legacy
      // plaintext column, and fails closed on anything it cannot decrypt.
      const cred = await readCredentials(tenantId);
      if (cred) {
        const url = cred.apiUrl || ENV_API_URL || DEFAULT_API_URL;
        return {
          idInstance: cred.idInstance,
          apiToken: cred.apiToken,
          apiUrl: url,
          source: "tenant",
          connected: true,
          tokenSource: cred.tokenSource,
        };
      }
    } catch (e) {
      // Fail CLOSED. An unreadable settings row is "we do not know whose
      // instance this is", which must never resolve to "use the platform's".
      console.error("resolveCredentials error:", e.message);
    }
    // Known tenant, no credentials of her own. Deliberately NOT the env
    // instance - see the header.
    return { source: "none", connected: false, tenantId };
  }
  // No tenant at all: a platform-level message, with no business to
  // misrepresent. This is the only remaining use of the env instance.
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

// Converts an Israeli phone number to GreenAPI format
function formatPhone(phone) {
  let clean = phone.replace(/[\s\-\+]/g, "");
  if (clean.startsWith("0")) {
    clean = "972" + clean.slice(1);
  }
  return clean;
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
  const chatId = formatPhone(phone) + "@c.us";

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