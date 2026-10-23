// lib/waConversation.js
//
// The WhatsApp bot's memory: the last few turns between a client and one business, so "כן, ב-4 מתאים" reaches the
// model with the question it answers.
//
//   client -> whatsapp_inbound (written here, only when the bot is about to answer; supabase/migrations/add_whatsapp_inbound.sql)
//   us     -> whatsapp_messages rows with status "sent" (what she actually received; a bot draft still waiting in the
//             manual queue never reached her, so it is not part of the conversation)
//
// Scoped by tenant AND phone, always: a client who writes to two businesses has two separate conversations.
// Best effort: if either read fails (the table not created yet, a database wobble) the bot answers the one message,
// as it did before - a missing memory must never cost her the reply.

export const HISTORY_WINDOW_MS = 24 * 3600 * 1000;
export const HISTORY_MAX_TURNS = 8;
export const INBOUND_BODY_MAX = 2000;
const TURN_TEXT_MAX = 1000;

let warnedMissing = false;
const warnOnce = (what, message) => {
  if (warnedMissing) return;
  warnedMissing = true;
  console.warn(`[wa-conversation] ${what} failed: ${message}` + (/whatsapp_inbound|does not exist|schema cache/i.test(message || "") ? " - add_whatsapp_inbound.sql may not be applied yet" : ""));
};

/** Keep what the client wrote, for the next turn. Never throws. */
export async function recordInbound(db, { tenantId, phone, body, source = "greenapi" }) {
  if (!tenantId || !phone || !body) return;
  try {
    const { error } = await db.from("whatsapp_inbound").insert({
      tenant_id: tenantId,
      phone: String(phone),
      body: String(body).slice(0, INBOUND_BODY_MAX),
      source,
    });
    if (error) warnOnce("insert", error.message);
  } catch (e) {
    warnOnce("insert", e?.message);
  }
}

/**
 * The recent turns with this client, oldest first: [{ role: "user" | "assistant", text, at }].
 * `variants` are the stored spellings of her phone (lib/clientData phoneVariants). Never throws.
 */
export async function loadRecentTurns(db, { tenantId, variants, now = Date.now() }) {
  if (!tenantId || !variants?.length) return [];
  const since = new Date(now - HISTORY_WINDOW_MS).toISOString();
  const [inbound, outbound] = await Promise.all([
    db.from("whatsapp_inbound").select("body, created_at").eq("tenant_id", tenantId).in("phone", variants)
      .gte("created_at", since).order("created_at", { ascending: false }).limit(HISTORY_MAX_TURNS)
      .then((r) => r, (e) => ({ error: e })),
    db.from("whatsapp_messages").select("message_body, created_at").eq("tenant_id", tenantId).in("recipient_phone", variants)
      .eq("status", "sent").gte("created_at", since).order("created_at", { ascending: false }).limit(HISTORY_MAX_TURNS)
      .then((r) => r, (e) => ({ error: e })),
  ]);
  if (inbound.error) warnOnce("inbound read", inbound.error.message);
  if (outbound.error) console.warn(`[wa-conversation] outbound read failed: ${outbound.error.message}`);
  const turns = [
    ...(inbound.error ? [] : inbound.data || []).map((r) => ({ role: "user", text: r.body, at: r.created_at })),
    ...(outbound.error ? [] : outbound.data || []).map((r) => ({ role: "assistant", text: r.message_body, at: r.created_at })),
  ].filter((t) => typeof t.text === "string" && t.text.trim());
  turns.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return turns.slice(-HISTORY_MAX_TURNS);
}

/**
 * The Messages API `messages` for the bot: the recent turns, then the message it is answering. Consecutive turns of
 * one side are joined (she may write three messages in a row), the history starts with the client (a message list
 * opens with a user turn), and the list ends with the current message (no assistant prefill).
 */
export function buildBotMessages(turns, current) {
  const out = [];
  for (const t of turns || []) {
    const text = String(t.text).trim().slice(0, TURN_TEXT_MAX);
    if (!out.length && t.role !== "user") continue;
    const last = out[out.length - 1];
    if (last && last.role === t.role) last.content += "\n" + text;
    else out.push({ role: t.role, content: text });
  }
  const last = out[out.length - 1];
  if (last && last.role === "user") last.content += "\n" + current;
  else out.push({ role: "user", content: current });
  return out;
}
