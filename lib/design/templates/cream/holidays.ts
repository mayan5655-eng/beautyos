// lib/design/templates/cream/holidays.ts
//
// Holidays and seasons in the studio look. `holiday` names the occasion in
// lib/design/holidays.ts, which opens the template's window: the studio
// surfaces it as a card weeks before the date and the gallery lifts it to
// the front of its group. The picture is never a client's: her gallery or
// the AI route, under the same cream page. Birthday has no window - it is
// per client, all year.

import type { CreamDef } from '../cream.ts';

const AI_FIRST: CreamDef['photoSlot'] = { sources: ['ai', 'gallery', 'clinic', 'upload', 'previous'] };
const STILL = 'on cream linen in soft window light, shallow depth of field, lots of calm empty space';

export const roshHashana: CreamDef = {
  slug: 'rosh-hashana', name: 'ראש השנה', category: 'seasonal', group: 'seasonal', holiday: 'rosh_hashana',
  description: 'ברכה לשנה החדשה עם רימון מצויר, מעל תמונה שלך או תמונת AI, והזמנה לטיפול לפני החג.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'top' },
  photoSlot: { ...AI_FIRST, aiHint: `a warm still life for the Jewish new year: honey in a small glass jar, apple slices, a pomegranate, ${STILL}` },
  kicker: { default: 'שנה טובה ומתוקה' },
  headline: { default: 'שתהיה לך שנה של עור זוהר', maxLength: 44 },
  subline: { default: 'טיפולי פנים לפני החג, במקומות אחרונים' },
  cta: { default: 'לתור לפני החג' },
  deco: { asset: 'pomegranate' },
};

export const yomKippur: CreamDef = {
  slug: 'yom-kippur', name: 'יום כיפור', category: 'seasonal', group: 'seasonal', holiday: 'yom_kippur',
  description: 'ברכה שקטה לפני הצום, עם נר מצויר, והודעה על השעות.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'text', block: 'surface', photo: 'none' },
  photoSlot: { ...AI_FIRST, aiHint: `a single white candle in a simple holder ${STILL}, quiet and reverent` },
  kicker: { default: 'גמר חתימה טובה' },
  headline: { default: 'רגע לעצור, לנשום, להתחיל מחדש', maxLength: 44 },
  subline: { default: 'הקליניקה סגורה ביום כיפור. נחזור אחרי הצום' },
  cta: { default: 'לתור אחרי החג' },
  deco: { asset: 'candle' },
};

export const sukkot: CreamDef = {
  slug: 'sukkot', name: 'סוכות', category: 'seasonal', group: 'seasonal', holiday: 'sukkot',
  description: 'ברכת חג עם עלה מצויר, וטיפולי חול המועד.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'frame' },
  photoSlot: { ...AI_FIRST, aiHint: `palm fronds and a woven basket with a citron ${STILL}, dappled light` },
  kicker: { default: 'חג סוכות שמח' },
  headline: { default: 'חופש לעור, חופש לך', maxLength: 40 },
  subline: { default: 'טיפולי חג בחול המועד' },
  cta: { default: 'לתור בחול המועד' },
  deco: { asset: 'leaf' },
};

export const hanukkah: CreamDef = {
  slug: 'hanukkah', name: 'חנוכה', category: 'seasonal', group: 'seasonal', holiday: 'hanukkah',
  description: 'שמונה ימים של אור, נר מצויר, ומבצע חג.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'magazine', band: 'primary' },
  photoSlot: { ...AI_FIRST, aiHint: `warm candlelight bokeh and a small brass candle holder ${STILL}, golden evening tones` },
  kicker: { default: 'חנוכה שמח' },
  headline: { default: 'שמונה ימים של אור', maxLength: 40 },
  subline: { default: 'מבצע חנוכה: הטיפול השני בחצי מחיר' },
  cta: { default: 'לתור לחנוכה' },
  deco: { asset: 'candle' },
};

