// app/api/ai-agent/route.js
// The "brain" of the WhatsApp AI agent.
// Receives a client's message, gives the AI full business context for the
// CORRECT tenant, and returns a smart Hebrew reply.
//
// MULTI-TENANT: the request must include a tenantId so the agent answers
// with the right business's services, hours and name.

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "@/lib/botPrompt";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://beautyos-theta.vercel.app";

export async function POST(request) {
  try {
    const { message, clientName, tenantId } = await request.json();

    if (!message) {
      return Response.json({ success: false, error: "חסרה הודעה" }, { status: 400 });
    }
    if (!tenantId) {
      return Response.json({ success: false, error: "חסר מזהה עסק" }, { status: 400 });
    }

    // 1. Gather business context for THIS tenant only
    const [settingsRes, servicesRes] = await Promise.all([
      supabase.from("settings").select("*").eq("tenant_id", tenantId).limit(1),
      supabase.from("service_prices").select("*").eq("tenant_id", tenantId).eq("active", true),
    ]);

    const settings =
      settingsRes.data && settingsRes.data.length > 0 ? settingsRes.data[0] : {};
    const services = servicesRes.data || [];

    // 2. Build the system prompt (shared with the live webhook, so both stay in sync)
    const systemPrompt = buildSystemPrompt({ settings, services, tenantId, appUrl: APP_URL });

    // 3. Call the AI
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

    const reply = aiResponse.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();

    return Response.json({ success: true, reply });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
