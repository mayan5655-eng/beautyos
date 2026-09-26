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

export const DEFAULT_IMAGE_KEYS = [
  "facial-classic", "acne", "pigmentation", "peel-green", "peel-deep", "anti-aging",
  "laser-hair", "plasma-pen", "led", "deep-cleansing", "equipment",
  "neutral", "hero", "about",
];

export const defaultImageUrl = (key) => `/defaults/${key}.jpg`;

// [key, pattern] in priority order.
const RULES = [
  ["laser-hair", /לייזר|הסרת שיער|laser/i],
  ["plasma-pen", /פלזמה|plasma/i],
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
];

/** The default picture key for a service name; "neutral" when nothing fits. */
export function defaultKeyForService(name) {
  const n = String(name || "");
  for (const [key, re] of RULES) if (re.test(n)) return key;
  return "neutral";
}

/**
 * The picture for one service: hers if she set one (branding.service_images,
 * keyed by service id), otherwise the default for its name.
 * isDefault tells the settings screen which ones to label.
 */
export function serviceImage(service, serviceImages) {
  const own = serviceImages && typeof serviceImages === "object" ? serviceImages[service?.id] : null;
  if (typeof own === "string" && own.trim()) return { url: own.trim(), isDefault: false };
  return { url: defaultImageUrl(defaultKeyForService(service?.name)), isDefault: true };
}
