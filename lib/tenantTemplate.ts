// lib/tenantTemplate.ts
//
// What a brand-new cosmetician starts with.
//
// ── THE ISOLATION RULE, AND HOW THIS FILE ENFORCES IT ────────────────────────
//
// Nothing about any existing tenant's clients, appointments, receipts, leads or
// revenue may ever reach another tenant. That rule is not enforced here by a
// filter or an allowlist that someone has to keep correct — it is enforced by
// this file having no inputs.
//
// Every value below is a literal, typed by hand. The seeding code that consumes
// it performs ZERO reads against any tenant-scoped table: there is no query to
// get wrong, no service-role client to mis-scope, no "copy tenant X" path to
// point at the wrong X. A leak would require someone to ADD a database read to
// a function that has none, which is visible in any diff.
//
// The seed WRITES run in the new user's own session, so RLS applies to them
// exactly as it does to every other write in the app. Even a bug can only ever
// write into her own tenant.
//
// Two consequences worth stating, because they are the reason this shape was
// chosen over the two alternatives:
//
//   * NOT a template tenant. A template tenant is a live tenant: it has a
//     settings row with green_api credentials, it accumulates real clients the
//     moment anyone books through it, and copying from it requires a
//     service-role read that bypasses RLS. It would also mean joining a second
//     tenant_members row to edit it — see supabase/migrations/pending/
//     tenant-resolution-fix.sql, whose stated trigger to run is exactly that.
//
//   * NOT a table, yet. There is currently no way to apply DDL to this project
//     from the repo (see lib/featureFlags.ts). If per-vertical menus ever
//     arrive, the constants below become that table's seed.
//
// scripts/check-template-clean.mjs runs on every build and fails it if anything
// resembling real tenant data appears in this file. That is what turns "we were
// careful" into "the build refuses".
//
// The one import below (legacyHoursFromMap) is a pure function over a plain
// object. Nothing in this file may import a database client, and the build
// check enforces that too.
//
// ── WHAT IS DELIBERATELY ABSENT ──────────────────────────────────────────────
//
// Checked against information_schema, the settings table has 27 columns (26
// plus business_fields, added by supabase/migrations/add_business_fields.sql).
// This module writes 14 of them and the onboarding form writes 6 more —
// business_name, therapist_name, business_phone, primary_color and
// business_fields, directly in app/onboarding/page.tsx's finish(). The 7 it
// never touches are exactly the identity-bearing ones:
//
//   business_phone              her Bit/Paybox number
//   green_api_instance          \ her WhatsApp credentials. There is no
//   green_api_url               / plaintext token column any more — it was
//   green_api_token_encrypted   dropped, and only the AES-256-GCM ciphertext
//                               remains, written solely by the server. See
//                               lib/greenApi/credentials.ts.
//   review_url                  her Google listing
//   business_tax_status         her legal registration (עוסק פטור / מורשה)
//   branding                    the jsonb holding logo_url, hero_image_url,
//                               gallery (her clients' faces), public_address,
//                               her socials and her own welcome copy
//   id                          generated
//
// business_fields is NOT in that list, on purpose: unlike those seven it
// carries no one tenant's identity, contact details or credentials — it is a
// pick from a fixed, shared enum (lib/businessFields.ts), the same tier as
// the group keys and labels below. scripts/check-template-clean.mjs's
// forbidden-key list agrees; it was not added there.
//
// These are not omitted by a filter — they are simply not keys in any object
// below, and scripts/check-template-clean.mjs fails the build if one appears.
//
// Lead message templates are absent for a different reason: they already work
// this way. lib/leads/templates.ts holds DEFAULT_LEAD_TEMPLATES, which every
// tenant falls back to and which renders {clinic} from her own settings. There
// is nothing to seed.

import { legacyHoursFromMap } from './businessHours.ts';
import { BUSINESS_FIELDS, type FieldKey } from './businessFields.ts';

