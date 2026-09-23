// lib/design/templates/cream/evergreen.ts
//
// The twenty evergreen definitions of the studio look (see ../cream.ts):
// what she posts all year. Each one becomes a feed 4:5 and a story 9:16
// template. Words are defaults she edits; pictures come from her gallery
// or the AI route with the hint given here; nothing here is a colour.

import type { CreamDef } from '../cream.ts';

const CLINIC_LIGHT = 'soft window light, warm neutral tones, a calm treatment room';

export const offer: CreamDef = {
  slug: 'offer', name: 'מבצע', category: 'offer', group: 'evergreen',
  description: 'תמונה גדולה, כותרת אלגנטית, מחיר גדול לצידה, וכפתור. לפוסט מבצע.',
  versions: { feed: 2, story: 1 },
  layout: { family: 'top' },
  photoSlot: { aiHint: `a calm treatment moment in a bright clinic, ${CLINIC_LIGHT}, the subject slightly off-centre, quiet and unposed` },
  kicker: { default: 'מבצע לזמן מוגבל' },
  headline: { default: 'טיפול פנים קלאסי', maxLength: 40 },
  subline: { default: 'עור זוהר, רגוע ונקי, בשעה אחת' },
  price: { default: '₪249', note: 'במקום ₪320' },
  cta: { default: 'לקביעת תור' },
  headlineWeight: 900,
};

export const beforeAfter: CreamDef = {
  slug: 'before-after', name: 'לפני / אחרי', category: 'before_after', group: 'evergreen',
  description: 'שתי תמונות של לקוחה זו לצד זו, כותרת ושורת הסבר. שתי התמונות דורשות אישור פרסום.',
  versions: { feed: 2, story: 1 },
  layout: { family: 'pair' },
  kicker: { default: 'תוצאה אמיתית' },
  headline: { default: 'אחרי טיפול אחד', maxLength: 40 },
  subline: { default: 'ללא פילטרים, באור טבעי' },
  cta: { default: 'גם את? לקביעת תור' },
};

export const review: CreamDef = {
  slug: 'review', name: 'לקוחה מספרת', category: 'review', group: 'evergreen',
  description: 'ציטוט של לקוחה מהביקורות השמורות, עם דירוג ושם, מעל תמונה מהקליניקה.',
  versions: { feed: 2, story: 1 },
  layout: { family: 'top' },
  photoSlot: { label: 'תמונה (לא חובה)', required: false, aiHint: 'a serene detail from a skincare clinic: folded towels, a ceramic bowl, soft daylight on linen, warm neutral palette' },
  quote: true,
  headline: { default: 'הגעתי עם עור עייף ויצאתי זוהרת. מקצועיות, סבלנות ויחס אישי.', maxLength: 200 },
  cta: { default: 'לקביעת תור' },
};

export const tip: CreamDef = {
  slug: 'tip', name: 'טיפ לעור', category: 'tip', group: 'evergreen',
  description: 'טיפ אחד קצר, כותרת שנשארת בראש, ועלה מצויר. לפוסט ידע.',
  versions: { feed: 2, story: 1 }, // tip-feed@1 is the hand-written first-stage template
  layout: { family: 'text', block: 'blush', photo: 'circle' },
  photoSlot: { aiHint: `a single skincare product bottle on a linen cloth beside a green leaf, ${CLINIC_LIGHT}, minimal` },
  kicker: { default: 'טיפ קטן' },
  headline: { default: 'קרם הגנה, גם בחורף', maxLength: 40 },
  subline: { default: 'הקרינה עוברת עננים. SPF 30 כל בוקר' },
  cta: { default: 'עוד טיפים בפרופיל' },
  deco: { asset: 'leaf' },
};

export const pkg: CreamDef = {
  slug: 'package', name: 'חבילת טיפולים', category: 'offer', group: 'evergreen',
  description: 'סדרת טיפולים במחיר אחד גדול. לחבילות ומנויים.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'split', side: 'bottom', block: 'primary' },
  photoSlot: { aiHint: `three small ceramic bowls in a row on a treatment table, ${CLINIC_LIGHT}, shallow depth of field` },
  kicker: { default: 'חבילה' },
  headline: { default: 'שלושה טיפולי פנים', maxLength: 40 },
  subline: { default: 'סדרה שמחזיקה את התוצאה' },
  price: { default: '₪690', note: 'במקום ₪840' },
  cta: { default: 'לקביעת תור' },
  headlineWeight: 900,
};

export const acne: CreamDef = {
  slug: 'acne', name: 'טיפול באקנה', category: 'treatment', group: 'evergreen',
  description: 'טיפול לעור עם אקנה: הרגעה, ניקוי ותוכנית ביתית.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'frame' },
  photoSlot: { aiHint: `a gentle cleansing foam and a soft cloth on a clinic counter, ${CLINIC_LIGHT}, no faces` },
  kicker: { default: 'עור עם אקנה' },
  headline: { default: 'טיפול שמרגיע, לא מייבש', maxLength: 44 },
  subline: { default: 'ניקוי עמוק, הרגעה ותוכנית ביתית' },
  cta: { default: 'לייעוץ ראשון' },
};

