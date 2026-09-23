// lib/design/templates/cream/closers.ts
//
// The closers: the fifteen templates that turn interest into a booking, a
// purchase or a referral. Same studio look; a large price where there is
// one, a decoration only where the theme asks.

import type { CreamDef } from '../cream.ts';

const CLINIC_LIGHT = 'soft window light, warm neutral tones, a calm treatment room';
const PRODUCT_SLOT: CreamDef['photoSlot'] = { label: 'תמונת מוצר', sources: ['upload', 'gallery', 'previous'] };

export const duo: CreamDef = {
  slug: 'duo', name: 'מבצע לשתיים', category: 'offer', group: 'closer',
  description: 'באה עם חברה: מחיר אחד גדול לשתיים.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'collage', count: 2 },
  photoSlot: { aiHint: `two cups of herbal tea side by side on a spa table, ${CLINIC_LIGHT}, friendly` },
  kicker: { default: 'מבצע לשתיים' },
  headline: { default: 'באה עם חברה, שתיכן מרוויחות', maxLength: 44 },
  subline: { default: 'טיפול פנים לשתיים, באותו הבוקר' },
  price: { default: '₪399', note: 'לשתיים, במקום ₪498' },
  cta: { default: 'לתור לשתיים' },
  headlineWeight: 900,
};

export const bridal: CreamDef = {
  slug: 'bridal', name: 'כלות', category: 'treatment', group: 'closer',
  description: 'סדרת הכנה לחתונה, על תמונה מלאה עם עלייה של קרם וסרט מצויר.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'overlay', headline: 'bottom' },
  photoSlot: { sources: ['ai', 'gallery', 'upload', 'previous'], aiHint: 'a white silk dress hem, a bouquet of cream roses and soft window light, the lower half of the frame calm, no faces' },
  kicker: { default: 'כלות' },
  headline: { default: 'עור מושלם ליום המושלם', maxLength: 40 },
  subline: { default: 'סדרת הכנה לחתונה, משלושה חודשים לפני' },
  cta: { default: 'לפגישת ייעוץ' },
  deco: { asset: 'ribbon' },
};

export const night: CreamDef = {
  slug: 'night', name: 'טיפול לילה', category: 'treatment', group: 'closer',
  description: 'העור עובד בזמן שאת ישנה: סרום לילה ומסכה, על תמונת ערב.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'overlay', headline: 'top' },
  photoSlot: { aiHint: 'a bedside table with a small lamp, a jar of night cream and folded linen, warm dim evening light, the lower half calm' },
  kicker: { default: 'טיפול לילה' },
  headline: { default: 'העור עובד בזמן שאת ישנה', maxLength: 44 },
  subline: { default: 'סרום לילה ומסכה מזינה' },
  cta: { default: 'לקביעת תור' },
};

export const giftCard: CreamDef = {
  slug: 'gift-card', name: 'שובר מתנה', category: 'offer', group: 'closer',
  description: 'תמונה על כל הרקע עם עלייה של קרם מלמטה, סכום גדול, סרט מצויר. למי שרוצה לפנק מישהי.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'overlay', headline: 'bottom' },
  photoSlot: { aiHint: 'a gift-wrapped box in cream paper with a thin satin ribbon on a linen surface, soft daylight, warm neutral palette, the box in the upper half, the lower half calm and empty' },
  kicker: { default: 'מתנה שמרגישים' },
  headline: { default: 'שובר מתנה לטיפול פנים', maxLength: 40 },
  subline: { default: 'בכל סכום, נשלח באותו היום' },
  price: { default: '₪300', label: 'סכום', note: 'או כל סכום שתבחרי' },
  cta: { default: 'לרכישת שובר' },
  deco: { asset: 'ribbon' },
};

