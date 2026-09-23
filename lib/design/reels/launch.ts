// lib/design/reels/launch.ts
//
// The launch set of reel templates: eight sequences across the themes that
// suit motion. Every scene is a story frame built by the cream builder, in
// whatever layout family reads best for that beat, so a reel varies the
// way the static library does and carries the same strip, accent, fonts
// and brand toggles. Frames are private to their reel (key sN-<reel>), not
// offered in the static gallery.

import { creamTemplate, type CreamDef } from '../templates/cream.ts';
import { makeReel, type ReelScene, type ReelTemplate } from '../reel.ts';

const LIGHT = 'soft window light, warm neutral tones, a calm treatment room';

type SceneDef = Omit<ReelScene, 'frame' | 'id'> & { def: Omit<CreamDef, 'slug' | 'versions' | 'group' | 'category' | 'formats' | 'description'> & { description?: string } };

/** Scene frames share the reel's category/group; their slugs are derived so keys never collide with statics. */
function scenes(reelKey: string, category: CreamDef['category'], group: CreamDef['group'], list: SceneDef[]): ReelScene[] {
  return list.map((s, i) => {
    const slug = `${reelKey}-s${i + 1}`;
    const frame = creamTemplate({ ...s.def, slug, category, group, description: s.def.description || s.def.name, versions: { feed: 1, story: 1 }, formats: ['story'] }, 'story');
    return { id: `s${i + 1}`, seconds: s.seconds, transition: i === 0 ? 'cut' : s.transition, motion: s.motion, label: s.label, frame };
  });
}

const cta = { default: 'לקביעת תור' };

export const beforeAfterReveal: ReelTemplate = makeReel({
  key: 'reveal-reel', version: 1, category: 'before_after', group: 'evergreen', name: 'לפני / אחרי',
  description: 'שלוש סצנות: לפני, אחרי, והזמנה. שתי התמונות של לקוחה שאישרה פרסום.',
  musicVibe: 'שקט ומרגש',
  scenes: scenes('reveal-reel', 'before_after', 'evergreen', [
    { seconds: 2.5, transition: 'cut', motion: 'kenburns', label: 'לפני', def: { name: 'לפני', layout: { family: 'overlay', headline: 'top' }, photoSlot: { sources: ['before', 'upload'], label: 'תמונת לפני' }, kicker: { default: 'לפני' }, headline: { default: 'ככה הגיעה', maxLength: 30 }, cta: null } },
    { seconds: 3, transition: 'fade', motion: 'kenburns', label: 'אחרי', def: { name: 'אחרי', layout: { family: 'overlay', headline: 'top' }, photoSlot: { sources: ['after', 'upload'], label: 'תמונת אחרי' }, kicker: { default: 'אחרי' }, headline: { default: 'אחרי טיפול אחד', maxLength: 30 }, subline: { default: 'ללא פילטרים, באור טבעי' }, cta: null } },
    { seconds: 3, transition: 'fade', motion: 'none', label: 'סיום', def: { name: 'סיום', layout: { family: 'text', block: 'primary', photo: 'none' }, kicker: { default: 'גם את?' }, headline: { default: 'התור הבא יכול להיות שלך', maxLength: 40 }, cta, deco: { asset: 'sparkle' } } },
  ]),
});
// Both client photos need consent: mark the slots the way the static pair does.
for (const s of beforeAfterReveal.scenes.slice(0, 2)) for (const sl of s.frame.slots) sl.consent = true;
for (const sl of beforeAfterReveal.slots.slice(0, 2)) sl.consent = true;
beforeAfterReveal.needs = ['תמונת לפני ותמונת אחרי של לקוחה שאישרה פרסום'];

