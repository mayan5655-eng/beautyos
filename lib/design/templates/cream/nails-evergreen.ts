// lib/design/templates/cream/nails-evergreen.ts
//
// Twenty evergreen nails definitions — what she posts all year, comparable
// in scale to cosmetics' 20 (see ../evergreen.ts). Same builder, same DSL,
// deliberately different voice: this content IS the business for a nail
// tech, so the vocabulary is design, colour, shape and finish — never skin.
// See lib/ai/marketingAI.ts's creativeVoice() for the same rule applied to
// what the AI writes on her behalf.

import type { CreamDef } from '../cream.ts';

const STUDIO_LIGHT = 'soft natural light, warm neutral tones, a clean manicure table';
const NAILS: CreamDef['fields'] = ['nails'];

// ── The core format ──────────────────────────────────────────────────────
export const designShowcase: CreamDef = {
  slug: 'nail-design-showcase', name: 'עיצוב השבוע', category: 'treatment', group: 'evergreen', fields: NAILS,
  description: 'תמונת עיצוב גדולה, כותרת אלגנטית וכפתור. הפורמט המרכזי — כל סט ראוי לפוסט משלו.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'top' },
  photoSlot: { aiHint: `extreme macro of a delicate hand-painted nail-art design, a thin brush near the nail, ${STUDIO_LIGHT}, precise and artistic, no face` },
  kicker: { default: 'עיצוב השבוע' },
  headline: { default: 'כל ציפורן, יצירה בפני עצמה', maxLength: 40 },
  subline: { default: 'מגיעה עם רעיון, יוצאת עם עיצוב' },
  cta: { default: 'לקביעת תור' },
  headlineWeight: 900,
};

export const beforeAfter: CreamDef = {
  slug: 'nail-before-after', name: 'ציפורניים: לפני / אחרי', category: 'before_after', group: 'evergreen', fields: NAILS,
  description: 'שתי תמונות של לקוחה זו לצד זו, כותרת ושורת הסבר. שתי התמונות דורשות אישור פרסום.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'pair' },
  kicker: { default: 'ציפורניים לפני ואחרי' },
  headline: { default: 'ציפורניים חדשות לגמרי', maxLength: 40 },
  subline: { default: 'התוצאה מדברת בעד עצמה' },
  cta: { default: 'גם את? לקביעת תור' },
};

export const colourOfTheWeek: CreamDef = {
  slug: 'nail-colour-week', name: 'הגוון של השבוע', category: 'treatment', group: 'evergreen', fields: NAILS,
  description: 'גוון אחד, גדול ובולט, עם השם שלו. פורמט קבוע וקליל.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'split', side: 'right', block: 'primary' },
  photoSlot: { aiHint: `a close crop of a single glossy nail polish colour on a manicured hand, ${STUDIO_LIGHT}` },
  kicker: { default: 'הגוון של השבוע' },
  headline: { default: 'שם הגוון כאן', maxLength: 30 },
  subline: { default: 'מושלם לימים האלה' },
  cta: { default: 'רוצה אותו? לקביעת תור' },
};

export const newShadeArrived: CreamDef = {
  slug: 'nail-new-shade', name: 'גוון חדש הגיע', category: 'announce', group: 'evergreen', fields: NAILS,
  description: 'הכרזה על לק חדש שהגיע לסטודיו, תמונה מלאה וכותרת נרגשת.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'overlay', headline: 'bottom' },
  photoSlot: { aiHint: `a fresh, unopened nail polish bottle catching the light next to a manicured hand, ${STUDIO_LIGHT}` },
  kicker: { default: 'חדש בסטודיו' },
  headline: { default: 'הגוון הזה הגיע והוא מטורף', maxLength: 44 },
  cta: { default: 'לקביעת תור' },
};