export const massage: CreamDef = {
  slug: 'massage', name: 'עיסוי פנים', category: 'treatment', group: 'closer',
  description: 'עיסוי פנים: ניקוז, מיצוק ורוגע.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'top', shape: 'circle' },
  photoSlot: { aiHint: `a rose quartz face roller and a small bottle of facial oil on linen, ${CLINIC_LIGHT}` },
  kicker: { default: 'עיסוי פנים' },
  headline: { default: 'עיסוי שמרים את הפנים', maxLength: 40 },
  subline: { default: 'ניקוז לימפתי, מיצוק ורוגע' },
  cta: { default: 'לקביעת תור' },
};

export const dermapen: CreamDef = {
  slug: 'dermapen', name: 'דרמפן', category: 'treatment', group: 'closer',
  description: 'מיקרו-ניידלינג לצלקות ולקמטוטים.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'frame' },
  photoSlot: { aiHint: `a clean clinical tray with folded gauze and a glass vial, ${CLINIC_LIGHT}, precise and calm, no devices with text` },
  kicker: { default: 'דרמפן' },
  headline: { default: 'חידוש עור, מבפנים', maxLength: 40 },
  subline: { default: 'מיקרו-ניידלינג לצלקות ולקמטוטים' },
  cta: { default: 'לייעוץ ראשון' },
};

export const serums: CreamDef = {
  slug: 'serums', name: 'סרומים', category: 'treatment', group: 'closer',
  description: 'תמונת המוצר שלך והמלצה על הסרום הנכון.',
  versions: { feed: 1, story: 1 },
  needs: ['תמונת מוצר'],
  layout: { family: 'split', side: 'right', block: 'blush' },
  photoSlot: PRODUCT_SLOT,
  kicker: { default: 'סרומים' },
  headline: { default: 'הסרום הנכון לעור שלך', maxLength: 40 },
  subline: { default: 'שאלי אותי בטיפול הבא' },
  price: { default: '₪220', required: false },
  cta: { default: 'לרכישה בקליניקה' },
};

export const faq: CreamDef = {
  slug: 'faq', name: 'שאלה ותשובה', category: 'tip', group: 'closer',
  description: 'שאלה ששואלות אותך בשורה אחת, ותשובה בשתיים.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'text', block: 'surface', photo: 'none' },
  photoSlot: { aiHint: `a notebook, a pen and a cup of coffee on a clinic desk, ${CLINIC_LIGHT}, no legible writing` },
  kicker: { default: 'שאלה ששואלות אותי' },
  headline: { default: 'כמה זמן מחזיק פילינג?', maxLength: 40, lines: 1 },
  subline: { default: 'התוצאה נראית אחרי שבוע ומחזיקה חודש-חודשיים, תלוי בשגרה הביתית.', maxLength: 120, lines: 2 },
  cta: { default: 'עוד שאלות? כתבי לי' },
};

export const info: CreamDef = {
  slug: 'info', name: 'כדאי לדעת', category: 'tip', group: 'closer',
  description: 'שלוש עובדות קצרות תחת כותרת אחת.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'top' },
  photoSlot: { aiHint: `a glass of water with a lemon slice beside a white towel, ${CLINIC_LIGHT}, fresh` },
  kicker: { default: 'כדאי לדעת' },
  headline: { default: 'שלושה דברים קטנים', maxLength: 32 },
  bullets: ['לשתות מים, גם כשלא צמאות', 'לישון על הגב, לפחות לפעמים', 'הגנה מהשמש כל יום, גם בבית'],
  cta: { default: 'עוד בפרופיל' },
};

export const myths: CreamDef = {
  slug: 'myths', name: 'מיתוס או אמת', category: 'tip', group: 'closer',
  description: 'מיתוס בשורה אחת, האמת בשתיים.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'split', side: 'bottom', block: 'blush' },
  photoSlot: { aiHint: `two small bottles of facial oil on a marble tray, ${CLINIC_LIGHT}, minimal` },
  kicker: { default: 'מיתוס או אמת' },
  headline: { default: 'שמן על עור שמן? אסור', maxLength: 40, lines: 1 },
  subline: { default: 'מיתוס. שמן נכון מאזן את ייצור החלב ומרגיע את העור.', maxLength: 120, lines: 2 },
  cta: { default: 'עוד מיתוסים בפרופיל' },
};

