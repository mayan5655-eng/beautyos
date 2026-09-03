// lib/botPrompt.ts
// Single source of truth for the WhatsApp bot's system prompt, so the live
// webhook (app/api/whatsapp-webhook) and the test route (app/api/ai-agent)
// always speak with the same voice and the same business knowledge.
//
// The prompt is built from the tenant's settings + active services, and now
// also from her custom Q&A (settings.faq). The FAQ block is placed ABOVE the
// generic rules so her authored answers take priority over generic ones.
//
// IMPORTANT: when a tenant has no usable FAQ pairs, faqBlockHe() returns "" and
// the produced prompt is byte-for-byte identical to the previous webhook prompt
// — existing behaviour is unchanged for everyone who hasn't added any Q&A.

import { hoursSummaryHe, type HoursSettings } from "./businessHours.ts";

export interface BotService {
  name?: string | null;
  price?: number | string | null;
  duration?: number | string | null;
}

export interface FaqPair {
  q?: string | null;
  a?: string | null;
}

export interface BotSettings extends HoursSettings {
  business_name?: string | null;
  therapist_name?: string | null;
  faq?: FaqPair[] | null;
}

// Build the Hebrew FAQ block from settings.faq. Trims and drops any pair that
// is missing a question or an answer, so blank rows left in the UI never reach
// the prompt. Returns "" when there is nothing usable -> prompt stays unchanged.
export function faqBlockHe(settings: BotSettings | null | undefined): string {
  const raw = settings && Array.isArray(settings.faq) ? settings.faq : [];
  const pairs = raw
    .map((f) => ({ q: String(f?.q ?? "").trim(), a: String(f?.a ?? "").trim() }))
    .filter((f) => f.q && f.a);
  if (pairs.length === 0) return "";
  const lines = pairs.map((f) => `ש: ${f.q}\nת: ${f.a}`).join("\n\n");
  return `שאלות ותשובות שהמטפלת הגדירה מראש (אלה המקור הראשון והמדויק ביותר — אם שאלת הלקוחה תואמת אחת מהן, עני לפי התשובה שהוגדרה):
${lines}`;
}

// Build the full system prompt for a tenant. appUrl is passed in (not read from
// env here) so the helper stays pure and easy to reason about per caller.
export function buildSystemPrompt({
  settings,
  services,
  tenantId,
  appUrl,
}: {
  settings: BotSettings;
  services: BotService[];
  tenantId: string;
  appUrl: string;
}): string {
  const businessName = settings.business_name || "העסק";
  const therapistName = settings.therapist_name || "";
  const bookUrl = `${appUrl}/book?t=${tenantId}`;

  const servicesText =
    services.length > 0
      ? services
          .map(
            (s) =>
              `- ${s.name}${s.price ? ` (${s.price} ש"ח)` : ""}${s.duration ? `, ${s.duration} דקות` : ""}`
          )
          .join("\n")
      : "לא הוגדרו שירותים";

  const faqBlock = faqBlockHe(settings);

  return `את העוזרת הווירטואלית של "${businessName}"${therapistName ? ` (המטפלת: ${therapistName})` : ""}, עסק יופי/קוסמטיקה בישראל.

תפקידך: לענות ללקוחות בוואטסאפ בעברית, בחמימות, בקצרה ובבהירות.

ידע על העסק:
שירותים ומחירים:
${servicesText}

שעות פעילות (לפי יום):
${hoursSummaryHe(settings)}
${faqBlock ? `\n${faqBlock}\n` : ""}
כללים:
1. דברי תמיד בעברית, בנימה חמה ומקצועית (לא רובוטית).
2. תשובות קצרות — עד שלושה משפטים. זה וואטסאפ, לא אימייל.
3. כשלקוחה רוצה לקבוע תור, או שואלת על זמינות/תורים, הפני אותה לקישור הקביעה: ${bookUrl}
4. אל תמציאי מחיר או טיפול — עני רק לפי הרשימה למעלה.
5. אם אינך יודעת משהו, אמרי שתעבירי את הפנייה למטפלת, ואל תמציאי.
6. כדי לקבוע תור — תמיד הפני לקישור הקביעה.`;
}
