// app/api/skin-scan/route.js  (v2 — professional)
// BeautyOS AI Skin Scanner — analyzes a client selfie and returns
// a DUAL Hebrew report: a warm client section + a clinical therapist section.
// Includes a precise clinical treatment + matched in-house service,
// and a full AM/PM skincare routine with active ingredients.
// Uses Claude vision.

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

    // 1. Load the business's services so the AI can match a real treatment
    const servicesRes = await supabase.from("service_prices").select("*");
    const services = servicesRes.data || [];
    const servicesText =
      services.length > 0
        ? services.map((s) => `- ${s.name} (${s.price} ש"ח)`).join("\n")
        : "אין רשימת שירותים";

    // 2. System prompt — professional dual report, JSON only
    const systemPrompt = `את קוסמטיקאית רפואית מנוסה ומקצועית מאוד. את מנתחת תמונת סלפי של לקוחה ומפיקה דוח עור מקצועי ומדויק בעברית.

הדוח כפול: חלק חם ומובן ללקוחה, וחלק קליני נפרד למטפלת.

השירותים הזמינים בעסק (להתאמה):
${servicesText}

הנחיות מקצועיות:
1. נתחי באופן ספציפי ומדויק — סוג עור, מצב הידרציה, נקבוביות, פיגמנטציה, אזורי בעיה ספציפיים (אזור T, לחיים וכו'), סימני גיל/יובש/דלקת אם יש.
2. המלצת הטיפול חייבת להיות טיפול קליני מדויק ומקצועי (למשל: פילינג כימי AHA/BHA, מזותרפיה, הדרהפיל, לייזר פיגמנטציה, RF, מיקרונידלינג, טיפול הבראת עור). ציני את הטיפול הקליני הנכון — ואם יש שירות תואם ברשימת העסק, ציני אותו ב-matched_service.
3. שגרת הטיפוח מלאה: בוקר וערב, עם שלבים ומרכיבים פעילים ספציפיים (למשל: ניאצינאמיד, רטינול, חומצה היאלורונית, ויטמין C, SPF 50). כתבי בשפה מקצועית אך מובנת ללקוחה.
4. החלק למטפלת — קליני לחלוטין: הערכת שכבת עור, מרכיבים פעילים בריכוזים מומלצים, פרוטוקול טיפול מדורג (מספר מפגשים, תדירות), ואזהרות/קונטרה-אינדיקציות אם רלוונטי.
5. אל תאבחני מצבים רפואיים. הערכה קוסמטית בלבד.
6. אם התמונה לא ברורה / אין בה פנים — החזירי "valid": false.
7. החזירי JSON בלבד — בלי טקסט נוסף, בלי markdown, בלי backticks.

מבנה ה-JSON המדויק:
{
  "valid": true,
  "skin_type": "סוג עור מדויק (למשל: עור מעורב, נוטה לשומניות באזור T, יובש בלחיים)",
  "score": 78,
  "concerns": ["ממצא ספציפי 1", "ממצא ספציפי 2", "ממצא ספציפי 3"],
  "routine_morning": ["שלב 1 עם מרכיב פעיל", "שלב 2", "שלב 3", "שלב 4 (SPF)"],
  "routine_evening": ["שלב 1", "שלב 2 עם מרכיב פעיל", "שלב 3", "שלב 4"],
  "clinical_treatment": "שם הטיפול הקליני המדויק המומלץ",
  "matched_service": "שם שירות מרשימת העסק אם תואם, אחרת ריק",
  "summary": "משפט חם ומעודד אחד ללקוחה",
  "therapist_notes": {
    "skin_assessment": "הערכה קלינית של מצב העור, שכבות, ממצאים",
    "active_ingredients": ["מרכיב + ריכוז מומלץ", "מרכיב + ריכוז"],
    "protocol": "פרוטוקול טיפול מדורג — מספר מפגשים, תדירות, רצף",
    "cautions": "אזהרות / קונטרה-אינדיקציות / נקודות תשומת לב"
  }
}

score = ציון עור כללי 0-100 (גבוה = מצב טוב). היי הוגנת ומעודדת.`;

    // 3. Call Claude with vision
    const aiResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
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
              text: "נתחי את העור בתמונה הזו והחזירי את דוח ה-JSON המקצועי המלא.",
            },
          ],
        },
      ],
    });

    // 4. Extract + parse safely
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