export const naturalLook: CreamDef = {
  slug: 'natural-look', name: 'מראה טבעי', category: 'treatment', group: 'closer',
  description: 'טיפולים עדינים שלא משנים את הפנים, עם עלה מצויר.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'top', shape: 'arch' },
  photoSlot: { aiHint: `a sprig of eucalyptus on a cream linen cloth, ${CLINIC_LIGHT}, natural and quiet` },
  kicker: { default: 'מראה טבעי' },
  headline: { default: 'את, רק רעננה יותר', maxLength: 40 },
  subline: { default: 'טיפולים עדינים בלי לשנות את הפנים' },
  cta: { default: 'לקביעת תור' },
  deco: { asset: 'leaf' },
};

export const skinHealth: CreamDef = {
  slug: 'skin-health', name: 'בריאות העור', category: 'tip', group: 'closer',
  description: 'העור הוא איבר: בדיקת עור ותוכנית טיפול אישית.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'magazine', band: 'primary', bandPos: 'low' },
  photoSlot: { aiHint: `a magnifying skin lamp folded beside a white towel on a treatment table, ${CLINIC_LIGHT}, clinical and calm` },
  kicker: { default: 'בריאות העור' },
  headline: { default: 'העור הוא איבר. מטפלים בו', maxLength: 40 },
  subline: { default: 'בדיקת עור ותוכנית טיפול אישית' },
  cta: { default: 'לבדיקת עור' },
};

export const thankYou: CreamDef = {
  slug: 'thank-you', name: 'תודה', category: 'announce', group: 'closer',
  description: 'תודה ללקוחות, עם ניצוץ מצויר.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'frame' },
  photoSlot: { aiHint: `a bunch of dried flowers tied with twine on a cream surface, ${CLINIC_LIGHT}, warm` },
  kicker: { default: 'תודה' },
  headline: { default: 'תודה שבחרת בי', maxLength: 40 },
  subline: { default: 'על כל ביקור, כל המלצה, כל חיוך' },
  cta: { default: 'נתראה בטיפול הבא' },
  deco: { asset: 'sparkle' },
};

export const referral: CreamDef = {
  slug: 'referral', name: 'חברה מביאה חברה', category: 'offer', group: 'closer',
  description: 'המלצת, קיבלת: הנחה לשתיכן על הטיפול הבא.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'text', block: 'primary', photo: 'circle' },
  photoSlot: { aiHint: `two linked hands resting on a linen tablecloth beside two cups, ${CLINIC_LIGHT}, warm, no faces` },
  kicker: { default: 'חברה מביאה חברה' },
  headline: { default: 'המלצת? קיבלת', maxLength: 40 },
  subline: { default: 'הנחה לשתיכן על הטיפול הבא' },
  price: { default: '20%', label: 'הנחה', required: false },
  cta: { default: 'לספר לחברה' },
};

export const glowStory: CreamDef = {
  slug: 'glow-story', name: 'זוהר (סטורי)', category: 'treatment', group: 'closer',
  formats: ['story'],
  description: 'סטורי בלבד: תמונה מלאה של הזוהר של אחרי טיפול, עם ניצוץ מצויר.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'overlay', headline: 'bottom' },
  photoSlot: { sources: ['gallery', 'upload', 'ai', 'previous'], aiHint: 'close-up of dewy, glowing skin texture on a cheek in golden light, no full face, the lower half of the frame calm' },
  kicker: { default: 'זוהר' },
  headline: { default: 'הזוהר של אחרי טיפול', maxLength: 40 },
  subline: { default: 'הסטורי הזה בלי פילטר' },
  cta: { default: 'לקביעת תור' },
  deco: { asset: 'sparkle' },
};

export const CLOSERS: CreamDef[] = [
  duo, bridal, night, giftCard, massage, dermapen, serums, faq, info, myths, naturalLook, skinHealth, thankYou, referral, glowStory,
];