export const pigmentation: CreamDef = {
  slug: 'pigmentation', name: 'פיגמנטציה', category: 'treatment', group: 'evergreen',
  description: 'סדרת טיפולים לכתמי פיגמנטציה ולגוון אחיד.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'top', textPos: 'above' },
  photoSlot: { aiHint: `sunlight falling through sheer curtains onto a cream wall, ${CLINIC_LIGHT}, abstract and calm` },
  kicker: { default: 'כתמי פיגמנטציה' },
  headline: { default: 'גוון אחיד, בהדרגה', maxLength: 40 },
  subline: { default: 'סדרת טיפולים מותאמת לעור שלך' },
  cta: { default: 'לייעוץ ראשון' },
};

export const antiAging: CreamDef = {
  slug: 'anti-aging', name: "אנטי אייג'ינג", category: 'treatment', group: 'evergreen',
  description: 'מיצוק, הזנה ולחות לעור בוגר.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'magazine', band: 'blush', bandPos: 'low' },
  photoSlot: { aiHint: `a glass dropper bottle with golden serum on a marble surface, ${CLINIC_LIGHT}, elegant` },
  kicker: { default: "אנטי אייג'ינג" },
  headline: { default: 'עור מתוח, מראה נח', maxLength: 40 },
  subline: { default: 'מיצוק, הזנה ולחות עמוקה' },
  cta: { default: 'לקביעת תור' },
};

export const peel: CreamDef = {
  slug: 'peel', name: 'פילינג', category: 'treatment', group: 'evergreen',
  description: 'חידוש עדין לעור עייף.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'top', shape: 'arch' },
  photoSlot: { aiHint: `a small white bowl of fine cream-coloured powder and a soft brush, ${CLINIC_LIGHT}` },
  kicker: { default: 'פילינג' },
  headline: { default: 'שכבה אחת פחות, זוהר אחד יותר', maxLength: 44 },
  subline: { default: 'חידוש עדין לעור עייף' },
  cta: { default: 'לקביעת תור' },
};

export const laser: CreamDef = {
  slug: 'laser', name: 'לייזר', category: 'treatment', group: 'evergreen',
  description: 'הסרת שיער בלייזר: מהיר, מדויק, לזמן ארוך.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'split', side: 'right', block: 'blush' },
  photoSlot: { aiHint: `a clean modern treatment bed with a folded white towel, ${CLINIC_LIGHT}, minimal, no devices with text` },
  kicker: { default: 'לייזר' },
  headline: { default: 'הסרת שיער, בלי לחזור', maxLength: 40 },
  subline: { default: 'מכשור מתקדם, טיפול מהיר' },
  cta: { default: 'לקביעת תור' },
};

export const newDates: CreamDef = {
  slug: 'new-dates', name: 'נפתחו תאריכים', category: 'announce', group: 'evergreen',
  description: 'הודעה על תאריכים חדשים ביומן, עם השורה שאת בוחרת.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'text', block: 'primary', photo: 'none' },
  photoSlot: { aiHint: `an open paper planner and a pen beside a cup of tea on a wooden desk, ${CLINIC_LIGHT}, no legible writing` },
  kicker: { default: 'היומן נפתח' },
  headline: { default: 'נפתחו תאריכים חדשים', maxLength: 40 },
  subline: { default: 'ימי שלישי וחמישי, מהשבוע הבא', maxLength: 60 },
  cta: { default: 'לתפוס תור' },
  deco: { asset: 'sparkle' },
};

export const products: CreamDef = {
  slug: 'products', name: 'מוצרים', category: 'treatment', group: 'evergreen',
  description: 'תמונת מוצר שלך, המלצה קצרה, ומחיר אם תרצי.',
  versions: { feed: 1, story: 1 },
  needs: ['תמונת מוצר'],
  layout: { family: 'frame' },
  photoSlot: { label: 'תמונת מוצר', sources: ['upload', 'gallery', 'previous'] },
  kicker: { default: 'המדף שלי' },
  headline: { default: 'הסרום שאני ממליצה', maxLength: 40 },
  subline: { default: 'ויטמין C ליום, רטינול ללילה' },
  price: { default: '₪180', required: false },
  cta: { default: 'לרכישה בקליניקה' },
};

export const routine: CreamDef = {
  slug: 'routine', name: 'שגרת טיפוח', category: 'tip', group: 'evergreen',
  description: 'שגרה בשלוש שורות קצרות, תחת כותרת אחת.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'top' },
  photoSlot: { aiHint: `three skincare bottles of different heights lined up on a bathroom shelf, ${CLINIC_LIGHT}, no labels` },
  kicker: { default: 'שגרת טיפוח' },
  headline: { default: 'שלושה צעדים ביום', maxLength: 32 },
  bullets: ['בוקר: ניקוי, ויטמין C, הגנה', 'ערב: ניקוי כפול, סרום, לחות', 'פעם בשבוע: פילינג עדין'],
  cta: { default: 'שגרה מותאמת? לתור' },
  deco: { asset: 'leaf' },
};

