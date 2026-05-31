// lib/whatsapp.js
// Sends WhatsApp messages via GreenAPI

import { createClient } from "@supabase/supabase-js";

const ID_INSTANCE = process.env.GREENAPI_ID_INSTANCE;
const API_TOKEN = process.env.GREENAPI_API_TOKEN;
const API_URL = process.env.GREENAPI_API_URL;

// Supabase client for logging messages
const supabaseLog = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

// Main function: sends a WhatsApp text message and logs it
export async function sendWhatsApp(phone, message, options = {}) {
  const chatId = formatPhone(phone) + "@c.us";
  const url = `${API_URL}/waInstance${ID_INSTANCE}/sendMessage/${API_TOKEN}`;

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