// lib/defaultImages.js
//
// The pictures a public page wears until she uploads her own. Every page must
// look complete on day one with zero uploads, so each treatment type has a
// generated default, committed as a static file under public/defaults/ - no
// per-view cost, no API call at render time. scripts/generate-default-images.ts
// makes them (once); this file is only the map from a service NAME to one of
// them, and the rule that hers always wins.
//
// Matching is by keyword on the service name, most specific first, because
// "פילינג גרין" contains "פילינג" and must land on the green peel, not the
// generic one. A name that matches nothing gets the neutral picture.
//
// FIELD-AWARE since business_fields shipped: one keyword vocabulary per field
// (RULES_BY_FIELD), each with its own neutral fallback — a generic cosmetics
// still-life is the wrong ambience for a nails business, and vice versa. A
// service's own `field` (service_prices.field, set by ServiceTemplatePicker
// when it was picked from a seed menu) decides which table to search. A
// service with no field set — typed by hand, or a row from before this
// column existed — tries every field's table in a fixed order and takes the
// first hit; that IS this file's original behaviour, just no longer assuming
// only one vocabulary exists. Order matters within EVERY table for the same
// reason it always has here: "פדיקור לק ג'ל" must land on pedicure via
// "פדיקור" before manicure's broader "לק" gets a chance at it.

export const DEFAULT_IMAGE_KEYS = [
  // cosmetics
  "facial-classic", "acne", "pigmentation", "peel-green", "peel-deep", "anti-aging",
  "laser-hair", "plasma-pen", "led", "deep-cleansing", "equipment", "brows",
  "neutral", "hero", "about",
  // nails
  "nails-extensions", "nails-pedicure", "nails-nail-art", "nails-manicure", "nails-neutral",
];

export const defaultImageUrl = (key) => `/defaults/${key}.jpg`;

// One [key, pattern] priority list per field. Checked top to bottom; first
// match wins.
const RULES_BY_FIELD = {
  cosmetics: [
    ["laser-hair", /לייזר|הסרת שיער|laser/i],
    ["plasma-pen", /פלזמה|plasma/i],
    ["brows", /גבות|גבה|גבנ|brow/i],
    ["led", /\bled\b|פוטותרפיה|טיפול אור|photo/i],
    ["pigmentation", /פיגמנט|כתמים|כלואזמה|pigment/i],
    ["acne", /אקנה|פצעונים|acne/i],
    ["peel-green", /גרין|green/i],
    ["peel-deep", /פילינג\s*(עמוק|דיפ|רפואי|TCA)|דיפ\s*פיל|deep\s*peel/i],
    ["anti-aging", /אנטי|אייג|הצערה|מיצוק|קמטים|anti|aging|ageing/i],
    ["peel-green", /פילינג|קילוף|peel/i], // a plain "peeling": the gentle picture, not the deep one
    ["deep-cleansing", /ניקוי|deep\s*clean|cleans/i],
    ["facial-classic", /טיפול פנים|פנים|facial/i],
    ["equipment", /מכשיר|טכנולוגי|RF|רדיו|אולטרסאונד|מיקרונידלינג|נידלינג|קריו|equipment/i],
  ],
  nails: [
    // Building/filling first: "בניית ציפורניים" and "מילוי" share no keyword
    // with the tables below, but checking them first keeps this table honest
    // as more items are added later.
    ["nails-extensions", /בניית ציפורניים|מילוי|אקריל|בילדר|extension|acrylic|builder/i],
    // Pedicure before manicure: "פדיקור לק ג'ל" contains "לק", which manicure
    // below would otherwise grab first.
    ["nails-pedicure", /פדיקור|רגליים|pedicure/i],
    ["nails-nail-art", /נייל ארט|עיצוב ציפורניים|כרום|אומברה|nail art/i],
    ["nails-manicure", /מניקור|ידיים|לק|ציפורן|פראפין|manicure/i],
  ],
};

const NEUTRAL_KEY_FOR_FIELD = { cosmetics: "neutral", nails: "nails-neutral" };

// Cosmetics first when a service carries no field at all: every tenant on
// this product before nails existed is a cosmetician, so that vocabulary is
// the more likely match for an unlabelled legacy row.
const FIELD_GUESS_ORDER = ["cosmetics", "nails"];

function matchIn(name, field) {
  const rules = RULES_BY_FIELD[field];
  if (!rules) return null;
  for (const [key, re] of rules) if (re.test(name)) return key;
  return null;
}

/**
 * The default picture key for a service name; "neutral" (or the matching
 * field's own neutral) when nothing fits.
 *
 * `field` is optional. Given a known field, only that field's vocabulary is
 * tried, and an unmatched name falls back to THAT field's neutral picture —
 * never the wrong field's. Omitted or unrecognised, every field is tried in
 * FIELD_GUESS_ORDER and an unmatched name falls back to the generic
 * "neutral" key, exactly as this function always behaved.
 */
export function defaultKeyForService(name, field) {
  const n = String(name || "");
  if (field && RULES_BY_FIELD[field]) {
    return matchIn(n, field) || NEUTRAL_KEY_FOR_FIELD[field] || "neutral";
  }
  for (const f of FIELD_GUESS_ORDER) {
    const hit = matchIn(n, f);
    if (hit) return hit;
  }
  return "neutral";
}

/**
 * The picture for one service: hers if she set one (branding.service_images,
 * keyed by service id), otherwise the default for its name and field.
 * isDefault tells the settings screen which ones to label.
 */
export function serviceImage(service, serviceImages) {
  const own = serviceImages && typeof serviceImages === "object" ? serviceImages[service?.id] : null;
  if (typeof own === "string" && own.trim()) return { url: own.trim(), isDefault: false };
  return { url: defaultImageUrl(defaultKeyForService(service?.name, service?.field)), isDefault: true };
}