// ── SERVICE MENU ─────────────────────────────────────────────────────────────
//
// She PICKS from this list; it is never inserted for her. Giving a cosmetician
// a treatment she does not perform is worse than giving her an empty screen —
// it lands on her public booking page and in the prompts that write her
// marketing copy.
//
// Prices are GENERIC MARKET RANGES, not any real tenant's price list. The beta
// users are cosmeticians in the same market as each other; publishing one
// clinic's real numbers to the others is a commercial disclosure, not a
// convenience. The range is shown in the picker and the midpoint is inserted as
// an editable starting number, so nothing ever lands at ₪0 on her booking page
// and nothing lands at a price she did not look at.
//
// No injectables, fillers, PRP/plasma, mesotherapy or thread lifts. Those are
// physician-restricted acts in Israel, and lib/ai/profileHygiene.ts blocks them
// from advertising — so a template offering them would put treatments on her
// list that silently never appear in a single generated post.

export type ServiceTemplateItem = {
  /** Treatment name, exactly as it will be written to service_prices.name. */
  name: string;
  /** One line for the booking page, written to service_prices.description.
   *  What the client gets and why she'd want it — never a price or a claim
   *  the cosmetician might not stand behind. She can edit or clear it in
   *  Settings → services. */
  description: string;
  /** Minutes. Carried through the picker so the menu arrives with real
   *  durations — the hand-add form in Settings collects no duration at all and
   *  silently defaults every treatment to 60. */
  duration: number;
  /** Suggested range, inclusive, in shekels — the budget and premium ends.
   *  Shown beside the item as the market range; never inserted by itself. */
  priceMin: number;
  priceMax: number;
  /** The middle tier, when the three were priced separately rather than
   *  taken as a range's midpoint (the nails menu; see suggestedPrice below).
   *  Absent on an item priced as a plain range (the cosmetics menu), where
   *  the midpoint of priceMin/priceMax IS the suggestion. */
  priceMid?: number;
  /** A reminder, never a gate: shown next to the item in the picker for a
   *  treatment that needs its own licence or certification beyond the base
   *  one (e.g. medical pedicure). She knows what she is certified for —
   *  ticking the box is never blocked by this, and nothing checks it. */
  licenceNote?: string;
};

export type ServiceTemplateGroup = {
  key: string;
  label: string;
  /** Groups beyond the first open collapsed, so the picker is scannable. */
  items: ServiceTemplateItem[];
};