export const bridalNails: CreamDef = {
  slug: 'nail-bridal', name: 'ציפורני כלה', category: 'treatment', group: 'evergreen', fields: NAILS,
  description: 'תמונה עדינה במסגרת, כותרת רומנטית. לפוסט ציפורני כלה.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'frame', shape: 'circle' },
  photoSlot: { aiHint: `an elegant bridal manicure, soft white and pearl tones, a delicate ring visible, ${STUDIO_LIGHT}, romantic` },
  kicker: { default: 'ציפורני כלה' },
  headline: { default: 'גם ביום הכי חשוב', maxLength: 36 },
  subline: { default: 'עיצוב שמחזיק עד הריקוד האחרון' },
  cta: { default: 'לתיאום ניסיון' },
};

export const eventNails: CreamDef = {
  slug: 'nail-event', name: 'ציפורניים לאירוע', category: 'treatment', group: 'evergreen', fields: NAILS,
  description: 'תמונה מלאה עם רצועת כותרת, לפוסט אירועים ונשפים.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'magazine', band: 'primary' },
  photoSlot: { aiHint: `a glamorous evening-event manicure with a hint of glitter, dramatic light, ${STUDIO_LIGHT}` },
  kicker: { default: 'יש אירוע?' },
  headline: { default: 'ציפורניים שמתאימות לרגע', maxLength: 36 },
  cta: { default: 'לקביעת תור' },
  headlineWeight: 900,
};

export const careTipGelLasts: CreamDef = {
  slug: 'nail-tip-gel-last', name: 'טיפ: איך הג׳ל מחזיק יותר', category: 'tip', group: 'evergreen', fields: NAILS,
  description: 'טיפ קצר עם שלוש שורות. לפוסט ידע שקל לצרוך.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'text', block: 'blush', photo: 'circle' },
  photoSlot: { aiHint: `a small dish of cuticle oil and a nail file on a linen cloth, ${STUDIO_LIGHT}, minimal` },
  kicker: { default: 'טיפ קטן' },
  headline: { default: 'איך גורמים לג׳ל להחזיק יותר?', maxLength: 40, lines: 1 },
  bullets: ['שמן קוטיקולה כל יום', 'כפפות בזמן ניקיון וכלים', 'לא לקלף — רק להסיר במקצועי'],
  cta: { default: 'עוד טיפים בפרופיל' },
  deco: { asset: 'sparkle' },
};

export const careTipDont: CreamDef = {
  slug: 'nail-tip-dont', name: 'טיפ: מה לא לעשות', category: 'tip', group: 'evergreen', fields: NAILS,
  description: 'טיפ שני, בגוון "מה לא לעשות" — מזווית שונה מהטיפ הראשון.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'text', block: 'primary', photo: 'none' },
  kicker: { default: 'לא ולא' },
  headline: { default: '3 דברים שהורסים מניקור ג׳ל', maxLength: 40, lines: 1 },
  bullets: ['לקלף לק שמתקלף', 'לפתוח קופסאות עם הציפורן', 'לדלג על שמן קוטיקולה'],
  cta: { default: 'לתחזוקה נכונה — לקביעת תור' },
};

export const priceOffer: CreamDef = {
  slug: 'nail-price-offer', name: 'מבצע מניקור ג׳ל', category: 'offer', group: 'evergreen', fields: NAILS,
  description: 'תמונה גדולה, כותרת אלגנטית, מחיר גדול לצידה, וכפתור. לפוסט מבצע.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'top' },
  photoSlot: { aiHint: `macro of a hand under a small UV/LED lamp curing a fresh coat of gel polish, ${STUDIO_LIGHT}, a soft glow from the lamp` },
  kicker: { default: 'מבצע לזמן מוגבל' },
  headline: { default: 'מניקור ג׳ל', maxLength: 40 },
  subline: { default: 'לק שמחזיק שבועות, בלי סדקים' },
  price: { default: '₪170', note: 'לזמן מוגבל' },
  cta: { default: 'לקביעת תור' },
  headlineWeight: 900,
};