export const stepByStep: ReelTemplate = makeReel({
  key: 'steps-reel', version: 1, category: 'treatment', group: 'evergreen', name: 'טיפול, שלב אחרי שלב',
  description: 'ארבע סצנות: פתיחה ושלושה שלבים של הטיפול, כל אחד עם תמונה וכיתוב.',
  musicVibe: 'רגוע, קצב איטי',
  scenes: scenes('steps-reel', 'treatment', 'evergreen', [
    { seconds: 2.5, transition: 'cut', motion: 'kenburns', label: 'פתיחה', def: { name: 'פתיחה', layout: { family: 'magazine', band: 'primary' }, photoSlot: { aiHint: `a facial treatment beginning, hands and a soft towel, ${LIGHT}` }, kicker: { default: 'ככה זה נראה' }, headline: { default: 'טיפול פנים, שלב אחרי שלב', maxLength: 36 }, cta: null } },
    { seconds: 3, transition: 'slide', motion: 'kenburns', label: 'שלב 1', def: { name: 'שלב 1', layout: { family: 'overlay', headline: 'bottom' }, photoSlot: { aiHint: `cleansing foam being applied, ${LIGHT}` }, kicker: { default: 'שלב 1' }, headline: { default: 'ניקוי עמוק', maxLength: 30 }, subline: { default: 'מסירים את היום' }, cta: null } },
    { seconds: 3, transition: 'slide', motion: 'kenburns', label: 'שלב 2', def: { name: 'שלב 2', layout: { family: 'overlay', headline: 'bottom' }, photoSlot: { aiHint: `a cream mask being brushed on, ${LIGHT}` }, kicker: { default: 'שלב 2' }, headline: { default: 'מסכה', maxLength: 30 }, subline: { default: 'עשר דקות של שקט' }, cta: null } },
    { seconds: 3.5, transition: 'slide', motion: 'kenburns', label: 'שלב 3', def: { name: 'שלב 3', layout: { family: 'overlay', headline: 'bottom' }, photoSlot: { aiHint: `serum drops on glowing skin, ${LIGHT}` }, kicker: { default: 'שלב 3' }, headline: { default: 'הזנה והגנה', maxLength: 30 }, subline: { default: 'ויוצאים זוהרות' }, cta } },
  ]),
});

export const offerCountdown: ReelTemplate = makeReel({
  key: 'countdown-reel', version: 1, category: 'offer', group: 'closer', name: 'מבצע, ספירה לאחור',
  description: 'שלוש, שתיים, אחת, והמבצע עם המחיר הגדול.',
  musicVibe: 'אנרגטי',
  scenes: scenes('countdown-reel', 'offer', 'closer', [
    { seconds: 1.5, transition: 'cut', motion: 'none', label: '3', def: { name: '3', layout: { family: 'text', block: 'primary', photo: 'none' }, kicker: { default: 'משהו טוב מגיע' }, headline: { default: '3', maxLength: 4, lines: 1 }, cta: null } },
    { seconds: 1.5, transition: 'cut', motion: 'none', label: '2', def: { name: '2', layout: { family: 'text', block: 'blush', photo: 'none' }, kicker: { default: 'עוד רגע' }, headline: { default: '2', maxLength: 4, lines: 1 }, cta: null } },
    { seconds: 1.5, transition: 'cut', motion: 'none', label: '1', def: { name: '1', layout: { family: 'text', block: 'primary', photo: 'none' }, kicker: { default: 'הנה זה' }, headline: { default: '1', maxLength: 4, lines: 1 }, cta: null } },
    { seconds: 4, transition: 'fade', motion: 'kenburns', label: 'המבצע', def: { name: 'המבצע', layout: { family: 'split', side: 'bottom', block: 'primary' }, photoSlot: { aiHint: `a calm treatment moment, ${LIGHT}` }, kicker: { default: 'מבצע לזמן מוגבל' }, headline: { default: 'טיפול פנים קלאסי', maxLength: 36 }, price: { default: '₪249', note: 'במקום ₪320' }, cta, headlineWeight: 900 } },
  ]),
});

export const holidayGreeting: ReelTemplate = makeReel({
  key: 'holiday-reel', version: 1, category: 'seasonal', group: 'seasonal', name: 'ברכת חג',
  description: 'ברכה בשלוש סצנות: תמונה, מילים, והזמנה. הטקסט מתחלף לפי החג.',
  musicVibe: 'חגיגי ורך',
  scenes: scenes('holiday-reel', 'seasonal', 'seasonal', [
    { seconds: 3, transition: 'cut', motion: 'kenburns', label: 'פתיחה', def: { name: 'פתיחה', layout: { family: 'overlay', headline: 'bottom' }, photoSlot: { sources: ['ai', 'gallery', 'clinic', 'upload', 'previous'], aiHint: 'a warm holiday still life on cream linen, soft window light, calm empty space' }, kicker: { default: 'חג שמח' }, headline: { default: 'שתהיה לך שנה של עור זוהר', maxLength: 44 }, cta: null, deco: { asset: 'pomegranate' } } },
    { seconds: 3, transition: 'fade', motion: 'none', label: 'ברכה', def: { name: 'ברכה', layout: { family: 'text', block: 'blush', photo: 'none' }, kicker: { default: 'ממני אלייך' }, headline: { default: 'תודה שאת חלק מהשנה שלי', maxLength: 44 }, subline: { default: 'על כל ביקור, כל שיחה, כל חיוך' }, cta: null, deco: { asset: 'leaf' } } },
    { seconds: 3, transition: 'fade', motion: 'kenburns', label: 'הזמנה', def: { name: 'הזמנה', layout: { family: 'top', shape: 'circle' }, photoSlot: { aiHint: `a serene clinic detail, ${LIGHT}` }, kicker: { default: 'לפני החג' }, headline: { default: 'נשארו מקומות אחרונים', maxLength: 36 }, cta: { default: 'לתור לפני החג' } } },
  ]),
});

