// app/api/whatsapp-webhook/route.js
// Receives incoming WhatsApp messages from GreenAPI, generates a smart Hebrew
// reply with the AI (scoped to the correct tenant), and sends it back.
//
// MULTI-TENANT: each cosmetician connects her own GreenAPI instance.
// We resolve the tenant from instanceData.idInstance (settings.green_api_instance);
// until she connects her own, we fall back to the default tenant.

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { sendWhatsApp } from "../../../lib/whatsapp";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://beautyos-theta.vercel.app";

// Extract the text body from a GreenAPI message payload
function extractText(messageData) {
  if (!messageData) return "";
  const t = messageData.typeMessage;
  if (t === "textMessage") return messageData.textMessageData?.textMessage || "";
  if (t === "extendedTextMessage" || t === "quotedMessage")
    return messageData.extendedTextMessageData?.text || "";
  return "";
}

// Convert a GreenAPI chatId back to an Israeli phone number
function senderToPhone(chatId) {
  const digits = (chatId || "").replace(/@c\.us$/, "").replace(/\D/g, "");
  if (digits.startsWith("972")) return "0" + digits.slice(3);
  return digits;
}

// Decide whether the bot should reply right now, based on the tenant's
// settings: bot_active (master switch) and bot_mode ("always" or "after_hours").
async function shouldBotReply(tenantId) {
  let s = {};
  try {
    const { data, error } = await supabase
      .from("settings")
      .select("bot_active, bot_mode, working_hours_start, working_hours_end, working_days")
      .eq("tenant_id", tenantId)
      .limit(1);
    if (error) console.log("BOT_SETTINGS_ERROR", error.message);
    if (data && data.length > 0) s = data[0];
  } catch (e) {
    console.log("BOT_SETTINGS_EXCEPTION", e.message);
  }

  // Master switch off -> never reply
  if (s.bot_active === false) return false;

  // Always-on mode (default) -> reply
  if (!s.bot_mode || s.bot_mode === "always") return true;

  // after_hours mode -> reply only OUTSIDE working hours/days (Israel time)
  if (s.bot_mode === "after_hours") {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
    const day = now.getDay(); // 0=Sunday ... 6=Saturday
    const hour = now.getHours();

    const startH = s.working_hours_start != null ? Number(s.working_hours_start) : 9;
    const endH = s.working_hours_end != null ? Number(s.working_hours_end) : 19;

    // working_days stored like "0,1,2,3,4" (Sun-Thu). Default Sun-Thu.
    const workingDays = (s.working_days || "0,1,2,3,4")
      .split(",")
      .map((d) => parseInt(d.trim(), 10))
      .filter((d) => !isNaN(d));

    const isWorkingDay = workingDays.includes(day);
    const isWorkingHour = hour >= startH && hour < endH;

    // During working day AND working hour -> she answers; bot stays quiet
    if (isWorkingDay && isWorkingHour) return false;
    return true;
  }

  return true;
}
// Generate the AI reply directly (no network hop) - faster and more reliable
async function generateReply({ message, clientName, tenantId }) {
  const [settingsRes, servicesRes] = await Promise.all([
    supabase.from("settings").select("*").eq("tenant_id", tenantId).limit(1),
    supabase.from("service_prices").select("*").eq("tenant_id", tenantId).eq("active", true),
  ]);

  const settings =
    settingsRes.data && settingsRes.data.length > 0 ? settingsRes.data[0] : {};
  const services = servicesRes.data || [];

  const businessName = settings.business_name || "העסק";
  const therapistName = settings.therapist_name || "";
  const startH = settings.working_hours_start || 9;
  const endH = settings.working_hours_end || 19;
  const bookUrl = `${APP_URL}/book?t=${tenantId}`;

  const servicesText =
    services.length > 0
      ? services.map((s) => `- ${s.name}${s.price ? ` (${s.price} ש"ח)` : ""}${s.duration ? `, ${s.duration} דקות` : ""}`).join("\n")
      : "לא הוגדרו שירותים";

  const systemPrompt = `את העוזרת הווירטואלית של "${businessName}"${therapistName ? ` (המטפלת: ${therapistName})` : ""}, עסק יופי/קוסמטיקה בישראל.

תפקידך: לענות ללקוחות בוואטסאפ בעברית, בחמימות, בקצרה ובבהירות.

ידע על העסק:
שירותים ומחירים:
${servicesText}

שעות פעילות: ${startH}:00 עד ${endH}:00

כללים:
1. דברי תמיד בעברית, בנימה חמה ומקצועית (לא רובוטית).
2. תשובות קצרות — עד שלושה משפטים. זה וואטסאפ, לא אימייל.
3. כשלקוחה רוצה לקבוע תור, או שואלת על זמינות/תורים, הפני אותה לקישור הקביעה: ${bookUrl}
4. אל תמציאי מחיר או טיפול — עני רק לפי הרשימה למעלה.
5. אם אינך יודעת משהו, אמרי שתעבירי את הפנייה למטפלת, ואל תמציאי.
6. כדי לקבוע תור — תמיד הפני לקישור הקביעה.`;

  const aiResponse = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `${clientName ? `(שם הלקוחה: ${clientName})\n` : ""}הודעת הלקוחה: ${message}`,
      },
    ],
  });

  return aiResponse.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

export async function POST(request) {
  try {
    const body = await request.json();

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

    // Resolve tenant strictly from the GreenAPI instance that received the
    // message. We never fall back to a default tenant - replying under the
    // wrong business would leak/derail another cosmetician's conversation.
    let tenantId = null;
    if (idInstance) {
      try {
        const { data, error } = await supabase
          .from("settings")
          .select("tenant_id")
          .eq("green_api_instance", String(idInstance))
          .limit(1);
        if (!error && data && data.length > 0 && data[0].tenant_id) {
          tenantId = data[0].tenant_id;
        }
      } catch (_) { /* no tenant -> skip below */ }
    }

    // Unknown instance / no matching tenant: acknowledge the webhook (so it is
    // not retried) but do NOT reply under anyone else's account.
    if (!tenantId) {
      return Response.json({ ok: true, ignored: "unknown tenant" });
    }

    // Respect the tenant's bot on/off switch and active hours
    const active = await shouldBotReply(tenantId);
    if (!active) {
      return Response.json({ ok: true, botOff: true });
    }

    // Generate the reply directly
    const reply = await generateReply({ message: text, clientName: senderName, tenantId });

    if (!reply) {
      return Response.json({ ok: true, noReply: true });
    }

    // Send the reply back to the client
    const phone = senderToPhone(senderChatId);
    await sendWhatsApp(phone, reply, {
      name: senderName || "לקוחה",
      type: "ai_agent_reply",
      tenantId,
    });

    return Response.json({ ok: true });
  } catch (err) {
    console.error("whatsapp-webhook error:", err);
    return Response.json({ ok: false, error: err.message });
  }
}

export async function GET() {
  return Response.json({ ok: true, status: "whatsapp webhook alive" });
}