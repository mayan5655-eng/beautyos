// lib/whatsapp.js
// Sends WhatsApp messages via GreenAPI

import { createClient } from "@supabase/supabase-js";

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

// Resolve the GreenAPI credentials to send WITH. Prefers the sending tenant's
// own connected instance (settings.green_api_instance/token/url); falls back to
// the global env instance when the tenant hasn't connected her own — so every
// existing sender keeps working unchanged until a tenant connects. A tenant is
// considered "connected" only when BOTH instance id and token are present;
// url is optional (defaults to the global env url, then GreenAPI's base host).
async function resolveCredentials(tenantId) {
  if (tenantId) {
    try {
      const { data, error } = await supabaseLog
        .from("settings")
        .select("green_api_instance, green_api_token, green_api_url")
        .eq("tenant_id", tenantId)
        .limit(1);
      const s = !error && data && data.length > 0 ? data[0] : null;
      const inst = s && String(s.green_api_instance || "").trim();
      const tok = s && String(s.green_api_token || "").trim();
      if (inst && tok) {
        const url = (s.green_api_url && String(s.green_api_url).trim()) || ENV_API_URL || DEFAULT_API_URL;
        return { idInstance: inst, apiToken: tok, apiUrl: url, source: "tenant" };
      }
    } catch (e) {
      console.error("resolveCredentials error:", e.message);
    }
  }
  // Fallback: the global env instance (today's behaviour).
  return {
    idInstance: ENV_ID_INSTANCE,
    apiToken: ENV_API_TOKEN,
    apiUrl: ENV_API_URL || DEFAULT_API_URL,
    source: "env",
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

// True when there are usable GreenAPI credentials to send for this tenant —
// either her own connected instance or the global env fallback. Lets callers
// report an explicit "not connected" state instead of a vague send failure.
export async function isWhatsAppConnected(tenantId) {
  const cred = await resolveCredentials(tenantId);
  return !!(cred.idInstance && cred.apiToken && cred.apiUrl);
}

// Main function: sends a WhatsApp text message and logs it
export async function sendWhatsApp(phone, message, options = {}) {
  const chatId = formatPhone(phone) + "@c.us";

  // Send from the tenant's own GreenAPI instance when connected; otherwise the
  // global env instance (back-compat).
  const cred = await resolveCredentials(options.tenantId);
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