// ── PER-FIELD SEED MENUS ─────────────────────────────────────────────────────
//
// She picks a field (or several) in onboarding step 4, before this picker
// ever renders — see FieldPicker / app/onboarding/page.tsx. The menu below is
// keyed by field so a nails technician is never shown a facial-treatment menu
// and vice versa, and a tenant who does both sees the union, grouped so she
// can tell which world each group came from.
//
// A NEW FIELD IS: one entry in lib/businessFields.ts, one key below, and its
// own default images (lib/defaultImages.js) and template pack
// (lib/design/templates/cream/). Nothing else in this file changes shape.
export const SERVICE_TEMPLATE_GROUPS_BY_FIELD: Record<FieldKey, ServiceTemplateGroup[]> = {
  cosmetics: [
    {
      key: 'face',
    label: 'פנים',
    items: [
      { name: 'ניקוי פנים עמוק', description: 'ניקוי יסודי של הנקבוביות, אדים והוצאת שחורים — העור נושם מחדש', duration: 75, priceMin: 250, priceMax: 350 },
      { name: 'טיפול פנים קלאסי', description: 'ניקוי, פילינג עדין, מסכה ולחות — תחזוקה חודשית לעור זוהר', duration: 60, priceMin: 220, priceMax: 300 },
      { name: 'פילינג כימי (AHA/BHA)', description: 'חידוש העור בחומצות מקצועיות — מחליק טקסטורה ומבהיר כתמים', duration: 45, priceMin: 300, priceMax: 450 },
      { name: 'הידרהפיל', description: 'ניקוי עמוק והזנה במכשיר — זוהר מיידי בלי זמן החלמה', duration: 60, priceMin: 400, priceMax: 600 },
      { name: 'מיקרונידלינג (דרמה-פן)', description: 'עידוד קולגן לצמצום צלקות, נקבוביות וקמטוטים', duration: 60, priceMin: 500, priceMax: 800 },
      { name: 'טיפול אנטי-אייג׳ינג ומיצוק', description: 'מיצוק והצערת מראה העור — עובד על קמטים ואלסטיות', duration: 75, priceMin: 400, priceMax: 550 },
      { name: 'טיפול לעור בעייתי ואקנה', description: 'טיפול ייעודי להרגעת דלקות ואיזון עור שמן', duration: 60, priceMin: 280, priceMax: 380 },
      { name: 'מסכת אלגינט', description: 'מסכה מרגיעה וממלאת לחות — השלמה מושלמת לכל טיפול', duration: 30, priceMin: 150, priceMax: 200 },
      { name: 'אבחון עור וייעוץ', description: 'פגישת היכרות: אבחון סוג העור ובניית תוכנית טיפול אישית', duration: 30, priceMin: 0, priceMax: 150 },
    ],
  },
  {
    key: 'brows_lashes',
    label: 'גבות וריסים',
    items: [
      { name: 'עיצוב גבות', description: 'עיצוב מדויק בהתאמה למבנה הפנים — בפינצטה או שעווה', duration: 20, priceMin: 50, priceMax: 80 },
      { name: 'צביעת גבות', description: 'צבע מקצועי שממלא ומדגיש — מחזיק כ-3-4 שבועות', duration: 15, priceMin: 40, priceMax: 60 },
      { name: 'צביעת ריסים', description: 'הכהיית הריסים למראה מודגש בלי מסקרה', duration: 20, priceMin: 50, priceMax: 70 },
      { name: 'למינציה לגבות', description: 'סידור והגבהה של שיערות הגבה — מראה מלא ומסודר לשבועות', duration: 45, priceMin: 180, priceMax: 280 },
      { name: 'הרמת ריסים', description: 'סלסול והרמת הריסים הטבעיים — עיניים פתוחות בלי הארכה', duration: 60, priceMin: 200, priceMax: 300 },
      { name: 'הארכת ריסים — בנייה מלאה', description: 'הארכה ריס-לריס בהתאמה אישית — מראה טבעי או מודגש', duration: 120, priceMin: 250, priceMax: 400 },
      { name: 'מילוי ריסים', description: 'חידוש ההארכה והשלמת ריסים שנשרו — מומלץ כל 3 שבועות', duration: 75, priceMin: 150, priceMax: 220 },
    ],
  },
  {
    key: 'waxing',
    label: 'הסרת שיער בשעווה',
    items: [
      { name: 'שעווה — שפם', description: 'הסרה מהירה ועדינה באזור השפה העליונה', duration: 10, priceMin: 25, priceMax: 40 },
      { name: 'שעווה — גבות', description: 'ניקוי קווי הגבה בשעווה למראה מסודר', duration: 15, priceMin: 40, priceMax: 60 },
      { name: 'שעווה — בית שחי', description: 'הסרה יסודית בשעווה — חלק לאורך זמן', duration: 15, priceMin: 40, priceMax: 60 },
      { name: 'שעווה — חצי רגל', description: 'הסרת שיער מהברך ומטה בשעווה חמה', duration: 20, priceMin: 70, priceMax: 100 },
      { name: 'שעווה — רגליים מלא', description: 'הסרת שיער מלאה לרגליים חלקות לשבועות', duration: 40, priceMin: 120, priceMax: 180 },
      { name: 'שעווה — ביקיני', description: 'הסרה עדינה בקו הביקיני', duration: 20, priceMin: 70, priceMax: 110 },
      { name: 'שעווה — ברזילאי', description: 'הסרה מלאה באזור הביקיני — עבודה עדינה ומקצועית', duration: 30, priceMin: 120, priceMax: 180 },
    ],
  },
  {
    key: 'more',
    label: 'נוסף',
    items: [
      { name: 'הסרת שיער בלייזר — אזור קטן', description: 'טיפול לייזר לאזור ממוקד — שפם, סנטר או בית שחי', duration: 20, priceMin: 120, priceMax: 250 },
      { name: 'הסרת שיער בלייזר — אזור גדול', description: 'טיפול לייזר לרגליים, ידיים או גב — תוצאה לטווח ארוך', duration: 45, priceMin: 300, priceMax: 600 },
      { name: 'איפור ערב', description: 'איפור מלא לאירוע — מותאם לסגנון ולתאורה', duration: 60, priceMin: 250, priceMax: 400 },
      { name: 'איפור כלה', description: 'איפור כלה כולל ניסיון מוקדם — מחזיק מהבוקר עד הריקוד האחרון', duration: 120, priceMin: 800, priceMax: 1500 },
    ],
    },
  ],

  // Corrected by Maayan 2026-09-28, real Israeli pricing at three tiers —
  // budget / mid / premium. Mid is what suggestedPrice() inserts; budget and
  // premium are priceMin/priceMax, the market-range hint shown beside the
  // item (same UI as the cosmetics menu, which only ever had a range). Still
  // generic market numbers, never one real tenant's price list — same rule
  // as the cosmetics menu above. Grouped so the group keys double as the
  // default-image categories (hands / gel / nail art / pedicure) — see
  // lib/defaultImages.js once that pass lands.
  nails: [
    {
      key: 'manicure',
      label: 'מניקור',
      items: [
        { name: 'שיוף ולק לידיים', description: 'עיצוב וליטוש ציפורניים עם לק רגיל — רענון מהיר לידיים', duration: 30, priceMin: 80, priceMid: 120, priceMax: 179 },
        { name: 'מניקור (שיוף, הסרת עור, לק)', description: 'טיפוח מלא: שיוף, הסרת עור מת ולק — הבסיס לידיים מטופחות', duration: 45, priceMin: 120, priceMid: 170, priceMax: 225 },
        { name: 'מניקור ג׳ל', description: 'מניקור מלא עם לק ג׳ל עמיד שלא מתקלף — מחזיק כשלושה שבועות', duration: 60, priceMin: 150, priceMid: 200, priceMax: 255 },
        { name: 'שיוף ולק ג׳ל (ללא הסרה)', description: 'לק ג׳ל טרי על ציפורניים נקיות, בלי הסרת לק קודם', duration: 45, priceMin: 130, priceMid: 160, priceMax: 199 },
        { name: 'שיוף ולק ג׳ל כולל הסרה', description: 'הסרת לק ג׳ל קודם ולק ג׳ל חדש — הכל בטיפול אחד', duration: 60, priceMin: 150, priceMid: 180, priceMax: 210 },
        { name: 'מניקור ספא', description: 'טיפול ידיים מפנק: פילינג, מסכה ועיסוי לצד המניקור', duration: 75, priceMin: 180, priceMid: 230, priceMax: 290 },
        { name: 'פראפין לידיים', description: 'טבילה בפראפין חם להזנה ולחות עמוקה לידיים', duration: 20, priceMin: 60, priceMid: 90, priceMax: 120 },
        { name: 'הסרת לק ג׳ל', description: 'הסרה מקצועית שלא פוגעת בציפורן הטבעית', duration: 20, priceMin: 40, priceMid: 60, priceMax: 80 },
      ],
    },
    {
      key: 'extensions',
      label: 'תוספות ובנייה',
      items: [
        { name: 'בניית ציפורניים', description: 'בניית ציפורניים אחידה וחזקה, באורך ובצורה שתבחרי', duration: 120, priceMin: 220, priceMid: 300, priceMax: 420 },
        { name: 'מילוי', description: 'חידוש התוספות הקיימות והתאמה לצמיחה — מומלץ כל 3–4 שבועות', duration: 90, priceMin: 160, priceMid: 220, priceMax: 300 },
      ],
    },
    {
      key: 'pedicure',
      label: 'פדיקור',
      items: [
        { name: 'פדיקור רגליים מלא', description: 'טיפוח מלא לכפות הרגליים: שיוף, הסרת עור וציפורניים מסודרות', duration: 60, priceMin: 140, priceMid: 190, priceMax: 260 },
        { name: 'פדיקור לק ג׳ל', description: 'לק ג׳ל עמיד לרגליים — מושלם לקיץ ולסנדלים', duration: 75, priceMin: 170, priceMid: 220, priceMax: 300 },
        { name: 'שיוף ולק לרגליים', description: 'עיצוב וליטוש ציפורני הרגליים עם לק רגיל — רענון מהיר', duration: 30, priceMin: 80, priceMid: 110, priceMax: 160 },
        { name: 'פדיקור ספא', description: 'טיפול רגליים מפנק: פילינג, מסכה ועיסוי ממושך', duration: 90, priceMin: 200, priceMid: 260, priceMax: 340 },
        { name: 'תיקון ציפורן שבורה', description: 'תיקון מהיר לציפורן רגל שנשברה בין טיפולים', duration: 20, priceMin: 40, priceMid: 60, priceMax: 90 },
        { name: 'פדיקור רפואי', description: 'טיפול פדיקור מקצועי לרגליים הדורשות תשומת לב מיוחדת — יבלות, עור מעובה או ציפורניים קשות', duration: 60, priceMin: 150, priceMid: 200, priceMax: 280, licenceNote: 'דורש הסמכה בפדיקור רפואי' },
      ],
    },
    {
      key: 'nail_art',
      label: 'עיצוב ואמנות ציפורניים',
      items: [
        { name: 'נייל ארט (לציפורן)', description: 'עיצוב, גליטר או אבנים על ציפורן בודדת — תוספת לכל טיפול', duration: 10, priceMin: 15, priceMid: 25, priceMax: 40 },
      ],
    },
  ],
};

