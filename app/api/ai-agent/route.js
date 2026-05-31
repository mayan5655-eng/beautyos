// app/api/ai-agent/route.js
// The "brain" of the WhatsApp AI agent.
// Receives a client's message, gives the AI full business context,
// and returns a smart Hebrew reply. Answers questions + points to booking.

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Public booking page URL (becomes the real Vercel URL after deploy)
const BOOK_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000") + "/book";

const DAYS_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export async function POST(request) {
  try {
    const { message, clientName } = await request.json();

    if (!message) {
      return Response.json({ success: false, error: "חסרה הודעה" }, { status: 400 });
    }

    // 1. Gather business context from Supabase
    const [settingsRes, servicesRes] = await Promise.all([
      supabase.from("settings").select("*"),
      supabase.from("service_prices").select("*"),
    ]);

    const settings = settingsRes.data && settingsRes.data.length > 0 ? settingsRes.data[0] : {};
    const services = servicesRes.data || [];

    const businessName = settings.business_name || "הסלון";
    const therapistName = settings.therapist_name || "";
    const startH = settings.working_hours_start || 9;
    const endH = settings.working_hours_end || 19;
    const workingDays = (settings.working_days || "0,1,2,3,4,5")
      .split(",")
      .filter((x) => x !== "")
      .map((n) => DAYS_HE[Number(n)])
      .join(", ");

    // Build a services list for the AI
    const servicesText =
      services.length > 0
        ? services
            .map((s) => `- ${s.name}: ${s.price} ש"ח (${s.duration || 60} דקות)`)
            .join("\n")
        : "אין רשימת שירותים זמינה";

    // 2. Build the system prompt (the agent's "personality" + rules)
    const systemPrompt = `את העוזרת הווירטואלית של "${businessName}"${therapistName ? ` (המטפלת: ${therapistName})` : ""}, עסק יופי/קוסמטיקה בישראל.

תפקידך: לענות ללקוחות בוואטסאפ בעברית, בחום ובאדיבות, בקצרה וברור.

מידע על העסק:
שירותים ומחירים:
${servicesText}

שעות פעילות: ${startH}:00 עד ${endH}:00
ימי עבודה: ${workingDays}

כללים חשובים:
1. עני בעברית בלבד, בטון חם ונעים, עם אימוג'ים מתאימים (לא יותר מדי).
2. תשובות קצרות — משפט עד שלושה. זאת וואטסאפ, לא מייל.
3. כשלקוחה רוצה לקבוע תור, או שואלת על זמינות/תורים פנויים — הפני אותה לקישור הקביעה: ${BOOK_URL}
4. אם שואלים על מחיר או טיפול — עני לפי הרשימה למעלה.
5. אל תמציאי מידע שאין לך. אם את לא יודעת, אמרי שתיצרי קשר בהקדם.
6. אל תבטיחי תורים בעצמך — תמיד הפני לקישור הקביעה.`;

    // 3. Call the AI
    const aiResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
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