export const tuBishvat: CreamDef = {
  slug: 'tu-bishvat', name: 'ט"ו בשבט', category: 'seasonal', group: 'seasonal', holiday: 'tu_bishvat',
  description: 'חג האילנות: התחדשות, טבעיים, ועלה מצויר.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'top', shape: 'circle' },
  photoSlot: { ...AI_FIRST, aiHint: `an almond branch in blossom in a glass bottle ${STILL}, spring light` },
  kicker: { default: 'ט"ו בשבט שמח' },
  headline: { default: 'עור שמתחדש כמו עץ באביב', maxLength: 44 },
  subline: { default: 'טיפול הזנה ברכיבים טבעיים' },
  cta: { default: 'לקביעת תור' },
  deco: { asset: 'leaf' },
};

export const purim: CreamDef = {
  slug: 'purim', name: 'פורים', category: 'seasonal', group: 'seasonal', holiday: 'purim',
  description: 'אחרי התחפושת והאיפור: ניקוי עמוק, עם ניצוץ מצויר.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'split', side: 'bottom', block: 'primary' },
  photoSlot: { ...AI_FIRST, aiHint: `confetti and a satin ribbon scattered ${STILL}, playful but soft` },
  kicker: { default: 'פורים שמח' },
  headline: { default: 'המסכה היחידה שכדאי להסיר', maxLength: 44 },
  subline: { default: 'ניקוי עמוק אחרי האיפור והתחפושת' },
  cta: { default: 'לתור אחרי החג' },
  deco: { asset: 'sparkle' },
};

export const pesach: CreamDef = {
  slug: 'pesach', name: 'פסח', category: 'seasonal', group: 'seasonal', holiday: 'pesach',
  description: 'ניקיון של פסח, גם לעור: טיפולי ניקוי לפני החג.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'collage', count: 2 },
  photoSlot: { ...AI_FIRST, aiHint: `a white ceramic plate, a sprig of fresh herbs and a linen napkin ${STILL}, spring morning light` },
  kicker: { default: 'חג פסח שמח' },
  headline: { default: 'ניקיון של פסח, גם לעור', maxLength: 40 },
  subline: { default: 'טיפולי ניקוי עמוק לפני החג' },
  cta: { default: 'לתור לפני החג' },
  deco: { asset: 'leaf' },
};

export const independence: CreamDef = {
  slug: 'independence', name: 'יום העצמאות', category: 'seasonal', group: 'seasonal', holiday: 'yom_haatzmaut',
  description: 'ברכת חג עם ניצוץ מצויר, ומבצע לזמן מוגבל.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'overlay', headline: 'top' },
  photoSlot: { ...AI_FIRST, aiHint: `a picnic blanket, a bowl of fresh fruit and blue sky at the edge of the frame, ${STILL}` },
  kicker: { default: 'יום העצמאות שמח' },
  headline: { default: 'חוגגים עם עור זוהר', maxLength: 40 },
  subline: { default: 'מבצע חג, לזמן מוגבל' },
  cta: { default: 'לקביעת תור' },
  deco: { asset: 'sparkle' },
};

export const shavuot: CreamDef = {
  slug: 'shavuot', name: 'שבועות', category: 'seasonal', group: 'seasonal', holiday: 'shavuot',
  description: 'לבן, רך ומזין: מסכות הזנה לחג, עם עלה מצויר.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'frame', shape: 'circle' },
  photoSlot: { ...AI_FIRST, aiHint: `a bowl of fresh yogurt, wildflowers and a wooden spoon ${STILL}, bright and airy` },
  kicker: { default: 'חג שבועות שמח' },
  headline: { default: 'לבן, רך ומזין', maxLength: 40 },
  subline: { default: 'מסכות הזנה לחג' },
  cta: { default: 'לקביעת תור' },
  deco: { asset: 'leaf' },
};

export const womensDay: CreamDef = {
  slug: 'womens-day', name: 'יום האישה', category: 'seasonal', group: 'seasonal', holiday: 'womens_day',
  description: 'יום האישה הבינלאומי: מילה לכל לקוחה, ומתנה קטנה.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'top', shape: 'arch' },
  photoSlot: { ...AI_FIRST, aiHint: `a single blush-pink peony in a ceramic vase ${STILL}, elegant` },
  kicker: { default: 'יום האישה הבינלאומי' },
  headline: { default: 'לך, על כל מה שאת', maxLength: 40 },
  subline: { default: 'מתנה קטנה לכל לקוחה השבוע' },
  cta: { default: 'לקביעת תור' },
  deco: { asset: 'sparkle' },
};

