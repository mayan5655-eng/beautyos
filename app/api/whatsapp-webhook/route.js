// app/api/whatsapp-webhook/route.js
// Receives incoming WhatsApp messages from GreenAPI, generates a smart Hebrew
// reply with the AI (scoped to the correct tenant), and sends it back.
//
// MULTI-TENANT: each cosmetician connects her own GreenAPI instance.
// We resolve the tenant from instanceData.idInstance (settings.green_api_instance);
// until she connects her own, we fall back to the default tenant.
//
// AUTHENTICATED. Every delivery must carry GREENAPI_WEBHOOK_SECRET, as the
// webhook URL token GreenAPI sends in the Authorization header or as ?token=
// on the URL (lib/webhookAuth.js). Checked before the body is read, so a
// forged delivery costs nothing and reveals nothing. Before this gate the
// route trusted the instance id, the sender and the text from the JSON body,
// which made the platform's WhatsApp number an open relay: post a payload
// naming a tenant's instance id, and a Claude-written reply went from our
// number to any phone you named, billed to her.

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { trackedCreate } from "@/lib/ai/usage";
import { MODELS, EFFORT } from "@/lib/ai/models";
import { buildBotMessages, loadRecentTurns, recordInbound } from "../../../lib/waConversation";
import { sendWhatsApp } from "../../../lib/whatsapp";
import { dayHoursFrom } from "@/lib/businessHours";
import { buildSystemPrompt } from "@/lib/botPrompt";
import { ACTIVE_OR_NULL } from "@/lib/serviceActive";
import { hit } from "@/lib/rateLimit";
import { isAuthorizedWebhook, webhookUnauthorized } from "../../../lib/webhookAuth";
import { optOutFields, isOptOutReply } from "../../../lib/marketingConsent";
import { phoneVariants } from "../../../lib/clientData";
import { mapGreenApiDeliveryStatus } from "../../../lib/greenApi/deliveryStatus.ts";

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