/** Field-ordered groups for the fields she's picked, matching BUSINESS_FIELDS
 *  display order regardless of the order `fields` was passed in. Unknown
 *  keys are simply skipped rather than thrown on, since a stored value can
 *  outlive this list (see businessFieldsOf's own defensive read). */
export function serviceTemplateGroupsFor(fields: FieldKey[]): { field: FieldKey; groups: ServiceTemplateGroup[] }[] {
  const wanted = new Set(fields);
  return BUSINESS_FIELDS.filter((f) => wanted.has(f.key)).map((f) => ({
    field: f.key,
    groups: SERVICE_TEMPLATE_GROUPS_BY_FIELD[f.key] ?? [],
  }));
}

/** Cosmetics only, flattened — kept for any caller that predates the
 *  multi-field menu and has not been updated to pass a field list. */
export const SERVICE_TEMPLATE_GROUPS: ServiceTemplateGroup[] = SERVICE_TEMPLATE_GROUPS_BY_FIELD.cosmetics;

/** Flat view of every field's items, for dedupe checks and counting. */
export const SERVICE_TEMPLATE_ITEMS: ServiceTemplateItem[] = Object.values(
  SERVICE_TEMPLATE_GROUPS_BY_FIELD
).flatMap((groups) => groups.flatMap((g) => g.items));