export const summer: CreamDef = {
  slug: 'summer', name: 'קיץ', category: 'seasonal', group: 'seasonal', holiday: 'summer',
  description: 'תמונת קיץ על כל הרקע, גל מצויר, וטיפולי קיץ.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'overlay', headline: 'bottom' },
  photoSlot: { ...AI_FIRST, aiHint: 'a sun hat and a bottle of sunscreen on white sand near calm sea, bright summer light, the lower half of the frame quiet' },
  kicker: { default: 'קיץ' },
  headline: { default: 'הגנה, לחות, וקצת שיזוף', maxLength: 40 },
  subline: { default: 'טיפולי קיץ קלילים' },
  cta: { default: 'לקביעת תור' },
  deco: { asset: 'wave' },
};

export const autumn: CreamDef = {
  slug: 'autumn', name: 'סתיו', category: 'seasonal', group: 'seasonal', holiday: 'autumn',
  description: 'אחרי השמש: פילינג וחידוש, על תמונת סתיו.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'magazine', band: 'blush' },
  photoSlot: { ...AI_FIRST, aiHint: 'a knitted cream scarf and a cup of tea by a window with autumn leaves outside, warm soft light, the lower half calm' },
  kicker: { default: 'סתיו' },
  headline: { default: 'הזמן לתקן את הקיץ', maxLength: 40 },
  subline: { default: 'פילינג וחידוש אחרי השמש' },
  cta: { default: 'לקביעת תור' },
  deco: { asset: 'leaf' },
};

export const winter: CreamDef = {
  slug: 'winter', name: 'חורף', category: 'seasonal', group: 'seasonal', holiday: 'winter',
  description: 'לחות עמוקה לעור יבש, על תמונת חורף.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'overlay', headline: 'bottom' },
  photoSlot: { ...AI_FIRST, aiHint: 'a cream wool blanket, a jar of rich moisturiser and a window with rain outside, soft grey daylight, the lower half calm' },
  kicker: { default: 'חורף' },
  headline: { default: 'לחות עמוקה לעור יבש', maxLength: 40 },
  subline: { default: 'טיפולי הזנה לחורף' },
  cta: { default: 'לקביעת תור' },
};

export const spring: CreamDef = {
  slug: 'spring', name: 'אביב', category: 'seasonal', group: 'seasonal', holiday: 'spring',
  description: 'העור מתעורר: ניקוי וחידוש לעונה, על תמונת אביב.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'collage', count: 3 },
  photoSlot: { ...AI_FIRST, aiHint: 'white blossom branches against a cream wall in fresh morning light, the lower half of the frame calm' },
  kicker: { default: 'אביב' },
  headline: { default: 'העור מתעורר', maxLength: 40 },
  subline: { default: 'ניקוי וחידוש לעונה החדשה' },
  cta: { default: 'לקביעת תור' },
  deco: { asset: 'leaf' },
};

export const birthday: CreamDef = {
  slug: 'birthday', name: 'יום הולדת', category: 'seasonal', group: 'seasonal',
  description: 'ברכה ומתנה ללקוחה בחודש יום ההולדת, עם סרט מצויר. בלי חלון: כל השנה.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'text', block: 'blush', photo: 'circle' },
  photoSlot: { ...AI_FIRST, aiHint: `a small cake with one candle and a satin ribbon ${STILL}, celebratory but soft` },
  kicker: { default: 'יום הולדת שמח' },
  headline: { default: 'מזל טוב, ומתנה ממני', maxLength: 40 },
  subline: { default: 'הנחה על הטיפול הבא בחודש יום ההולדת' },
  cta: { default: 'לתור מתנה' },
  deco: { asset: 'ribbon' },
};

export const HOLIDAYS: CreamDef[] = [
  roshHashana, yomKippur, sukkot, hanukkah, tuBishvat, purim, pesach, independence, shavuot, womensDay,
  summer, autumn, winter, spring, birthday,
];
