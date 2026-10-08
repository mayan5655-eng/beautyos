// app/api/skin-scan/route.js  (v2 — professional)
// BeautyOS AI Skin Scanner — analyzes a client selfie and returns
// a DUAL Hebrew report: a warm client section + a clinical therapist section.
// Includes a precise clinical treatment + matched in-house service,
// and a full AM/PM skincare routine with active ingredients.
// Uses Claude vision.

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { trackedCreate } from "@/lib/ai/usage";
import { checkIpLimit, checkTenantLimit } from "@/lib/rateLimit";
import { verifyScanLink, signScanReport } from "@/lib/scanToken";
import { checkScanPayload, hasForeignScript, admitScan } from "@/lib/skinScanGuard";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { getQuotaStatus } from "@/lib/skinScanQuota";
import { ACTIVE_OR_NULL } from "@/lib/serviceActive";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// WHO MAY SCAN. Naming a tenant is not enough: the request must carry either her SIGNED link
// (every client scan: ?t=<tenant>&s=<signature>) or her own signed-in session for that tenant (the
// scanner inside her app). And it must name a tenant at all: until 2026-10-06 a request with NO
// tenantId skipped the signature, the tenant limit, the monthly quota and the dollar ceiling and went
// straight to a Claude vision call - the "phase 1" leniency below this comment used to be, and the
// ceiling was documented as enforced "regardless of signature". The rules live in lib/skinScanGuard.ts
// and are tested there.
//
// Links shared before signing existed (no `s`) are refused with a message that tells the client to ask
// the cosmetician for a fresh link; she copies it from Settings. That is the cost of closing the hole.

const SCAN_CLOSING = "זו הערכה ראשונית, האבחון המלא בפגישה";

