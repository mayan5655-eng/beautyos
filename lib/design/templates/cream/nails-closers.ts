// lib/design/templates/cream/nails-closers.ts
//
// Fifteen nails closer definitions — what closes a sale, comparable in
// scale to cosmetics' 15 (see ../closers.ts). Same builder, nails voice.

import type { CreamDef } from '../cream.ts';

const STUDIO_LIGHT = 'soft natural light, warm neutral tones, a clean manicure table';
const NAILS: CreamDef['fields'] = ['nails'];

export const giftCard: CreamDef = {
  slug: 'nail-gift-card', name: 'שובר מתנה', category: 'offer', group: 'closer', fields: NAILS,
  description: 'שובר מתנה לחברה — תמונה נקייה, מחיר גדול.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'frame' },
  photoSlot: { aiHint: `an elegant gift card concept next to a beautifully manicured hand, ${STUDIO_LIGHT}` },
  kicker: { default: 'מתנה מושלמת' },
  headline: { default: 'שובר מתנה לחברה הכי טובה', maxLength: 40 },
  price: { default: '₪200', required: false },
  cta: { default: 'לרכישת שובר' },
};

export const referral: CreamDef = {
  slug: 'nail-referral', name: 'הביאי חברה', category: 'offer', group: 'closer', fields: NAILS,
  description: 'תוכנית הפניות — את והחברה שלך מקבלות הטבה.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'split', side: 'bottom', block: 'primary' },
  photoSlot: { aiHint: `two hands with matching fresh manicures side by side, friendship, ${STUDIO_LIGHT}` },
  kicker: { default: 'הביאי חברה' },
  headline: { default: 'שתיכן מקבלות הנחה', maxLength: 40 },
  price: { default: '20%', note: 'לשתיכן' },
  cta: { default: 'לקביעת תור' },
  headlineWeight: 900,
};

export const bridalPackage: CreamDef = {
  slug: 'nail-bridal-package', name: 'חבילת כלה', category: 'offer', group: 'closer', fields: NAILS,
  description: 'חבילת ניסיון + יום החתונה, מחיר אחד. סוגר עסקה לכלות.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'split', side: 'right', block: 'blush' },
  photoSlot: { aiHint: `an elegant bridal manicure with soft pearl tones, ${STUDIO_LIGHT}, romantic` },
  kicker: { default: 'חבילת כלה' },
  headline: { default: 'ניסיון + יום החתונה, ביחד', maxLength: 40 },
  price: { default: '₪380', note: 'חבילה מלאה' },
  cta: { default: 'לתיאום חבילה' },
};

export const motherDaughterDuo: CreamDef = {
  slug: 'nail-mother-daughter', name: 'דואט אמא-בת', category: 'offer', group: 'closer', fields: NAILS,
  description: 'שתי לקוחות, תור אחד, מחיר משתלם.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'collage', count: 2 },
  photoSlot: { aiHint: `two manicures, one adult and one younger, matching soft colours, ${STUDIO_LIGHT}` },
  kicker: { default: 'דואט' },
  headline: { default: 'תור לשתיים, ביחד ובנוח', maxLength: 40 },
  price: { default: '₪280', note: 'לשתיים' },
  cta: { default: 'לקביעת תור' },
};

export const faq: CreamDef = {
  slug: 'nail-faq', name: 'שאלות נפוצות', category: 'tip', group: 'closer', fields: NAILS,
  description: 'שאלה ותשובה קצרה שחוזרת הרבה. מסיר חסמים לפני קביעת תור.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'text', block: 'blush', photo: 'none' },
  kicker: { default: 'שואלות אותי הרבה' },
  headline: { default: 'כמה זמן מחזיק מניקור ג׳ל?', maxLength: 40, lines: 1 },
  bullets: ['בממוצע 3-4 שבועות', 'תלוי בטיפוח בבית', 'מילוי לפני שמתחיל להתרווח'],
  cta: { default: 'עוד שאלות? לקביעת תור' },
};

export const myths: CreamDef = {
  slug: 'nail-myths', name: 'מיתוסים על ג׳ל', category: 'tip', group: 'closer', fields: NAILS,
  description: 'מפריכה מיתוס נפוץ על ג׳ל וציפורניים.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'text', block: 'primary', photo: 'none' },
  kicker: { default: 'מיתוס או עובדה?' },
  headline: { default: 'ג׳ל לא הורס את הציפורן', maxLength: 40, lines: 1 },
  bullets: ['ההסרה הלא נכונה כן מזיקה', 'הסרה מקצועית שומרת על הציפורן', 'תחזוקה נכונה = ציפורניים בריאות'],
  cta: { default: 'לתחזוקה נכונה — לקביעת תור' },
};

export const thankYou: CreamDef = {
  slug: 'nail-thank-you', name: 'תודה ללקוחות', category: 'review', group: 'closer', fields: NAILS,
  description: 'הודעת תודה חמה, בלי מכירה — בונה קשר.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'text', block: 'blush', photo: 'none' },
  kicker: { default: 'ממני אלייך' },
  headline: { default: 'תודה שאת חלק מהסטודיו הזה', maxLength: 40 },
  subline: { default: 'על כל ביקור, כל שיחה, כל עיצוב שבחרת' },
  cta: { default: 'נתראה בביקור הבא' },
  deco: { asset: 'sparkle' },
};

