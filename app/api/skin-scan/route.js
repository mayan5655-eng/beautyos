// app/api/skin-scan/route.js  (v2 — professional)
// BeautyOS AI Skin Scanner — analyzes a client selfie and returns
// a DUAL Hebrew report: a warm client section + a clinical therapist section.
// Includes a precise clinical treatment + matched in-house service,
// and a full AM/PM skincare routine with active ingredients.
// Uses Claude vision.

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { trackedCreate } from "@/lib/ai/usage";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request) {
  try {
    const { image, mediaType, tenantId } = await request.json();

    if (!image) {
      return Response.json({ success: false, error: "חסרה תמונה" }, { status: 400 });
    }

    // 1. Load ONLY this business's services so the AI can match a real treatment.
    // Scoped to the caller's tenant_id (dashboard passes settings.tenant_id; the
    // public scanner passes ?t=). Without a tenant we load nothing rather than
    // every tenant's menu — so one business's services never leak into another's
    // prompt (and the prompt stays small/fast). Only the fields we use are read.
    let services = [];
    if (tenantId) {
      const servicesRes = await supabase
        .from("service_prices")
        .select("name, price")
        .eq("tenant_id", tenantId);
      services = servicesRes.data || [];
    }
    const servicesText =
      services.length > 0
        ? services.map((s) => `- ${s.name} (${s.price} ש"ח)`).join("\n")
        : "אין רשימת שירותים";

    // 2. System prompt — professional dual report, JSON only
    const systemPrompt = `את קוסמטיקאית רפואית מנוסה ומקצועית מאוד. את מנתחת תמונת סלפי של לקוחה ומפיקה דוח עור מקצועי ומדויק בעברית.

הדוח כפול: חלק חם ומובן ללקוחה, וחלק קליני נפרד למטפלת.

חשוב מאוד — כתבי תמציתי וענייני: כל פריט במשפט אחד קצר וברור, בלי פסקאות ארוכות. עד 4 ממצאים, עד 4 שלבים בתכנית הקליניקה, עד 4 מוצרים ועד 3 טיפים. דייקנות מקצועית חשובה יותר מאורך.

השירותים הזמינים בעסק (להתאמה):
${servicesText}

הנחיות מקצועיות:
1. נתחי באופן ספציפי ומדויק — סוג עור, מצב הידרציה, נקבוביות, פיגמנטציה, אזורי בעיה ספציפיים (אזור T, לחיים וכו'), סימני גיל/יובש/דלקת אם יש.
2. המלצת הטיפול חייבת להיות טיפול קליני מדויק ומקצועי (למשל: פילינג כימי AHA/BHA, מזותרפיה, הידרהפיל, לייזר פיגמנטציה, RF, מיקרונידלינג, טיפול הבראת עור). ציני את הטיפול הקליני הנכון — ואם יש שירות תואם ברשימת העסק, ציני אותו ב-matched_service.
3. תכנית טיפול לקליניקה (clinic_plan): סדרת טיפולים מלאה ומקצועית — כמה מפגשים, באיזו תדירות, ומה עושים בכל מפגש או שלב. היי ספציפית (למשל: "מפגש 1-3: פילינג אנזימטי + הזנה, אחת לשבועיים").
4. תכנית טיפוח לבית (home_plan): מה הלקוחה עושה בבית בין הטיפולים — מוצרים, מרכיבים פעילים, ושגרה. כתבי בשפה מקצועית אך מובנת.
5. שגרת הטיפוח היומית מלאה: בוקר וערב, עם שלבים ומרכיבים פעילים ספציפיים (ניאצינאמיד, רטינול, חומצה היאלורונית, ויטמין C, SPF 50).
6. החלק למטפלת — קליני לחלוטין: הערכת שכבת עור, מרכיבים פעילים בריכוזים מומלצים, פרוטוקול טיפול מדורג, ואזהרות/קונטרה-אינדיקציות אם רלוונטי.
7. אל תאבחני מצבים רפואיים. הערכה קוסמטית בלבד.
8. אם התמונה לא ברורה / אין בה פנים — החזירי "valid": false.
9. החזירי JSON בלבד — בלי טקסט נוסף, בלי markdown, בלי backticks.

מבנה ה-JSON המדויק:
{
  "valid": true,
  "skin_type": "סוג עור מדויק (למשל: עור מעורב, נוטה לשומניות באזור T, יובש בלחיים)",
  "score": 78,
  "concerns": ["ממצא ספציפי 1", "ממצא ספציפי 2", "ממצא ספציפי 3"],
  "clinical_treatment": "שם הטיפול הקליני המדויק המומלץ",
  "matched_service": "שם שירות מרשימת העסק אם תואם, אחרת ריק",
  "clinic_plan": {
    "treatment_type": "סוג הטיפול המומלץ בקליניקה",
    "sessions": "מספר מפגשים מומלץ ותדירות (למשל: 6 מפגשים, אחת לשבועיים)",
    "steps": ["מה עושים במפגש/שלב 1", "שלב 2", "שלב 3"],
    "expected_results": "מה הלקוחה תראה בסיום הסדרה"
  },
  "home_plan": {
    "summary": "תיאור קצר של מטרת הטיפוח בבית",
    "products": ["מוצר/מרכיב מומלץ 1 ולמה", "מוצר 2", "מוצר 3"],
    "tips": ["טיפ 1 לשמירה על התוצאות", "טיפ 2"]
  },
  "routine_morning": ["שלב 1 עם מרכיב פעיל", "שלב 2", "שלב 3", "שלב 4 (SPF)"],
  "routine_evening": ["שלב 1", "שלב 2 עם מרכיב פעיל", "שלב 3", "שלב 4"],
  "summary": "משפט חם ומעודד אחד ללקוחה",
  "therapist_notes": {
    "skin_assessment": "הערכה קלינית של מצב העור, שכבות, ממצאים",
    "active_ingredients": ["מרכיב + ריכוז מומלץ", "מרכיב + ריכוז"],
    "protocol": "פרוטוקול טיפול מדורג — מספר מפגשים, תדירות, רצף",
    "cautions": "אזהרות / קונטרה-אינדיקציות / נקודות תשומת לב"
  }
}

score = ציון עור כללי 0-100 (גבוה = מצב טוב). היי הוגנת ומעודדת.`;

    // 3. Call Claude with vision. Haiku 4.5 is much faster than Sonnet for this
    // structured-report task. max_tokens is generous enough that the full JSON
    // report is never truncated (1500 was too tight and cut the JSON off), while
    // still well below Sonnet's old 4000.
    // attribution: 'claimed'. THIS ROUTE IS PUBLIC - no session, no auth - and
    // tenantId arrives in the request body, so it cannot be verified and must
    // not be billed to a tenant without reconciliation. Recorded anyway,
    // because a call that spends money and leaves no trace is worse.
    const aiResponse = await trackedCreate(anthropic, {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3000,
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
    }, { tenantId: tenantId || null, callSite: "skin-scan", attribution: "claimed" });

    // 4. Extract + parse safely
    const raw = aiResponse.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();

    const clean = raw.replace(/```json/g, "").replace(/```/g, "").trim();

    // stop_reason === "max_tokens" means the model ran out of budget mid-JSON, so
    // the parse below is guaranteed to fail. Surface it explicitly (separate from
    // a genuinely unreadable photo) so the logs make the cause obvious.
    const truncated = aiResponse.stop_reason === "max_tokens";

    let report;
    try {
      report = JSON.parse(clean);
    } catch (parseErr) {
      // Log the full raw response + why it stopped, so a truncation (or any other
      // malformed output) is diagnosable from the logs rather than guessed at.
      console.error(
        "Skin-scan JSON parse error:",
        parseErr && parseErr.message,
        "| stop_reason:", aiResponse.stop_reason,
        "| usage:", JSON.stringify(aiResponse.usage || {}),
        "| RAW_FULL:", raw
      );
      return Response.json(
        {
          success: false,
          error: truncated
            ? "הדוח היה ארוך מדי והצטמצם. נסי שוב."
            : "לא הצלחנו לנתח את התמונה. נסי תמונה ברורה יותר.",
          stopReason: aiResponse.stop_reason,
        },
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