export async function POST(request) {
  try {
    // ── Check order is chosen for cost ──────────────────────────────────────
    // Cheapest and most certain first, so a flood costs us nothing: the IP
    // limit is an in-memory lookup, the signature is an HMAC, and only then do
    // we spend a database round trip on the quota. Reversed, an attacker would
    // generate one query per attempt.

    // 1. Per-IP. No I/O.
    const ipLimited = checkIpLimit(request, "skin-scan");
    if (ipLimited) return ipLimited;

    const { image, mediaType, tenantId, s: signature } = await request.json();

    // 2. Shape and size, then WHO. No I/O until a signature has failed.
    const shape = checkScanPayload({ image, mediaType, tenantId });
    if (!shape.ok) return Response.json({ success: false, error: shape.error }, { status: shape.status });

    const signed = verifyScanLink(tenantId, signature);
    let sessionTenantId = null;
    if (!signed) {
      // Not a signed link: is this HER, signed in, scanning from inside her own app?
      try {
        const sess = await createSessionClient();
        const { data: u } = await sess.auth.getUser();
        if (u?.user) {
          const { data: tid } = await sess.rpc("get_user_tenant_id");
          sessionTenantId = tid || null;
        }
      } catch { /* no session: the verdict below refuses */ }
    }
    const admitted = admitScan({ tenantId, signatureValid: signed, sessionTenantId });
    if (!admitted.ok) {
      console.warn(`[skin-scan] refused (${admitted.reason}) for tenant ${tenantId}`);
      return Response.json({ success: false, error: admitted.error }, { status: admitted.status });
    }

    // 3. Per-tenant burst limit. Still no I/O.
    const tenantLimited = checkTenantLimit(tenantId, "skin-scan");
    if (tenantLimited) return tenantLimited;

    // 4. The monthly ceiling — the only hard cap on spend. One indexed count.
    //    Every admitted request names a tenant, so this always runs.
    {
      const quota = await getQuotaStatus(tenantId);
      console.log(
        `[skin-scan] TENANT FILTER: tenant_id = ${tenantId} | ` +
        `quota ${quota.used}/${quota.limit}${quota.unknown ? " (UNKNOWN — failing CLOSED)" : ""} | ` +
        `signed=${signed}`
      );
      if (quota.unknown) {
        // The counter is unreadable, so the scan is refused (fails closed; the
        // operator has been alerted). Say the TRUE thing to the client - the
        // scanner is unavailable right now - not the false one, that the
        // business used up its scans.
        return Response.json(
          {
            success: false,
            scannerUnavailable: true,
            error:
              "סורק העור לא זמין כרגע. אפשר לנסות שוב בעוד כמה דקות, " +
              "או לפנות ישירות לקוסמטיקאית והיא תשמח לעזור.",
          },
          { status: 503 }
        );
      }
      if (quota.exceeded) {
        // The CLIENT sees this, not the cosmetician - she is not in this
        // request at all. Her own warning lives on the scanner card in the app,
        // which is why the quota is surfaced there before it is reached.
        return Response.json(
          {
            success: false,
            quotaExceeded: true,
            error:
              "סורק העור הגיע למכסת הסריקות החודשית של העסק. " +
              "אפשר לפנות ישירות לקוסמטיקאית והיא תשמח לעזור.",
          },
          { status: 429 }
        );
      }
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
        .eq("tenant_id", tenantId)
        .or(ACTIVE_OR_NULL);
      services = servicesRes.data || [];
    }
    const servicesText =
      services.length > 0
        ? services.map((s) => `- ${s.name} (${s.price} ש"ח)`).join("\n")
        : "אין רשימת שירותים";

    // 2. System prompt — professional dual report, JSON only
    const systemPrompt = `את קוסמטיקאית רפואית מנוסה. את מנתחת תמונת סלפי של לקוחה ומפיקה דוח עור קצר, מקצועי וברור בעברית.

חשוב מאוד: הדוח קצר. נקודות קצרות בלבד, בלי פסקאות, בלי הסברים ארוכים ובלי משפטי פתיחה או סיום. כל פריט הוא שורה אחת, עד 12 מילים.

השירותים הזמינים בעסק (להתאמה):
${servicesText}

הנחיות:
1. skin_type: שורה אחת על סוג העור ומצבו.
2. concerns: בדיוק 3 ממצאים עיקריים, משפט קצר אחד לכל ממצא. כשמציינים מקום בפנים, משתמשים רק באחד מהאזורים האלה, בדיוק בניסוח הזה: מצח, אף, לחיים, סנטר, אזור העיניים. אין אזורים אחרים ואין ניסוחים אחרים (לא "אזור T", לא "חוד", לא "קו הלסת").
3. clinical_treatment: טיפול קליני מומלץ אחד או שניים (למשל: פילינג כימי עדין, הידרהפיל), בשורה אחת. אם יש שירות תואם ברשימת העסק, ציני אותו ב-matched_service, אחרת השאירי ריק.
4. routine_morning: בדיוק 3 שלבים. routine_evening: בדיוק 3 שלבים. כל שלב עם מרכיב או מוצר ספציפי.
5. אל תאבחני מצבים רפואיים. הערכה קוסמטית בלבד.
6. אם התמונה לא ברורה או שאין בה פנים, החזירי {"valid": false}.
7. כתבי רק באותיות עבריות, ולשמות מרכיבים באותיות לטיניות (למשל niacinamide, SPF 30). בלי אותיות ערביות או אותיות מכל כתב אחר, ובלי לערבב כתבים בתוך מילה. מילים באנגלית אסורות חוץ משמות מרכיבים (למשל לא "calming", כתבי "מרגיע").
8. החזירי JSON בלבד, בלי טקסט נוסף, בלי markdown ובלי backticks.

מבנה ה-JSON המדויק:
{
  "valid": true,
  "skin_type": "שורה אחת",
  "score": 78,
  "concerns": ["ממצא 1", "ממצא 2", "ממצא 3"],
  "clinical_treatment": "טיפול אחד או שניים",
  "matched_service": "שם שירות מרשימת העסק אם תואם, אחרת ריק",
  "routine_morning": ["שלב 1", "שלב 2", "שלב 3"],
  "routine_evening": ["שלב 1", "שלב 2", "שלב 3"]
}

score = ציון עור כללי 0-100 (גבוה = מצב טוב). היי הוגנת ומעודדת.`;

    // 3. Call Claude with vision. The report is deliberately SHORT (about 300-500 output tokens): the long clinic / home / therapist
    // blocks it used to carry ran past 3000 tokens and were cut mid-JSON (found 2026-10-08, a real scan returned a parse error).
    // 1200 is a safety margin over a short report, not a budget to fill.
    // This route is PUBLIC - no session. In phase 1 the tenant may arrive
    // either signed (verified above, attribution 'verified') or unsigned from a
    // link shared before signing existed (attribution 'claimed'). Only the
    // former should ever be billed to a tenant without reconciliation.
    const callModel = () => trackedCreate(anthropic, {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1200,
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
    }, {
      tenantId,
      callSite: "skin-scan",
      // The whole point of the signature in phase 1: this column is the
      // evidence that says when unsigned traffic has stopped and enforcement
      // can be switched on.
      attribution: "verified", // admitted: a signed link or her own session (see admitScan)
    });

    // 4. Extract + parse safely. A report with Arabic-script letters in it is asked for ONCE more; if it comes back the same, she gets the
    // friendly "try again" line rather than a garbled word in a clinic report.
    let aiResponse, raw, truncated, report;
    for (let attempt = 0; attempt < 2; attempt++) {
    aiResponse = await callModel();
    raw = aiResponse.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();

    const clean = raw.replace(/```json/g, "").replace(/```/g, "").trim();

    // stop_reason === "max_tokens" means the model ran out of budget mid-JSON, so
    // the parse below is guaranteed to fail. Surface it explicitly (separate from
    // a genuinely unreadable photo) so the logs make the cause obvious.
    truncated = aiResponse.stop_reason === "max_tokens";

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
            ? "הניתוח לא הושלם הפעם. נסי שוב בעוד רגע."
            : "לא הצלחנו לנתח את התמונה. נסי תמונה ברורה יותר.",
          stopReason: aiResponse.stop_reason,
        },
        { status: 422 }
      );
    }
    if (report.valid === false || !hasForeignScript(report)) break;
    console.warn("[skin-scan] Arabic-script letters in the report, attempt " + (attempt + 1));
    report = null;
    }
    if (!report) {
      return Response.json({ success: false, error: "הניתוח לא הושלם הפעם. נסי שוב בעוד רגע." }, { status: 422 });
    }

    if (report.valid === false) {
      return Response.json(
        { success: false, error: "לא זוהו פנים ברורות בתמונה. נסי סלפי באור טוב, בלי איפור כבד." },
        { status: 422 }
      );
    }

    // The closing line is ours, not the model's: always the same honest framing, never a diagnosis.
    report.summary = SCAN_CLOSING;

    // Signed, so /api/skin-scan/send builds its WhatsApp from THIS report and nothing a caller typed.
    return Response.json({ success: true, report, reportToken: signScanReport(tenantId, report) });
  } catch (err) {
    console.error("Skin-scan error:", err);
    // Hebrew messages we wrote ourselves (provider down, caps) reach her as they are; anything else is a friendly line, never a raw error.
    const msg = err && typeof err.message === "string" && /[֐-׿]/.test(err.message) ? err.message : "משהו השתבש בסריקה. נסי שוב בעוד רגע.";
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}