export const selfCare: CreamDef = {
  slug: 'self-care', name: 'זמן לעצמך', category: 'tip', group: 'evergreen',
  description: 'תמונה על כל הרקע עם עלייה של קרם, ומילים על שעה שכולה שלה.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'overlay', headline: 'bottom' },
  photoSlot: { aiHint: 'a woman resting with eyes closed under a soft towel in a spa, seen from above, warm light, calm, the lower half of the frame quiet' },
  kicker: { default: 'זמן לעצמך' },
  headline: { default: 'שעה אחת שכולה שלך', maxLength: 40 },
  subline: { default: 'טיפול פנים, מוזיקה שקטה, ואף אחד לא מחכה' },
  cta: { default: 'לקביעת תור' },
};

export const newClient: CreamDef = {
  slug: 'new-client', name: 'מבצע ללקוחה חדשה', category: 'offer', group: 'evergreen',
  description: 'הצעת היכרות לביקור ראשון, עם מחיר גדול.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'split', side: 'right', block: 'primary' },
  photoSlot: { aiHint: `a welcoming clinic entrance with a small plant and a soft chair, ${CLINIC_LIGHT}` },
  kicker: { default: 'ללקוחה חדשה' },
  headline: { default: 'טיפול פנים ראשון', maxLength: 40 },
  subline: { default: 'היכרות עם העור שלך, בלי התחייבות' },
  price: { default: '₪199', note: 'לביקור הראשון בלבד' },
  cta: { default: 'לקביעת תור' },
  headlineWeight: 900,
};

export const slotOpened: CreamDef = {
  slug: 'slot-opened', name: 'התפנה תור', category: 'announce', group: 'evergreen',
  description: 'תור שהתפנה: יום ושעה בשורה אחת, וכפתור לתפוס אותו.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'overlay', headline: 'top' },
  photoSlot: { aiHint: `a simple wall clock beside a vase with a single stem, ${CLINIC_LIGHT}, minimal` },
  kicker: { default: 'התפנה תור' },
  headline: { default: 'מי תופסת?', maxLength: 32 },
  subline: { default: 'יום שלישי, 14:00', maxLength: 40 },
  cta: { default: 'לתפוס את התור' },
};

export const facial: CreamDef = {
  slug: 'facial', name: 'טיפול פנים', category: 'treatment', group: 'evergreen',
  description: 'הטיפול הקלאסי, בארבע מילים.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'collage', count: 3 },
  photoSlot: { aiHint: `a facial treatment in progress, hands applying a cream mask, ${CLINIC_LIGHT}, the client's face turned away` },
  kicker: { default: 'טיפול פנים' },
  headline: { default: 'הקלאסי שתמיד עובד', maxLength: 40 },
  subline: { default: 'ניקוי, אידוי, מסכה והזנה' },
  cta: { default: 'לקביעת תור' },
};

export const pampering: CreamDef = {
  slug: 'pampering', name: 'פינוק', category: 'treatment', group: 'evergreen',
  description: 'תמונה על כל הרקע, ומילים על פינוק.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'overlay', headline: 'bottom' },
  photoSlot: { aiHint: 'a warm towel, a lit candle and a small bowl of rose petals on a spa table, warm evening light, the lower half of the frame calm' },
  kicker: { default: 'פינוק' },
  headline: { default: 'טיפול פנים מפנק', maxLength: 40 },
  subline: { default: 'עיסוי, מסכה חמה, ושקט' },
  cta: { default: 'לקביעת תור' },
};

export const glow: CreamDef = {
  slug: 'glow', name: 'זוהר', category: 'treatment', group: 'evergreen',
  description: 'טיפול הזנה לפני אירוע, עם ניצוץ מצויר.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'top', shape: 'circle' },
  photoSlot: { aiHint: `golden hour light on a dewy skincare cream swatch on a cream surface, ${CLINIC_LIGHT}, luminous` },
  kicker: { default: 'זוהר' },
  headline: { default: 'עור שמאיר מבפנים', maxLength: 40 },
  subline: { default: 'טיפול הזנה לפני אירוע' },
  cta: { default: 'לקביעת תור' },
  deco: { asset: 'sparkle' },
};

export const proPeel: CreamDef = {
  slug: 'pro-peel', name: 'פילינג מקצועי', category: 'treatment', group: 'evergreen',
  description: 'פילינג כימי בהשגחה, עם מחיר אם תרצי.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'split', side: 'left', block: 'deep' },
  photoSlot: { aiHint: `a row of amber glass bottles on a clinic shelf, ${CLINIC_LIGHT}, professional, no labels` },
  kicker: { default: 'פילינג מקצועי' },
  headline: { default: 'פילינג כימי, בהשגחה', maxLength: 40 },
  subline: { default: 'לעור עם כתמים, צלקות וגוון לא אחיד' },
  price: { default: '₪350', required: false },
  cta: { default: 'לייעוץ ראשון' },
};

export const EVERGREEN: CreamDef[] = [
  offer, beforeAfter, review, tip, pkg, acne, pigmentation, antiAging, peel, laser,
  newDates, products, routine, selfCare, newClient, slotOpened, facial, pampering, glow, proPeel,
];