export const testimonial: ReelTemplate = makeReel({
  key: 'testimonial-reel', version: 1, category: 'review', group: 'evergreen', name: 'לקוחה מספרת',
  description: 'תמונה מהקליניקה, הציטוט מהביקורת השמורה, והזמנה.',
  musicVibe: 'חם ואישי',
  scenes: scenes('testimonial-reel', 'review', 'evergreen', [
    { seconds: 2.5, transition: 'cut', motion: 'kenburns', label: 'פתיחה', def: { name: 'פתיחה', layout: { family: 'overlay', headline: 'top' }, photoSlot: { aiHint: `a serene detail from a skincare clinic, ${LIGHT}` }, kicker: { default: 'לקוחה מספרת' }, headline: { default: 'מה אומרות אחרי הטיפול', maxLength: 36 }, cta: null } },
    { seconds: 4, transition: 'fade', motion: 'none', label: 'הציטוט', def: { name: 'הציטוט', layout: { family: 'top' }, photoSlot: { label: 'תמונה (לא חובה)', required: false, aiHint: `folded towels and a ceramic bowl, ${LIGHT}` }, quote: true, headline: { default: 'הגעתי עם עור עייף ויצאתי זוהרת. מקצועיות, סבלנות ויחס אישי.', maxLength: 200 }, cta: null } },
    { seconds: 3, transition: 'fade', motion: 'none', label: 'הזמנה', def: { name: 'הזמנה', layout: { family: 'text', block: 'primary', photo: 'none' }, kicker: { default: 'גם את' }, headline: { default: 'הביקורת הבאה יכולה להיות שלך', maxLength: 40 }, cta, deco: { asset: 'sparkle' } } },
  ]),
});

export const productShowcase: ReelTemplate = makeReel({
  key: 'product-reel', version: 1, category: 'treatment', group: 'closer', name: 'מוצר על המדף',
  description: 'ארבע סצנות: המוצר, למה, איך, ואיפה קונים. תמונות המוצר שלך.',
  musicVibe: 'נקי ומודרני',
  scenes: scenes('product-reel', 'treatment', 'closer', [
    { seconds: 3, transition: 'cut', motion: 'kenburns', label: 'המוצר', def: { name: 'המוצר', layout: { family: 'frame' }, photoSlot: { label: 'תמונת מוצר', sources: ['upload', 'gallery', 'previous'] }, kicker: { default: 'המדף שלי' }, headline: { default: 'הסרום שאני ממליצה', maxLength: 36 }, cta: null } },
    { seconds: 3, transition: 'slide', motion: 'none', label: 'למה', def: { name: 'למה', layout: { family: 'text', block: 'blush', photo: 'circle' }, photoSlot: { label: 'תמונת מוצר', sources: ['upload', 'gallery', 'previous'] }, kicker: { default: 'למה' }, headline: { default: 'ויטמין C שבאמת נספג', maxLength: 36 }, subline: { default: 'מרקם קליל, בלי דביקות' }, cta: null } },
    { seconds: 3, transition: 'slide', motion: 'kenburns', label: 'איך', def: { name: 'איך', layout: { family: 'split', side: 'right', block: 'blush' }, photoSlot: { label: 'תמונת שימוש', sources: ['upload', 'gallery', 'ai', 'previous'], aiHint: `serum drops on a fingertip, ${LIGHT}` }, kicker: { default: 'איך' }, headline: { default: 'שלוש טיפות, כל בוקר', maxLength: 36 }, subline: { default: 'לפני קרם ההגנה' }, cta: null } },
    { seconds: 3, transition: 'fade', motion: 'kenburns', label: 'איפה', def: { name: 'איפה', layout: { family: 'top', shape: 'arch' }, photoSlot: { label: 'תמונת מוצר', sources: ['upload', 'gallery', 'previous'] }, kicker: { default: 'אצלי בקליניקה' }, headline: { default: 'שאלי אותי בטיפול הבא', maxLength: 36 }, price: { default: '₪180', required: false }, cta: { default: 'לרכישה בקליניקה' } } },
  ]),
});

