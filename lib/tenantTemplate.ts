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
// Checked against information_schema, the settings table has 26 columns. This
// module writes 14 of them and the onboarding form writes 5 more. The 7 it
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
// These are not omitted by a filter — they are simply not keys in any object
// below, and scripts/check-template-clean.mjs fails the build if one appears.
//
// Lead message templates are absent for a different reason: they already work
// this way. lib/leads/templates.ts holds DEFAULT_LEAD_TEMPLATES, which every
// tenant falls back to and which renders {clinic} from her own settings. There
// is nothing to seed.

import { legacyHoursFromMap } from './businessHours';

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
  /** Minutes. Carried through the picker so the menu arrives with real
   *  durations — the hand-add form in Settings collects no duration at all and
   *  silently defaults every treatment to 60. */
  duration: number;
  /** Suggested range, inclusive, in shekels. */
  priceMin: number;
  priceMax: number;
};

export type ServiceTemplateGroup = {
  key: string;
  label: string;
  /** Groups beyond the first open collapsed, so the picker is scannable. */
  items: ServiceTemplateItem[];
};

export const SERVICE_TEMPLATE_GROUPS: ServiceTemplateGroup[] = [
  {
    key: 'face',
    label: 'פנים',
    items: [
      { name: 'ניקוי פנים עמוק', duration: 75, priceMin: 250, priceMax: 350 },
      { name: 'טיפול פנים קלאסי', duration: 60, priceMin: 220, priceMax: 300 },
      { name: 'פילינג כימי (AHA/BHA)', duration: 45, priceMin: 300, priceMax: 450 },
      { name: 'הידרהפיל', duration: 60, priceMin: 400, priceMax: 600 },
      { name: 'מיקרונידלינג (דרמה-פן)', duration: 60, priceMin: 500, priceMax: 800 },
      { name: 'טיפול אנטי-אייג׳ינג ומיצוק', duration: 75, priceMin: 400, priceMax: 550 },
      { name: 'טיפול לעור בעייתי ואקנה', duration: 60, priceMin: 280, priceMax: 380 },
      { name: 'מסכת אלגינט', duration: 30, priceMin: 150, priceMax: 200 },
      { name: 'אבחון עור וייעוץ', duration: 30, priceMin: 0, priceMax: 150 },
    ],
  },
  {
    key: 'brows_lashes',
    label: 'גבות וריסים',
    items: [
      { name: 'עיצוב גבות', duration: 20, priceMin: 50, priceMax: 80 },
      { name: 'צביעת גבות', duration: 15, priceMin: 40, priceMax: 60 },
      { name: 'צביעת ריסים', duration: 20, priceMin: 50, priceMax: 70 },
      { name: 'למינציה לגבות', duration: 45, priceMin: 180, priceMax: 280 },
      { name: 'הרמת ריסים', duration: 60, priceMin: 200, priceMax: 300 },
      { name: 'הארכת ריסים — בנייה מלאה', duration: 120, priceMin: 250, priceMax: 400 },
      { name: 'מילוי ריסים', duration: 75, priceMin: 150, priceMax: 220 },
    ],
  },
  {
    key: 'waxing',
    label: 'הסרת שיער בשעווה',
    items: [
      { name: 'שעווה — שפם', duration: 10, priceMin: 25, priceMax: 40 },
      { name: 'שעווה — גבות', duration: 15, priceMin: 40, priceMax: 60 },
      { name: 'שעווה — בית שחי', duration: 15, priceMin: 40, priceMax: 60 },
      { name: 'שעווה — חצי רגל', duration: 20, priceMin: 70, priceMax: 100 },
      { name: 'שעווה — רגליים מלא', duration: 40, priceMin: 120, priceMax: 180 },
      { name: 'שעווה — ביקיני', duration: 20, priceMin: 70, priceMax: 110 },
      { name: 'שעווה — ברזילאי', duration: 30, priceMin: 120, priceMax: 180 },
    ],
  },
  {
    key: 'more',
    label: 'נוסף',
    items: [
      { name: 'הסרת שיער בלייזר — אזור קטן', duration: 20, priceMin: 120, priceMax: 250 },
      { name: 'הסרת שיער בלייזר — אזור גדול', duration: 45, priceMin: 300, priceMax: 600 },
      { name: 'איפור ערב', duration: 60, priceMin: 250, priceMax: 400 },
      { name: 'איפור כלה', duration: 120, priceMin: 800, priceMax: 1500 },
    ],
  },
];

/** Flat view, for dedupe checks and counting. */
export const SERVICE_TEMPLATE_ITEMS: ServiceTemplateItem[] =
  SERVICE_TEMPLATE_GROUPS.flatMap((g) => g.items);

/**
 * The number pre-filled into the price field when she picks a treatment.
 *
 * Midpoint of the range, rounded to the nearest ₪10 so it reads as a round
 * suggested price rather than a computed one. A range starting at 0 (the free
 * consultation) keeps its midpoint rather than being forced upward.
 */
export function suggestedPrice(item: ServiceTemplateItem): number {
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
 */
export const SEEDED_SETTINGS_KEYS = [
  'business_hours',
  'working_days',
  'working_hours_start',
  'working_hours_end',
  'automations',
  'faq',
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