export const beforeYouGo: CreamDef = {
  slug: 'nail-before-you-go', name: 'לפני שנגמר', category: 'offer', group: 'closer', fields: NAILS,
  description: 'תזכורת דחיפות עדינה — נשארו מקומות אחרונים לשבוע.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'top' },
  photoSlot: { aiHint: `a nearly-full appointment book concept beside manicured hands, ${STUDIO_LIGHT}` },
  kicker: { default: 'לפני שנגמר' },
  headline: { default: 'נשארו מקומות אחרונים השבוע', maxLength: 40 },
  cta: { default: 'לקביעת תור' },
};

export const loyaltyCard: CreamDef = {
  slug: 'nail-loyalty', name: 'כרטיסיית נאמנות', category: 'offer', group: 'closer', fields: NAILS,
  description: 'תוכנית נאמנות — הביקור החמישי מתנה.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'split', side: 'bottom', block: 'sand' },
  photoSlot: { aiHint: `a neat row of manicure sessions represented visually, a rewarding feeling, ${STUDIO_LIGHT}` },
  kicker: { default: 'כרטיסיית נאמנות' },
  headline: { default: 'הביקור החמישי — עלינו', maxLength: 40 },
  cta: { default: 'להצטרפות' },
  headlineWeight: 900,
};

export const birthdayTreat: CreamDef = {
  slug: 'nail-birthday', name: 'מתנת יום הולדת', category: 'offer', group: 'closer', fields: NAILS,
  description: 'הטבה אוטומטית ליום ההולדת של הלקוחה.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'text', block: 'primary', photo: 'circle' },
  photoSlot: { aiHint: `a celebratory, festive manicure moment, ${STUDIO_LIGHT}` },
  kicker: { default: 'יום הולדת שמח' },
  headline: { default: 'מתנה קטנה ליום הגדול שלך', maxLength: 40 },
  price: { default: '15%', note: 'בחודש יום ההולדת' },
  cta: { default: 'לקביעת תור' },
};

export const flashSale: CreamDef = {
  slug: 'nail-flash-sale', name: 'מבצע היום בלבד', category: 'offer', group: 'closer', fields: NAILS,
  description: 'מבצע דחוף, ליום אחד — לפוסט ספונטני.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'text', block: 'primary', photo: 'none' },
  kicker: { default: 'היום בלבד' },
  headline: { default: 'מבצע של יום אחד', maxLength: 36, lines: 1 },
  price: { default: '₪150', note: 'היום בלבד' },
  cta: { default: 'לקביעת תור עכשיו' },
  headlineWeight: 900,
};

export const lastMinuteSlot: CreamDef = {
  slug: 'nail-last-minute', name: 'התפנה תור', category: 'announce', group: 'closer', fields: NAILS,
  description: 'תור שהתפנה פתאום — מי רוצה אותו?',
  versions: { feed: 1, story: 1 },
  layout: { family: 'text', block: 'blush', photo: 'none' },
  kicker: { default: 'התפנה תור' },
  headline: { default: 'מי רוצה את התור הזה?', maxLength: 36, lines: 1 },
  cta: { default: 'לתפוס את התור' },
};

export const testimonialStory: CreamDef = {
  slug: 'nail-testimonial-story', name: 'סיפור לקוחה', category: 'review', group: 'closer', fields: NAILS,
  description: 'ביקורת עם דגש מכירתי יותר — לסגירת החלטה.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'frame', shape: 'circle' },
  photoSlot: { label: 'תמונה (לא חובה)', required: false, aiHint: `an elegant close-up of finished nail art, ${STUDIO_LIGHT}` },
  quote: true,
  headline: { default: 'סוף סוף ציפורניים שמדברות בשמי', maxLength: 200 },
  cta: { default: 'גם את? לקביעת תור' },
};

export const newHoursAnnounce: CreamDef = {
  slug: 'nail-new-hours', name: 'שעות פתיחה חדשות', category: 'announce', group: 'closer', fields: NAILS,
  description: 'עדכון שעות/מיקום — הודעה עסקית פשוטה.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'text', block: 'sand', photo: 'none' },
  kicker: { default: 'עדכון' },
  headline: { default: 'שעות חדשות בסטודיו', maxLength: 36, lines: 1 },
  subline: { default: 'פרטים מלאים בפרופיל' },
  cta: { default: 'לקביעת תור' },
};

export const seasonalClearance: CreamDef = {
  slug: 'nail-clearance', name: 'פרידה מגוונים', category: 'offer', group: 'closer', fields: NAILS,
  description: 'גוונים שיוצאים מהקולקציה — הזדמנות אחרונה.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'collage', count: 3 },
  photoSlot: { aiHint: `three seasonal nail polish shades about to be retired, nostalgic warm styling, ${STUDIO_LIGHT}` },
  kicker: { default: 'הזדמנות אחרונה' },
  headline: { default: 'נפרדים מהגוונים האלה', maxLength: 40 },
  cta: { default: 'לתפוס אחד אחרון' },
};

export const NAILS_CLOSERS: CreamDef[] = [
  giftCard, referral, bridalPackage, motherDaughterDuo, faq, myths, thankYou,
  beforeYouGo, loyaltyCard, birthdayTreat, flashSale, lastMinuteSlot,
  testimonialStory, newHoursAnnounce, seasonalClearance,
];