/**
 * The number pre-filled into the price field when she picks a treatment.
 *
 * priceMid wins when the item has one: it was priced as its own tier (budget
 * / mid / premium), not derived, so it is used exactly as given — no
 * rounding, since e.g. nail art's ₪25 is a deliberate number, not a midpoint
 * that happened to land there.
 *
 * Otherwise, the midpoint of priceMin/priceMax, rounded to the nearest ₪10 so
 * it reads as a round suggested price rather than a computed one. A range
 * starting at 0 (the free consultation) keeps its midpoint rather than being
 * forced upward.
 */
export function suggestedPrice(item: ServiceTemplateItem): number {
  if (typeof item.priceMid === 'number') return item.priceMid;
  return Math.round((item.priceMin + item.priceMax) / 2 / 10) * 10;
}

/** "₪250–350", or "₪150" when the range is a single number. */
export function priceRangeLabel(item: ServiceTemplateItem): string {
  if (item.priceMin === item.priceMax) return `₪${item.priceMin}`;
  return `₪${item.priceMin}–${item.priceMax}`;
}

// ── BUSINESS HOURS ───────────────────────────────────────────────────────────
//
// A STARTING POINT, not a constraint. Every hour of every day is selectable in
// Settings → שעות (00:00 through 24:00, all seven days), because cosmeticians
// do not share a schedule: some work evenings, some work Friday mornings, some
// work Saturday nights after Shabbat. This map only decides what she sees
// before she touches anything.
//
// Keys are stringified day-of-week to match the business_hours JSONB that
// lib/businessHours.ts reads (0 = Sunday … 6 = Saturday). null = closed.