export const dayInClinic: ReelTemplate = makeReel({
  key: 'day-reel', version: 1, category: 'announce', group: 'evergreen', name: 'יום בקליניקה',
  description: 'חמש סצנות מהיום: בוקר, לקוחה ראשונה, באמצע, רגע שקט, סיום. תמונות מהגלריה שלך.',
  musicVibe: 'קליל, יומיומי',
  scenes: scenes('day-reel', 'announce', 'evergreen', [
    { seconds: 2.5, transition: 'cut', motion: 'kenburns', label: 'בוקר', def: { name: 'בוקר', layout: { family: 'overlay', headline: 'top' }, photoSlot: { aiHint: `morning light on an empty treatment room, ${LIGHT}` }, kicker: { default: '08:30' }, headline: { default: 'פותחים את הקליניקה', maxLength: 32 }, cta: null } },
    { seconds: 2.5, transition: 'slide', motion: 'kenburns', label: 'לקוחה ראשונה', def: { name: 'לקוחה ראשונה', layout: { family: 'overlay', headline: 'bottom' }, photoSlot: { aiHint: `hands preparing a treatment tray, ${LIGHT}` }, kicker: { default: '09:00' }, headline: { default: 'הלקוחה הראשונה', maxLength: 32 }, cta: null } },
    { seconds: 2.5, transition: 'slide', motion: 'kenburns', label: 'באמצע', def: { name: 'באמצע', layout: { family: 'collage', count: 2 }, photoSlot: { aiHint: `clinic details, ${LIGHT}` }, kicker: { default: '12:00' }, headline: { default: 'באמצע היום', maxLength: 32 }, cta: null } },
    { seconds: 2.5, transition: 'slide', motion: 'kenburns', label: 'רגע שקט', def: { name: 'רגע שקט', layout: { family: 'top', shape: 'circle' }, photoSlot: { aiHint: `a cup of tea by a window, ${LIGHT}` }, kicker: { default: '15:00' }, headline: { default: 'רגע לעצמי', maxLength: 32 }, cta: null } },
    { seconds: 3, transition: 'fade', motion: 'none', label: 'סיום', def: { name: 'סיום', layout: { family: 'text', block: 'primary', photo: 'none' }, kicker: { default: '19:00' }, headline: { default: 'מחר שוב. רוצה להיות ביומן?', maxLength: 40 }, cta } },
  ]),
});

export const tipOfTheWeek: ReelTemplate = makeReel({
  key: 'tip-reel', version: 1, category: 'tip', group: 'evergreen', name: 'הטיפ השבועי',
  description: 'שלוש סצנות: השאלה, הטיפ, וההזמנה. בלי תמונות חובה.',
  musicVibe: 'קליל',
  scenes: scenes('tip-reel', 'tip', 'evergreen', [
    { seconds: 2.5, transition: 'cut', motion: 'none', label: 'השאלה', def: { name: 'השאלה', layout: { family: 'text', block: 'primary', photo: 'none' }, kicker: { default: 'הטיפ השבועי' }, headline: { default: 'קרם הגנה בחורף?', maxLength: 36, lines: 1 }, cta: null } },
    { seconds: 4, transition: 'fade', motion: 'kenburns', label: 'הטיפ', def: { name: 'הטיפ', layout: { family: 'top' }, photoSlot: { required: false, aiHint: `a sunscreen bottle on linen beside a leaf, ${LIGHT}` }, kicker: { default: 'כן' }, headline: { default: 'הקרינה עוברת עננים', maxLength: 36 }, bullets: ['SPF 30 כל בוקר', 'גם בבית, ליד חלון', 'לחדש בצהריים'], cta: null, deco: { asset: 'leaf' } } },
    { seconds: 3, transition: 'fade', motion: 'none', label: 'הזמנה', def: { name: 'הזמנה', layout: { family: 'text', block: 'blush', photo: 'none' }, kicker: { default: 'עוד שאלות?' }, headline: { default: 'שאלי אותי בטיפול הבא', maxLength: 36 }, cta, deco: { asset: 'sparkle' } } },
  ]),
});

export const REELS: ReelTemplate[] = [beforeAfterReveal, stepByStep, offerCountdown, holidayGreeting, testimonial, productShowcase, dayInClinic, tipOfTheWeek];
