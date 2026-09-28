// lib/design/templates/cream/nails-seasonal.ts
//
// Fifteen nails seasonal definitions, one per lib/design/holidays.ts's
// HOLIDAYS key — every Israeli holiday plus the four Gregorian seasons,
// summer and winter given their own explicit palette framing per the brief.
// Where cosmetics' seasonal pack uses 14 of 15 keys plus a birthday def,
// this one is a clean 1:1: a nails business's content calendar is exactly
// "what colour, what design, for this moment" — there is no birthday
// equivalent worth a dedicated slot here.

import type { CreamDef } from '../cream.ts';

const STUDIO_LIGHT = 'soft natural light, warm neutral tones, a clean manicure table';
const NAILS: CreamDef['fields'] = ['nails'];

export const roshHashana: CreamDef = {
  slug: 'nail-rosh-hashana', name: 'ראש השנה', category: 'seasonal', group: 'seasonal', holiday: 'rosh_hashana', fields: NAILS,
  description: 'עיצוב זהוב וחגיגי בהשראת דבש ורימון, לפני ראש השנה.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'top' },
  photoSlot: { aiHint: `gold-toned nail art inspired by honey and pomegranate seeds, warm festive light, ${STUDIO_LIGHT}` },
  kicker: { default: 'שנה טובה ומתוקה' },
  headline: { default: 'עיצוב זהוב לשנה חדשה', maxLength: 40 },
  subline: { default: 'תורים לפני החג, במקומות אחרונים' },
  cta: { default: 'לתור לפני החג' },
  deco: { asset: 'pomegranate' },
};

export const yomKippur: CreamDef = {
  slug: 'nail-yom-kippur', name: 'יום כיפור', category: 'seasonal', group: 'seasonal', holiday: 'yom_kippur', fields: NAILS,
  description: 'עיצוב שקט ונקי, לפני הצום — טון מכבד, לא מוכר.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'text', block: 'blush', photo: 'circle' },
  photoSlot: { aiHint: `a soft, understated neutral manicure, quiet and clean, ${STUDIO_LIGHT}` },
  kicker: { default: 'לפני הצום' },
  headline: { default: 'רגע שקט לעצמך, לפני החג', maxLength: 40 },
  cta: { default: 'לתור אחרי הצום' },
};

export const sukkot: CreamDef = {
  slug: 'nail-sukkot', name: 'סוכות', category: 'seasonal', group: 'seasonal', holiday: 'sukkot', fields: NAILS,
  description: 'עיצוב עלים וירוק טבעי, בהשראת הסוכה.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'top' },
  photoSlot: { aiHint: `botanical green leaf-inspired nail art, natural earthy tones, ${STUDIO_LIGHT}` },
  kicker: { default: 'חג שמח' },
  headline: { default: 'עיצוב ירוק לחג האסיף', maxLength: 40 },
  cta: { default: 'לקביעת תור' },
  deco: { asset: 'leaf' },
};

export const hanukkah: CreamDef = {
  slug: 'nail-hanukkah', name: 'חנוכה', category: 'seasonal', group: 'seasonal', holiday: 'hanukkah', fields: NAILS,
  description: 'נצנוץ זהב וכחול בהשראת אור הנרות.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'overlay', headline: 'bottom' },
  photoSlot: { aiHint: `gold and blue sparkle nail art catching candlelight, warm glow, ${STUDIO_LIGHT}` },
  kicker: { default: 'חג אורים' },
  headline: { default: 'נצנוץ של זהב לחג האור', maxLength: 40 },
  cta: { default: 'לקביעת תור' },
};

export const tuBishvat: CreamDef = {
  slug: 'nail-tu-bishvat', name: 'ט"ו בשבט', category: 'seasonal', group: 'seasonal', holiday: 'tu_bishvat', fields: NAILS,
  description: 'עיצוב פרחוני-בוטני עדין, בהשראת אביב מוקדם.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'top' },
  photoSlot: { aiHint: `delicate botanical floral nail art, soft greens and blossoms, ${STUDIO_LIGHT}` },
  kicker: { default: 'ט"ו בשבט' },
  headline: { default: 'עיצוב פורח לחג האילנות', maxLength: 40 },
  cta: { default: 'לקביעת תור' },
  deco: { asset: 'leaf' },
};

export const familyDay: CreamDef = {
  slug: 'nail-family-day', name: 'יום המשפחה', category: 'seasonal', group: 'seasonal', holiday: 'family_day', fields: NAILS,
  description: 'הצעת אמא-בת, גוונים רכים ומתאימים.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'split', side: 'bottom', block: 'blush' },
  photoSlot: { aiHint: `two hands, an adult's and a child's, both with soft pastel manicures side by side, ${STUDIO_LIGHT}` },
  kicker: { default: 'יום המשפחה' },
  headline: { default: 'מניקור זוגי, אמא ובת', maxLength: 40 },
  cta: { default: 'לקביעת תור לשתיים' },
};

export const purim: CreamDef = {
  slug: 'nail-purim', name: 'פורים', category: 'seasonal', group: 'seasonal', holiday: 'purim', fields: NAILS,
  description: 'עיצוב צבעוני וקצת מטורלל, בהשראת התחפושות.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'text', block: 'primary', photo: 'circle' },
  photoSlot: { aiHint: `bold, colourful, playful nail art in multiple bright shades, festive mood, ${STUDIO_LIGHT}` },
  kicker: { default: 'חג שמח' },
  headline: { default: 'עיצוב שלא מתבייש בצבע', maxLength: 40 },
  cta: { default: 'לקביעת תור' },
};

