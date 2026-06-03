// app/api/whatsapp-webhook/route.js
// Receives incoming WhatsApp messages from GreenAPI, asks the AI brain for a
// reply (scoped to the correct tenant), and sends the reply back to the client.
//
// MULTI-TENANT NOTE:
// Each cosmetician will eventually connect her OWN GreenAPI instance. The
// incoming webhook includes instanceData.idInstance — we look up which tenant
// owns that instance (settings.green_api_instance) and answer for her business.
// Until a tenant connects her own instance, we fall back to the default tenant.

import { createClient } from "@supabase/supabase-js";
import { sendWhatsApp } from "../../../lib/whatsapp";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://beautyos-theta.vercel.app";
const FALLBACK_TENANT_ID = "448e9e45-2251-4572-b665-886c5bc7a4c8";

// Pull the text out of any GreenAPI incoming-message shape
function extractText(messageData) {
  if (!messageData) return "";
  const t = messageData.typeMessage;
  if (t === "textMessage") return messageData.textMessageData?.textMessage || "";
  if (t === "extendedTextMessage" || t === "quotedMessage")
    return messageData.extendedTextMessageData?.text || "";
  return "";
}

// Convert "79001234567@c.us" -> "0541234567"-style local number (best-effort)
function senderToPhone(chatId) {
  const digits = (chatId || "").replace(/@c\.us$/, "").replace(/\D/g, "");
  if (digits.startsWith("972")) return "0" + digits.slice(3);
  return digits;
}

export async function POST(request) {
  try {
    const body = await request.json();

    // Only handle incoming text messages; acknowledge everything else.
    if (body.typeWebhook !== "incomingMessageReceived") {
      return Response.json({ ok: true, ignored: body.typeWebhook });
    }

    const text = extractText(body.messageData);
    const senderChatId = body.senderData?.sender || body.senderData?.chatId;
    const senderName = body.senderData?.senderName || body.senderData?.chatName || "";
    const idInstance = body.instanceData?.idInstance;

    if (!text || !senderChatId) {
      return Response.json({ ok: true, ignored: "no text" });
    }

    // 1. Resolve the tenant from the instance that received the message.
    let tenantId = FALLBACK_TENANT_ID;
    if (idInstance) {
      const { data } = await supabase
        .from("settings")
        .select("tenant_id")
        .eq("green_api_instance", String(idInstance))
        .limit(1);
      if (data && data.length > 0) tenantId = data[0].tenant_id;
    }

    // 2. Ask the AI brain for a reply (reuse the existing ai-agent route)
    const aiRes = await fetch(`${APP_URL}/api/ai-agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, clientName: senderName, tenantId }),
    });
    const aiData = await aiRes.json();
    const reply = aiData?.reply;

    if (!reply) {
      return Response.json({ ok: true, noReply: true });
    }

    // 3. Send the reply back to the client
    const phone = senderToPhone(senderChatId);
    await sendWhatsApp(phone, reply, {
      name: senderName || "לקוחה",
      type: "ai_agent_reply",
      tenantId,
    });

    return Response.json({ ok: true });
  } catch (err) {
    // Always return 200 so GreenAPI doesn't retry endlessly on our errors.
    console.error("whatsapp-webhook error:", err);
    return Response.json({ ok: false, error: err.message });
  }
}

// GreenAPI may probe the URL with GET — respond OK.
export async function GET() {
  return Response.json({ ok: true, status: "whatsapp webhook alive" });
}