export const clientReview: CreamDef = {
  slug: 'nail-review', name: 'לקוחה מספרת', category: 'review', group: 'evergreen', fields: NAILS,
  description: 'ציטוט של לקוחה מהביקורות השמורות, עם דירוג ושם, מעל תמונה מהסטודיו.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'top' },
  photoSlot: { label: 'תמונה (לא חובה)', required: false, aiHint: `still life: a few nail polish bottles in soft neutral tones on a pale linen surface, ${STUDIO_LIGHT}` },
  quote: true,
  headline: { default: 'הידיים הכי מטופחות יוצאות מכאן 💅', maxLength: 200 },
  cta: { default: 'לקביעת תור' },
};

export const newDates: CreamDef = {
  slug: 'nail-new-dates', name: 'נפתחו תורים חדשים', category: 'announce', group: 'evergreen', fields: NAILS,
  description: 'הודעה קצרה שנפתחו תאריכים, בלי תמונה, כדי להתפרסם מהר.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'text', block: 'primary', photo: 'none' },
  kicker: { default: 'עדכון יומן' },
  headline: { default: 'נפתחו תורים לשבוע הקרוב', maxLength: 40, lines: 1 },
  subline: { default: 'מוזמנת לקבוע לפני שנגמר' },
  cta: { default: 'לקביעת תור' },
};

export const refillReminder: CreamDef = {
  slug: 'nail-refill-reminder', name: 'תזכורת מילוי', category: 'announce', group: 'evergreen', fields: NAILS,
  description: 'תזכורת ציבורית עדינה שהגיע הזמן למילוי, לא הודעה אישית — פוסט כללי.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'top', textPos: 'above' },
  photoSlot: { aiHint: `a manicurist's hand gently filing a client's nails at a clean table, ${STUDIO_LIGHT}` },
  kicker: { default: 'תזכורת עדינה' },
  headline: { default: 'עברו 3 שבועות? זמן למילוי', maxLength: 40 },
  cta: { default: 'לקביעת תור' },
};

export const designMenuGrid: CreamDef = {
  slug: 'nail-design-menu', name: 'תפריט עיצובים', category: 'treatment', group: 'evergreen', fields: NAILS,
  description: 'שלוש תמונות עיצוב בגריד, "בחרי את שלך" — כמו תפריט.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'collage', count: 3 },
  photoSlot: { aiHint: `a flatlay of three different nail-art styles side by side for comparison, ${STUDIO_LIGHT}, organised and inviting` },
  kicker: { default: 'בחרי את שלך' },
  headline: { default: '3 עיצובים מהשבוע האחרון', maxLength: 40 },
  cta: { default: 'תגידי לי מה מדבר אלייך' },
};

export const processTimelapse: CreamDef = {
  slug: 'nail-process', name: 'תהליך העבודה', category: 'treatment', group: 'evergreen', fields: NAILS,
  description: 'שתי תמונות — התחלה וסיום — לפוסט "ככה זה נבנה".',
  versions: { feed: 1, story: 1 },
  layout: { family: 'collage', count: 2 },
  photoSlot: { aiHint: `two stages of a manicure being built, bare nail and finished design, ${STUDIO_LIGHT}` },
  kicker: { default: 'ככה זה נבנה' },
  headline: { default: 'מציפורן חשופה לעיצוב גמור', maxLength: 40 },
  cta: { default: 'לקביעת תור' },
};

export const frenchManicure: CreamDef = {
  slug: 'nail-french', name: 'מניקור צרפתי', category: 'treatment', group: 'evergreen', fields: NAILS,
  description: 'קלאסיקה שתמיד עובדת — תמונה נקייה ומינימלית.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'top', shape: 'arch' },
  photoSlot: { aiHint: `a classic clean French manicure, soft white tips on a natural nail bed, ${STUDIO_LIGHT}` },
  kicker: { default: 'קלאסיקה שלא מתחלפת' },
  headline: { default: 'הצרפתי המושלם', maxLength: 34 },
  subline: { default: 'נקי, מדויק, תמיד עובד' },
  cta: { default: 'לקביעת תור' },
};