export const pesach: CreamDef = {
  slug: 'nail-pesach', name: 'פסח', category: 'seasonal', group: 'seasonal', holiday: 'pesach', fields: NAILS,
  description: 'עיצוב לבן ורענן, בהשראת ניקיון האביב.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'top', shape: 'arch' },
  photoSlot: { aiHint: `a crisp, clean white and fresh spring-toned manicure, ${STUDIO_LIGHT}` },
  kicker: { default: 'חג שמח' },
  headline: { default: 'נקי, רענן, בול לאביב', maxLength: 40 },
  cta: { default: 'לקביעת תור לפני החג' },
};

export const yomHaatzmaut: CreamDef = {
  slug: 'nail-independence', name: 'יום העצמאות', category: 'seasonal', group: 'seasonal', holiday: 'yom_haatzmaut', fields: NAILS,
  description: 'עיצוב כחול-לבן, בהשראת הדגל.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'overlay', headline: 'bottom' },
  photoSlot: { aiHint: `blue and white flag-inspired nail art, celebratory, ${STUDIO_LIGHT}` },
  kicker: { default: 'יום עצמאות שמח' },
  headline: { default: 'כחול לבן, גאה וזוהר', maxLength: 40 },
  cta: { default: 'לקביעת תור' },
};

export const shavuot: CreamDef = {
  slug: 'nail-shavuot', name: 'שבועות', category: 'seasonal', group: 'seasonal', holiday: 'shavuot', fields: NAILS,
  description: 'עיצוב פרחוני ולבן-קרמי, בהשראת החג.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'top' },
  photoSlot: { aiHint: `soft white and cream floral nail art, fresh dairy-toned palette, ${STUDIO_LIGHT}` },
  kicker: { default: 'חג שמח' },
  headline: { default: 'עיצוב פרחוני לחג הביכורים', maxLength: 40 },
  cta: { default: 'לקביעת תור' },
};

export const womensDay: CreamDef = {
  slug: 'nail-womens-day', name: 'יום האישה', category: 'seasonal', group: 'seasonal', holiday: 'womens_day', fields: NAILS,
  description: 'גוון סטייטמנט אחד, נועז ומעצים.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'text', block: 'primary', photo: 'none' },
  kicker: { default: 'יום האישה' },
  headline: { default: 'הגוון שמדבר בשמך', maxLength: 40, lines: 1 },
  cta: { default: 'לקביעת תור' },
  headlineWeight: 900,
};

export const springPalette: CreamDef = {
  slug: 'nail-spring-palette', name: 'פלטת אביב', category: 'seasonal', group: 'seasonal', holiday: 'spring', fields: NAILS,
  description: 'קולקציית פסטלים לאביב — עדין ופרחוני.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'collage', count: 3 },
  photoSlot: { aiHint: `three pastel spring nail colours side by side, soft florals nearby, ${STUDIO_LIGHT}` },
  kicker: { default: 'קולקציית אביב' },
  headline: { default: 'פסטלים שמריחים אביב', maxLength: 40 },
  cta: { default: 'לקביעת תור' },
};

export const summerPalette: CreamDef = {
  slug: 'nail-summer-palette', name: 'פלטת קיץ', category: 'seasonal', group: 'seasonal', holiday: 'summer', fields: NAILS,
  description: 'קולקציית קיץ — גוונים בהירים ונועזים, בהשראת חוף וחופשה.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'collage', count: 3 },
  photoSlot: { aiHint: `three bright, bold vacation-inspired summer nail colours, sun-lit and vivid, ${STUDIO_LIGHT}` },
  kicker: { default: 'קולקציית קיץ' },
  headline: { default: 'הגוונים של הקיץ הזה', maxLength: 40 },
  subline: { default: 'בהיר, נועז, בול לחוף' },
  cta: { default: 'לקביעת תור' },
};

export const autumnPalette: CreamDef = {
  slug: 'nail-autumn-palette', name: 'פלטת סתיו', category: 'seasonal', group: 'seasonal', holiday: 'autumn', fields: NAILS,
  description: 'קולקציית סתיו — טרקוטה, חום חם ובורדו.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'split', side: 'right', block: 'sand' },
  photoSlot: { aiHint: `a warm terracotta and burgundy autumn-toned manicure, falling leaves nearby, ${STUDIO_LIGHT}` },
  kicker: { default: 'קולקציית סתיו' },
  headline: { default: 'גוונים חמים לימים שמתקררים', maxLength: 40 },
  cta: { default: 'לקביעת תור' },
  deco: { asset: 'leaf' },
};

export const winterPalette: CreamDef = {
  slug: 'nail-winter-palette', name: 'פלטת חורף', category: 'seasonal', group: 'seasonal', holiday: 'winter', fields: NAILS,
  description: 'קולקציית חורף — גוונים עמוקים, בורדו ושחור מט.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'overlay', headline: 'bottom' },
  photoSlot: { aiHint: `a deep-toned winter manicure — burgundy, cream and matte black — moody warm light, ${STUDIO_LIGHT}` },
  kicker: { default: 'קולקציית חורף' },
  headline: { default: 'גוונים עמוקים לימים קצרים', maxLength: 44 },
  subline: { default: 'בורדו, שמנת ושחור מט' },
  cta: { default: 'לקביעת תור' },
};

export const NAILS_SEASONAL: CreamDef[] = [
  roshHashana, yomKippur, sukkot, hanukkah, tuBishvat, familyDay, purim, pesach,
  yomHaatzmaut, shavuot, womensDay, springPalette, summerPalette, autumnPalette, winterPalette,
];
