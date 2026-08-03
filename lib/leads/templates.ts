// lib/leads/templates.ts
// Per-status WhatsApp templates for leads.
//
// Stored at settings.automations.lead_templates as { <status_key>: "text" }.
// That JSONB column is already the structured automation namespace (it holds
// automations.paused and automations.skin_followup), it exists on every row,
// and nesting here needs no migration.
//
// Only non-empty strings are kept, so a status with no template simply opens a
// blank composer rather than an empty-but-present entry.

export const LEAD_TEMPLATES_KEY = 'lead_templates';

// Used when a template contains {name} but the lead has no name on file.
const NAME_FALLBACK = 'לקוחה יקרה';

// The clinic name rules live in lib/clinicName.ts so that every message path
// (lead templates, gap-fill offers, anything added later) shares one blocklist.
// Re-exported here for existing importers.
export { clinicName, CLINIC_FALLBACK } from '../clinicName';
import { clinicName } from '../clinicName';

// Starting templates shown to a tenant who has never saved one. A tenant's own
// saved text always wins - including an explicitly cleared (empty) one.
export const DEFAULT_LEAD_TEMPLATES: Record<string, string> = {
  new: 'היי {name}! שמחתי לקבל את הפנייה שלך אלינו — {clinic} 💕 אשמח להכיר ולעזור לך למצוא בדיוק את מה שאת צריכה. מתי נוח לך לדבר?',
  no_answer: 'היי {name}, ניסיתי להשיג אותך — כאן {clinic} 🙂 אשמח לחזור אלייך — מתי הכי נוח? אפשר גם פשוט להשיב לי כאן בהודעה 💛',
  awaiting_reply: 'היי {name}, רק מוודאת שקיבלת את ההודעה שלי 😊 אני כאן לכל שאלה, אל תתביישי! — {clinic}',
  in_progress: 'היי {name}! שמחה שאנחנו בקשר 💕 יש לך עוד שאלות לפני שנתקדם? אני כאן בשבילך — {clinic}',
  quote_sent: 'היי {name} 🙂 שלחתי לך את כל הפרטים והמחיר של {clinic}. יש שאלות? אשמח לעזור ולמצוא יחד את הזמן שמתאים לך 💕',
  scheduled: 'היי {name}! מאשרת את התור שלנו — {clinic} 🎉 מחכה לראות אותך! אם משהו משתנה, פשוט עדכני אותי מראש 💛',
  no_show: 'היי {name}, פספסנו אותך היום — {clinic} 🙁 קורה! אשמח לקבוע לך תור חדש בזמן שיתאים לך יותר. מתי נוח?',
  follow_up_later: 'היי {name}, חשבתי עלייך! זה הזמן שדיברנו עליו — עדיין מעוניינת? אשמח לקבוע לך תור — {clinic} 💛',
  closed: 'היי {name}! תודה שבחרת בנו — {clinic} 🙏 היה לי ממש כיף. אשמח לראות אותך שוב — ואם תכירי לי חברות, אשמח מאוד 💕',
  irrelevant: 'היי {name}, תודה על הזמן! אם יום אחד תרצי — הדלת של {clinic} תמיד פתוחה 🌸 שיהיה לך רק טוב',
};

// Read the saved templates off a settings row. Defensive: any unexpected shape
// (null settings, automations not an object, a non-string value) yields {}.
//
// Empty strings are PRESERVED, not dropped: a saved "" means the user cleared
// that template on purpose and it must not be refilled from the defaults. Only
// an absent key means "never set".
export function readLeadTemplates(settings: any): Record<string, string> {
  const autos = settings?.automations;
  if (!autos || typeof autos !== 'object') return {};
  const raw = autos[LEAD_TEMPLATES_KEY];
  if (!raw || typeof raw !== 'object') return {};

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

// Merge templates back into an automations object, dropping blanks so the JSONB
// never accumulates empty keys. Unknown automation keys are preserved.
export function writeLeadTemplates(
  automations: any,
  templates: Record<string, string>
): Record<string, any> {
  const base =
    automations && typeof automations === 'object' ? automations : {};

  // Keeps "" so a deliberate clear survives a round-trip.
  const kept: Record<string, string> = {};
  for (const [key, value] of Object.entries(templates)) {
    if (typeof value === 'string') kept[key] = value;
  }
  return { ...base, [LEAD_TEMPLATES_KEY]: kept };
}

// The template actually used for a status: the tenant's saved text when the key
// exists (even if empty, meaning deliberately cleared), otherwise the default.
export function resolveLeadTemplate(settings: any, status: string): string {
  const saved = readLeadTemplates(settings);
  if (Object.prototype.hasOwnProperty.call(saved, status)) return saved[status];
  return DEFAULT_LEAD_TEMPLATES[status] || '';
}

// Substitute the placeholders with real values, falling back to neutral Hebrew
// wording so a sent message never contains a raw {placeholder}.
//   {name}   -> the lead's name
//   {clinic} -> the business name from settings
export function renderLeadTemplate(
  text: string,
  lead: { name?: string | null } | null | undefined,
  settings?: any
): string {
  if (!text) return '';
  const name = (lead?.name || '').trim() || NAME_FALLBACK;
  const clinic = clinicName(settings);
  return text.replace(/\{name\}/g, name).replace(/\{clinic\}/g, clinic);
}
