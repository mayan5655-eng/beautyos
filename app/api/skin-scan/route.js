// app/api/skin-scan/route.js
// BeautyOS AI Skin Scanner — analyzes a client selfie and returns
// a friendly Hebrew skin report (skin type, concerns, score, tips).
// Uses Claude vision. Recommends one of the business's own services.

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request) {
  try {
    const { image, mediaType } = await request.json();

    if (!image) {
      return Response.json({ success: false, error: "חסרה תמונה" }, { status: 400 });
    }

    // 1. Load the business's services so the AI can recommend a real treatment
    const servicesRes = await supabase.from("service_prices").select("*");
    const services = servicesRes.data || [];
    const servicesText =
      services.length > 0
        ? services.map((s) => `- ${s.name} (${s.price} ש"ח)`).join("\n")
        : "אין רשימת שירותים";

    // 2. System prompt — defines the report format. We ask for JSON only.
    const systemPrompt = `את קוסמטיקאית מקצועית ואדיבה. את מנתחת תמונת סלפי של לקוחה ומפיקה דוח עור חם, מעודד ומקצועי בעברית.

השירותים הזמינים בעסק (להמלצה):
${servicesText}

חוקים:
1. דברי בטון חם, נעים ומעודד — לא מאיים. הלקוחה בבית, לא במרפאה.
2. אל תאבחני מצבים רפואיים. תני הערכה קוסמטית כללית בלבד.
3. אם התמונה לא ברורה / אין בה פנים — החזירי "valid": false.
4. בחרי המלצת טיפול אחת מהרשימה למעלה אם רלוונטי. אם אין רשימה, השאירי "" ריק.
5. החזירי JSON בלבד — בלי טקסט נוסף, בלי markdown, בלי backticks.

מבנה ה-JSON המדויק:
{
  "valid": true,
  "skin_type": "סוג העור (למשל: עור מעורב, נוטה לשומניות)",
  "score": 78,
  "concerns": ["בעיה 1", "בעיה 2", "בעיה 3"],
  "tips": ["המלצת בית 1", "המלצת בית 2", "המלצת בית 3"],
  "recommended_treatment": "שם טיפול מהרשימה או ריק",
  "summary": "משפט חם ומעודד אחד שמסכם"
}

score = ציון עור כללי 0-100 (גבוה = עור במצב טוב). היי הוגנת ומעודדת.`;

    // 3. Call Claude with vision
    const aiResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 800,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType || "image/jpeg",
                data: image,
              },
            },
            {
              type: "text",
              text: "נתחי את העור בתמונה הזו והחזירי את דוח ה-JSON.",
            },
          ],
        },
      ],
    });

    // 4. Extract + parse the JSON safely
    const raw = aiResponse.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();

    const clean = raw.replace(/```json/g, "").replace(/```/g, "").trim();

    let report;
    try {
      report = JSON.parse(clean);
    } catch (parseErr) {
      console.error("Skin-scan JSON parse error:", parseErr, "RAW:", raw);
      return Response.json(
        { success: false, error: "לא הצלחנו לנתח את התמונה. נסי תמונה ברורה יותר." },
        { status: 422 }
      );
    }

    if (report.valid === false) {
      return Response.json(
        { success: false, error: "לא זוהו פנים ברורות בתמונה. נסי סלפי באור טוב, בלי איפור כבד." },
        { status: 422 }
      );
    }

    return Response.json({ success: true, report });
  } catch (err) {
    console.error("Skin-scan error:", err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