/** Fallback range, used only when onboarding has nothing better to offer. */
export const DEFAULT_OPEN_HOUR = 9;
export const DEFAULT_CLOSE_HOUR = 19;

/** Friday closes early in most Israeli clinics. Not a rule — a starting row. */
const DEFAULT_FRIDAY_CLOSE = 14;

/**
 * The starting week, built around the hours she just typed in onboarding.
 *
 * Derived rather than hardcoded so the seeded per-day map cannot disagree with
 * the working_hours_start/end she chose one step earlier. Those legacy columns
 * are still read directly by the day-view grid, so two sources saying different
 * things would show her a calendar that does not match her own settings.
 *
 * Sunday–Thursday take her hours as typed. Friday takes her opening hour and
 * closes at 14:00, or at her own closing hour if she already finishes earlier;
 * if that leaves no working day at all, Friday starts closed. Saturday starts
 * closed. None of this is a constraint: every day toggles and every hour from
 * 00:00 to 24:00 is selectable in Settings → שעות, because some cosmeticians
 * work evenings, some work Friday mornings and some work Saturday nights.
 */
export function buildDefaultBusinessHours(
  openHour: number = DEFAULT_OPEN_HOUR,
  closeHour: number = DEFAULT_CLOSE_HOUR
): Record<string, { open: number; close: number } | null> {
  const open = Number.isFinite(openHour) ? Math.min(Math.max(Math.trunc(openHour), 0), 23) : DEFAULT_OPEN_HOUR;
  const close = Number.isFinite(closeHour) ? Math.min(Math.max(Math.trunc(closeHour), 0), 24) : DEFAULT_CLOSE_HOUR;
  // A range that does not describe a working day is not worth seeding.
  const weekday = close > open ? { open, close } : { open: DEFAULT_OPEN_HOUR, close: DEFAULT_CLOSE_HOUR };
  const fridayClose = Math.min(weekday.close, DEFAULT_FRIDAY_CLOSE);
  const friday = fridayClose > weekday.open ? { open: weekday.open, close: fridayClose } : null;

  return {
    '0': { ...weekday }, // ראשון
    '1': { ...weekday }, // שני
    '2': { ...weekday }, // שלישי
    '3': { ...weekday }, // רביעי
    '4': { ...weekday }, // חמישי
    '5': friday,         // שישי
    '6': null,           // שבת
  };
}

// ── AUTOMATION FLAGS ─────────────────────────────────────────────────────────
//
// Seeded EXPLICITLY rather than left undefined, so that every automation is a
// visible toggle in Settings → אוטומציות whose stored value matches what she
// sees, instead of a column that happens to be absent and is interpreted by a
// default buried in the render.
//
// The values chosen reproduce today's behaviour exactly — this seed changes
// what is written down, not what happens:
//   * reminders / review requests / win-back / package reminders default ON in
//     the reader (`onDefaultTrue`), so they are seeded true.
//   * gap-fill and auto-receipt default OFF, so they are seeded false.
//
// gap_fill_enabled is seeded OFF deliberately and stays that way until she
// turns it on. It sends real WhatsApp messages to real clients the moment an
// appointment is cancelled; that has to be a decision she makes, not one she
// inherits. It is a plain toggle in Settings → אוטומציות → תפעול, so finding it
// takes no support request.

export const DEFAULT_AUTOMATION_FLAGS = {
  reminders_enabled: true,
  review_requests_enabled: true,
  winback_enabled: true,
  package_reminders_enabled: true,
  bot_active: true,
  bot_mode: 'always' as const,
  gap_fill_enabled: false,
  send_receipt_auto: false,
};

/** The structured automations JSONB. lead_templates is deliberately absent —
 *  an absent key means "never set", which is what makes DEFAULT_LEAD_TEMPLATES
 *  apply. Seeding {} there would be indistinguishable, but seeding the texts
 *  would freeze today's copy into every new tenant's row forever. */
export const DEFAULT_AUTOMATIONS = {
  paused: false,
  skin_followup: { mode: 'off' as const },
};