// Records what GreenAPI's outgoingMessageStatus webhook actually says about
// a message already logged "sent" - the piece that used to be discarded by
// the typeWebhook filter below, which is exactly why "sent" never meant
// "arrived" (see supabase/migrations/pending/whatsapp-delivery-status.sql).
// Looked up by green_api_id (GreenAPI's idMessage), which is globally unique
// per their own docs - not tenant-scoped, on purpose: this is GreenAPI
// telling us about ITS OWN message id, so the id is the only key needed.
async function recordDeliveryStatus(body) {
  const idMessage = body.idMessage;
  if (!idMessage) return;
  const mapped = mapGreenApiDeliveryStatus(body.status);
  if (!mapped) {
    console.log(`[whatsapp-webhook] outgoingMessageStatus ${idMessage}: status "${body.status}" not recorded`);
    return;
  }
  const patch = { delivery_status: mapped };
  if (mapped === "delivered") patch.delivered_at = new Date().toISOString();
  if (mapped === "read") patch.read_at = new Date().toISOString();
  if (mapped === "undelivered") patch.undelivered_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("whatsapp_messages")
    .update(patch)
    .eq("green_api_id", idMessage)
    .select("id");
  if (error) {
    const missingColumn = /delivery_status|delivered_at|read_at|undelivered_at/i.test(error.message);
    console.error(`[whatsapp-webhook] delivery status update failed for ${idMessage}:`, error.message,
      missingColumn ? "- whatsapp-delivery-status.sql may not be applied yet" : "");
    return;
  }
  if (!data || data.length === 0) {
    console.warn(`[whatsapp-webhook] outgoingMessageStatus for unknown idMessage ${idMessage} (status=${mapped})`);
  }
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
      .select("bot_active, bot_mode, working_hours_start, working_hours_end, working_days, business_hours")
      .eq("tenant_id", tenantId)
      .limit(1);
    if (error) console.log("BOT_SETTINGS_ERROR", error.message);
    if (data && data.length > 0) s = data[0];
  } catch (e) {
    console.log("BOT_SETTINGS_EXCEPTION", e.message);
  }

  // Master switch: ON only when she turned it on (2026-10-21). Its replies cannot go out automatically (ai_agent_reply is not a
  // utility type, so it waits in her manual queue), yet every client "תודה" cost a Claude call and dropped a draft there. A new
  // business starts with it off (lib/tenantTemplate.ts); one whose row says true keeps it.
  if (s.bot_active !== true && s.bot_active !== "true") return false;

  // Always-on mode (default) -> reply
  if (!s.bot_mode || s.bot_mode === "always") return true;

  // after_hours mode -> reply only OUTSIDE working hours/days (Israel time),
  // now respecting each day's own open/close (per-day business_hours).
  if (s.bot_mode === "after_hours") {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
    const day = now.getDay(); // 0=Sunday ... 6=Saturday
    const hour = now.getHours();

    const dh = dayHoursFrom(s, day); // {open,close} for today, or null if closed
    const isWorkingNow = !!dh && hour >= dh.open && hour < dh.close;

    // During a working day AND working hour -> she answers; bot stays quiet.
    if (isWorkingNow) return false;
    return true;
  }

  return true;
}
// Generate the AI reply directly (no network hop) - faster and more reliable
async function generateReply({ message, clientName, tenantId, history = [] }) {
  const [settingsRes, servicesRes] = await Promise.all([
    supabase.from("settings").select("*").eq("tenant_id", tenantId).limit(1),
    supabase.from("service_prices").select("*").eq("tenant_id", tenantId).or(ACTIVE_OR_NULL),
  ]);

  const settings =
    settingsRes.data && settingsRes.data.length > 0 ? settingsRes.data[0] : {};
  const services = servicesRes.data || [];

  const systemPrompt = buildSystemPrompt({ settings, services, tenantId, appUrl: APP_URL });

  // tenantId here is VERIFIED: the caller resolved it server-side from the
  // GreenAPI instance id on the inbound webhook, not from anything the sender
  // could set.
  const aiResponse = await trackedCreate(anthropic, {
    // Haiku 5.5 thinks before it writes, and the thinking counts against max_tokens: the room is for that, not for a
    // longer reply (the prompt holds it to three sentences). A refusal comes back with no text, so she answers by hand.
    model: MODELS.cheap,
    max_tokens: 2000,
    output_config: { effort: EFFORT.cheap },
    system: systemPrompt,
    // The last turns with this client (lib/waConversation.js), then the message being answered.
    messages: buildBotMessages(history, `${clientName ? `(שם הלקוחה: ${clientName})\n` : ""}הודעת הלקוחה: ${message}`),
  }, { tenantId, callSite: "whatsapp-webhook" });

  // Haiku 5.5 can decline (stop_reason "refusal") and has no server-side fallback. Send nothing rather than half an answer:
  // the client's message stays for her to answer by hand. Cut off mid-reply ("max_tokens") is treated the same way.
  if (aiResponse.stop_reason === "refusal" || aiResponse.stop_reason === "max_tokens") {
    console.warn(`[whatsapp-webhook] no bot reply for tenant ${tenantId}: stop_reason=${aiResponse.stop_reason}`);
    return "";
  }

  return aiResponse.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

// Records "הסר" for one business: her client cards and leads with this phone stop getting marketing. With ack, a short "removed"
// message goes back once (not again if she was already removed).
async function recordOptOut(tenantId, senderChatId, senderName, ack) {
  try {
    const variants = phoneVariants(senderToPhone(senderChatId));
    if (!variants.length) return;
    // Only this sender's cards, by phone (not every card in the business), in any shape the phone was stored.
    const { data: cards } = await supabase.from("clients").select("id, marketing_opted_out_at").eq("tenant_id", tenantId).in("phone", variants);
    const fresh = (cards || []).filter(c => !c.marketing_opted_out_at);
    if (fresh.length) {
      const { error: optErr } = await supabase.from("clients").update(optOutFields()).in("id", fresh.map(c => c.id)).eq("tenant_id", tenantId);
      if (optErr) console.error("[whatsapp-webhook] opt-out not recorded:", optErr.message);
    }
    // A person who is only a LEAD (a Facebook form, the skin scan) can ask to stop too. The column arrives with
    // add_audit_hardening_2026-10-18.sql; until then this is skipped.
    const { error: leadErr } = await supabase.from("leads").update(optOutFields()).eq("tenant_id", tenantId).in("phone", variants);
    if (leadErr && !/marketing_opted_out_at|schema cache|does not exist/i.test(leadErr.message || "")) console.error("[whatsapp-webhook] lead opt-out not recorded:", leadErr.message);
    if (ack && ((cards || []).length === 0 || fresh.length > 0)) {
      await sendWhatsApp(senderToPhone(senderChatId), "הוסרת מרשימת ההודעות. מעכשיו לא יישלחו אלייך הודעות שיווק. תזכורות לתורים ימשיכו להגיע.", { name: senderName || "לקוחה", type: "marketing_optout_ack", tenantId });
    }
  } catch (e) { console.error("[whatsapp-webhook] opt-out failed:", e?.message); }
}

export async function POST(request) {
  // The gate, before anything is parsed. A 401 rather than a silent 200:
  // GreenAPI retries a non-200 for a while and then stops, and the retries are
  // the signal she needs while configuring the token - a silent 200 would make
  // a wrong token look like a working webhook with a mute bot.
  if (!isAuthorizedWebhook(request)) {
    console.warn("[whatsapp-webhook] refused: missing or wrong webhook secret");
    return webhookUnauthorized();
  }
  try {
    const body = await request.json();

    // The delivery/read-receipt callback - see recordDeliveryStatus's own
    // header on why this used to be silently discarded by the check below.
    if (body.typeWebhook === "outgoingMessageStatus") {
      await recordDeliveryStatus(body);
      return Response.json({ ok: true });
    }

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
    //
    // EXACTLY ONE row may match. The lookup used to take the first of any
    // number, unordered, so a second tenant who wrote this instance id into
    // her own settings could win the race for another tenant's messages.
    // The settings save can no longer write that column and the database
    // now refuses a duplicate (add_settings_write_guard.sql); this is the
    // third guard, for a duplicate that predates both: two matches means
    // nobody gets the message, and the log says so.
    let tenantId = null;
    if (idInstance) {
      try {
        const { data, error } = await supabase
          .from("settings")
          .select("tenant_id")
          .eq("green_api_instance", String(idInstance))
          .limit(2);
        if (!error && data && data.length === 1 && data[0].tenant_id) {
          tenantId = data[0].tenant_id;
        } else if (!error && data && data.length > 1) {
          console.error(`[whatsapp-webhook] instance ${String(idInstance)} matches ${data.length} tenants; refusing to route`);
        }
      } catch (_) { /* no tenant -> skip below */ }
    }

    // The CENTRAL number (lib/whatsapp.js sends every business's messages from it) belongs to no single settings row, so a reply
    // to it resolved to nobody and was dropped - "הסר" included, so opt-outs were never recorded (2026-10-20 audit). For the
    // central instance the business is the one that actually wrote to this phone recently, from our own outbound log:
    //   exactly one business -> it gets the reply (bot and opt-out), as before;
    //   several businesses   -> an opt-out is honoured for EACH of them (it is her wish, and it only ever removes messages);
    //                           anything else is not answered, because we cannot tell whose conversation it is.
    let centralTenants = [];
    const centralId = String(process.env.GREENAPI_ID_INSTANCE || "").trim();
    if (!tenantId && idInstance && centralId && String(idInstance) === centralId) {
      try {
        const variants = phoneVariants(senderToPhone(senderChatId));
        if (variants.length) {
          const since = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
          const { data: sent } = await supabase.from("whatsapp_messages").select("tenant_id").in("recipient_phone", variants).gte("created_at", since).not("tenant_id", "is", null).limit(200);
          centralTenants = [...new Set((sent || []).map((r) => String(r.tenant_id)))];
          if (centralTenants.length === 1) tenantId = centralTenants[0];
        }
      } catch (e) { console.error("[whatsapp-webhook] central routing failed:", e?.message); }
    }
    if (!tenantId && centralTenants.length > 1 && isOptOutReply(text)) {
      for (const t of centralTenants) await recordOptOut(t, senderChatId, senderName, false);
      await sendWhatsApp(senderToPhone(senderChatId), "הוסרת מרשימת ההודעות. מעכשיו לא יישלחו אלייך הודעות שיווק. תזכורות לתורים ימשיכו להגיע.", { name: senderName || "לקוחה", type: "marketing_optout_ack", tenantId: centralTenants[0] });
      return Response.json({ ok: true, optOut: true, tenants: centralTenants.length });
    }

    // Unknown instance / no matching tenant: acknowledge the webhook (so it is
    // not retried) but do NOT reply under anyone else's account.
    if (!tenantId) {
      return Response.json({ ok: true, ignored: "unknown tenant" });
    }

    // "הסר": every promotional message we send says "reply הסר to be removed". That has to work on its own, before the bot
    // (which would answer it as a question) and whether or not the bot is on. Only an exact one-word request counts, so an
    // ordinary sentence that happens to contain the word is never read as an opt-out.
    if (isOptOutReply(text)) {
      // The same cap as the bot below: a loop of "הסר" must not become a loop of lookups and acknowledgements.
      const optBurst = hit(`wa-optout:${tenantId}:${senderToPhone(senderChatId) || senderChatId}`, { limit: 5, windowMs: 10 * 60_000 });
      if (!optBurst.ok) return Response.json({ ok: true, optOut: "rate-limited" });
      await recordOptOut(tenantId, senderChatId, senderName, true);
      return Response.json({ ok: true, optOut: true });
    }

    // Respect the tenant's bot on/off switch and active hours
    const active = await shouldBotReply(tenantId);
    if (!active) {
      return Response.json({ ok: true, botOff: true });
    }

    // Burst guard, per SENDER and per TENANT.
    //
    // This is the one AI call in the product that a stranger can trigger at
    // will: every inbound WhatsApp message becomes a Claude call, billed to her
    // tenant. The webhook secret above proves the delivery came from GreenAPI;
    // it says nothing about who messaged her, and her clients message her
    // without an account - so the per-sender cap still stands.
    //
    // Per-IP would be meaningless: the request comes from GreenAPI's servers,
    // not from the sender, so every message shares one IP. The two keys that
    // mean anything are who sent it and whose business it lands in.
    //
    // A real conversation is a handful of messages. Twelve from one number in
    // ten minutes is already generous; 60 across the whole business in ten
    // minutes is busier than any beta clinic.
    //
    // We ACKNOWLEDGE the webhook rather than returning 429: GreenAPI retries a
    // failed delivery, and a retry loop on a rate-limited endpoint would spend
    // exactly what this is here to protect. Staying silent costs one bot reply;
    // erroring costs the same reply several times over.
    const senderKey = senderToPhone(senderChatId) || senderChatId || "unknown";
    const senderBurst = hit(`wa-bot:sender:${tenantId}:${senderKey}`, {
      limit: 12,
      windowMs: 10 * 60_000,
    });
    if (!senderBurst.ok) {
      console.warn(`[whatsapp-webhook] sender burst limit hit for tenant ${tenantId}`);
      return Response.json({ ok: true, rateLimited: "sender" });
    }
    const tenantBurst = hit(`wa-bot:tenant:${tenantId}`, {
      limit: 60,
      windowMs: 10 * 60_000,
    });
    if (!tenantBurst.ok) {
      console.warn(`[whatsapp-webhook] tenant burst limit hit for tenant ${tenantId}`);
      return Response.json({ ok: true, rateLimited: "tenant" });
    }

    // The conversation so far (read BEFORE this message is kept, so it is not in its own history), then keep this one
    // for the next turn. Only here, when the bot is about to answer: a business whose bot is off stores nothing.
    const senderPhone = senderToPhone(senderChatId);
    const history = await loadRecentTurns(supabase, { tenantId, variants: phoneVariants(senderPhone) });
    await recordInbound(supabase, { tenantId, phone: senderPhone, body: text, source: "greenapi" });

    // Generate the reply directly
    const reply = await generateReply({ message: text, clientName: senderName, tenantId, history });

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
    return Response.json({ ok: false, error: "internal" });
  }
}

export async function GET() {
  return Response.json({ ok: true, status: "whatsapp webhook alive" });
}