export const chromeOmbre: CreamDef = {
  slug: 'nail-chrome-ombre', name: 'אפקט כרום / אומברה', category: 'treatment', group: 'evergreen', fields: NAILS,
  description: 'אפקט מיוחד ומטאלי — תמונה שממש נוצצת.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'frame' },
  photoSlot: { aiHint: `a chrome or ombre metallic nail effect catching studio light, mirror-like shine, ${STUDIO_LIGHT}` },
  kicker: { default: 'אפקט מיוחד' },
  headline: { default: 'כרום שמושך כל מבט', maxLength: 36 },
  cta: { default: 'לקביעת תור' },
  headlineWeight: 900,
};

export const gelExtensions: CreamDef = {
  slug: 'nail-gel-extensions', name: 'בניית ציפורניים בג׳ל', category: 'treatment', group: 'evergreen', fields: NAILS,
  description: 'תוספות ג׳ל לאורך ולחוזק — תמונה שמדגישה צורה.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'split', side: 'left', block: 'blush' },
  photoSlot: { aiHint: `elegant long gel nail extensions in a natural shape, hand resting on linen, ${STUDIO_LIGHT}` },
  kicker: { default: 'אורך וחוזק' },
  headline: { default: 'בניית ציפורניים שמתאימות לך', maxLength: 36 },
  subline: { default: 'צורה, אורך וגימור — הכול בהתאמה אישית' },
  cta: { default: 'לקביעת תור' },
};

export const nailArtMacro: CreamDef = {
  slug: 'nail-art-macro', name: 'קלוז-אפ לעיצוב', category: 'treatment', group: 'evergreen', fields: NAILS,
  description: 'תקריב אחד, בלי הרבה מילים — הפרט הקטן שעושה את הכול.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'overlay', headline: 'bottom' },
  photoSlot: { aiHint: `an extreme macro close-up of a single hand-painted nail-art detail, shallow depth of field, ${STUDIO_LIGHT}` },
  kicker: { default: 'קלוז-אפ' },
  headline: { default: 'הפרט הקטן שעושה את הכול', maxLength: 34, lines: 1 },
  cta: { default: 'לקביעת תור' },
};

export const newClientOffer: CreamDef = {
  slug: 'nail-new-client', name: 'לקוחה חדשה', category: 'offer', group: 'evergreen', fields: NAILS,
  description: 'הצעה ללקוחה שמגיעה בפעם הראשונה.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'split', side: 'bottom', block: 'primary' },
  photoSlot: { aiHint: `a warm, welcoming manicure-table setup, fresh tools laid out, ${STUDIO_LIGHT}` },
  kicker: { default: 'לקוחה חדשה?' },
  headline: { default: 'ברוכה הבאה, זה עלינו קצת', maxLength: 40 },
  subline: { default: 'הנחה לביקור הראשון' },
  price: { default: '15%', note: 'הנחה ראשונה' },
  cta: { default: 'לקביעת תור' },
  headlineWeight: 900,
};

export const packageDeal: CreamDef = {
  slug: 'nail-package', name: 'מנוי חודשי', category: 'offer', group: 'evergreen', fields: NAILS,
  description: 'כמה מפגשים במחיר אחד — למנויות קבועות.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'split', side: 'right', block: 'primary' },
  photoSlot: { aiHint: `a calendar-like arrangement of manicure moments, calm and organised, ${STUDIO_LIGHT}` },
  kicker: { default: 'מנוי' },
  headline: { default: 'שלושה מילויים, מחיר אחד', maxLength: 40 },
  price: { default: '₪450', note: 'במקום ₪540' },
  cta: { default: 'לקביעת תור' },
  headlineWeight: 900,
};

export const NAILS_EVERGREEN: CreamDef[] = [
  designShowcase, beforeAfter, colourOfTheWeek, newShadeArrived, bridalNails, eventNails,
  careTipGelLasts, careTipDont, priceOffer, clientReview, newDates, refillReminder,
  designMenuGrid, processTimelapse, frenchManicure, chromeOmbre, gelExtensions,
  nailArtMacro, newClientOffer, packageDeal,
];