// ── BOT FAQ ──────────────────────────────────────────────────────────────────
//
// Questions only. The ANSWERS are deliberately empty strings.
//
// Every cosmetician's clients ask the same five things; no two answer them the
// same way, and one tenant's answers are full of her own details — "יש חניה
// חופשית ברחוב" names her street as surely as the address field does. Seeding
// the questions blank turns the FAQ screen from an empty box into a short form
// with five prompts, without putting one word of anyone else's business into
// her bot.

export const FAQ_SKELETON: Array<{ q: string; a: string }> = [
  { q: 'יש חניה באזור?', a: '' },
  { q: 'מה מדיניות הביטולים?', a: '' },
  { q: 'מה כדאי להביא לטיפול הראשון?', a: '' },
  { q: 'באילו אמצעי תשלום אפשר לשלם?', a: '' },
  { q: 'כמה זמן לפני התור להגיע?', a: '' },
];

// ── THE SEED ─────────────────────────────────────────────────────────────────

/**
 * Every settings key this module is allowed to write. The seed builder emits
 * these and nothing else.
 *
 * A WHITELIST, not a blocklist, and that direction is the point: a settings
 * column added next year is not seeded until someone adds it here on purpose.
 * The failure mode of forgetting is "a new tenant does not get the new default",
 * which is harmless. The failure mode of a blocklist is the opposite.
 *
 * app/api/settings/save also imports this list for a second purpose: on an
 * insert that fails because the database does not yet have one of these
 * columns (a migration applied by hand, per the standing rule in
 * supabase/migrations/pending/README.md, can lag the code), it retries with
 * every key here stripped. business_fields is included for exactly that
 * reason even though buildSeedSettings() below never emits it — it is
 * written directly by app/onboarding/page.tsx's finish(), the same as
 * business_name, but unlike business_name its column is new
 * (supabase/migrations/add_business_fields.sql) and can be missing on an
 * environment where that file has not been run yet. Without it here, a
 * missing column would fail the whole signup insert a second time, on the
 * exact field this list exists to protect against.
 */
export const SEEDED_SETTINGS_KEYS = [
  'business_hours',
  'working_days',
  'working_hours_start',
  'working_hours_end',
  'automations',
  'faq',
  'business_fields',
  ...Object.keys(DEFAULT_AUTOMATION_FLAGS),
];

/**
 * The configuration a new tenant is created with.
 *
 * Merged into the single settings insert that onboarding already performs, so
 * seeding is not a second write that can half-succeed.
 *
 * Its only inputs are the two hours she typed in the previous step. It reads no
 * table, takes no tenant id, and returns the same object for everyone given the
 * same two numbers — which is what makes the isolation rule at the top of this
 * file a property of the code rather than a promise about it.
 */
export function buildSeedSettings(
  openHour: number = DEFAULT_OPEN_HOUR,
  closeHour: number = DEFAULT_CLOSE_HOUR
): Record<string, unknown> {
  const businessHours = buildDefaultBusinessHours(openHour, closeHour);
  return {
    business_hours: businessHours,
    // working_days / working_hours_start / working_hours_end, derived from the
    // SAME map rather than set alongside it.
    //
    // settings still carries the legacy trio next to the business_hours JSONB,
    // and lib/businessHours.ts falls back to it for any day the JSONB does not
    // name. The Settings hours editor already keeps the two in step by running
    // every change through legacyHoursFromMap; the seed was the one writer of
    // business_hours that did not, which left a new tenant's working_days at
    // whatever the column default happens to be while business_hours said
    // something else.
    //
    // No reader is harmed by that today — all four consumers (advisor,
    // whatsapp-webhook, /book, lib/branding) select working_days only to hand
    // it to dayHoursFrom, which prefers business_hours whenever the day key
    // exists, and the seed writes all seven keys including an explicit null for
    // Saturday. But working_days is in the PUBLIC column allowlist that the
    // anonymous booking page reads, so "safe because nothing currently reads it
    // directly" is a property of today's callers, not of the data.
    ...legacyHoursFromMap(businessHours as unknown as Record<number, { open: number; close: number } | null>),
    automations: { ...DEFAULT_AUTOMATIONS },
    faq: FAQ_SKELETON.map((f) => ({ ...f })),
    ...DEFAULT_AUTOMATION_FLAGS,
  };
}
