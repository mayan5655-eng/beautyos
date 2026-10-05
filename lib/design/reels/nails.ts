// lib/design/reels/nails.ts
//
// Eight nails reel sequences — motion matters more here than in cosmetics
// (see lib/ai/marketingAI.ts's creativeVoice comment), so this set leads
// with the concepts unique to nail content: the reveal, the process shot,
// scrolling through a design menu, a before/after wipe, a colour-swatch
// run and a satisfying macro close-up — plus a testimonial and an offer
// countdown for parity with cosmetics' eight. Same cream builder as the
// static library; every scene is an ordinary story-format Template.

import { creamTemplate, type CreamDef } from '../templates/cream.ts';
import { makeReel, type ReelScene, type ReelTemplate } from '../reel.ts';

const LIGHT = 'soft natural light, warm neutral tones, a clean manicure table';
const NAILS: CreamDef['fields'] = ['nails'];

type SceneDef = Omit<ReelScene, 'frame' | 'id'> & { def: Omit<CreamDef, 'slug' | 'versions' | 'group' | 'category' | 'formats' | 'description'> & { description?: string } };

/** Same pattern as launch.ts's own local helper: scene slugs are derived so
 *  keys never collide with statics, and frames stay private to their reel. */
function scenes(reelKey: string, category: CreamDef['category'], group: CreamDef['group'], list: SceneDef[]): ReelScene[] {
  return list.map((s, i) => {
    const slug = `${reelKey}-s${i + 1}`;
    const frame = creamTemplate({ ...s.def, slug, category, group, description: s.def.description || s.def.name, versions: { feed: 1, story: 1 }, formats: ['story'] }, 'story');
    return { id: `s${i + 1}`, seconds: s.seconds, transition: i === 0 ? 'cut' : s.transition, motion: s.motion, label: s.label, frame };
  });
}

const cta = { default: 'לקביעת תור' };

// ── 1. The reveal: hand turns, design appears ───────────────────────────────
export const nailReveal: ReelTemplate = makeReel({
  key: 'nail-reveal-reel', version: 1, category: 'treatment', group: 'evergreen', name: 'רגע החשיפה', fields: NAILS,
  description: 'שלוש סצנות: לפני שמתחילים, החשיפה, והזמנה. הרגע שהיד מסתובבת והעיצוב נחשף.',
  musicVibe: 'עולה ומרגש',
  scenes: scenes('nail-reveal-reel', 'treatment', 'evergreen', [
    { seconds: 2, transition: 'cut', motion: 'kenburns', label: 'רגע לפני', def: { name: 'רגע לפני', layout: { family: 'overlay', headline: 'top' }, photoSlot: { aiHint: `bare, freshly prepped nails on a manicure table just before polish, ${LIGHT}` }, kicker: { default: 'רגע לפני' }, headline: { default: 'עוד לא גמרנו...', maxLength: 30 }, cta: null } },
    { seconds: 3, transition: 'fade', motion: 'kenburns', label: 'החשיפה', def: { name: 'החשיפה', layout: { family: 'overlay', headline: 'top' }, photoSlot: { aiHint: `a hand turning to reveal a finished nail-art design, dramatic reveal moment, ${LIGHT}` }, kicker: { default: 'והנה זה' }, headline: { default: 'ואז... הסט מוכן', maxLength: 30 }, cta: null } },
    { seconds: 2.5, transition: 'fade', motion: 'none', label: 'הזמנה', def: { name: 'הזמנה', layout: { family: 'text', block: 'primary', photo: 'none' }, kicker: { default: 'רוצה גם?' }, headline: { default: 'התור הבא יכול להיות שלך', maxLength: 40 }, cta, deco: { asset: 'sparkle' } } },
  ]),
});

// ── 2. Step by step / time-lapse ────────────────────────────────────────────
export const nailProcess: ReelTemplate = makeReel({
  key: 'nail-process-reel', version: 1, category: 'treatment', group: 'evergreen', name: 'תהליך, שלב אחרי שלב', fields: NAILS,
  description: 'ארבע סצנות: בסיס, עיצוב הצורה, ציור העיצוב, וגימור. קצב עבודה שמרגיע לצפות בו.',
  musicVibe: 'רגוע, קצב איטי ועקבי',
  scenes: scenes('nail-process-reel', 'treatment', 'evergreen', [
    { seconds: 2.5, transition: 'cut', motion: 'kenburns', label: 'בסיס', def: { name: 'בסיס', layout: { family: 'overlay', headline: 'bottom' }, photoSlot: { aiHint: `a base coat of gel polish being applied to a natural nail, ${LIGHT}` }, kicker: { default: 'שלב 1' }, headline: { default: 'מתחילים מבסיס נקי', maxLength: 30 }, cta: null } },
    { seconds: 2.5, transition: 'slide', motion: 'kenburns', label: 'צורה', def: { name: 'צורה', layout: { family: 'overlay', headline: 'bottom' }, photoSlot: { aiHint: `a nail file shaping a nail tip precisely, ${LIGHT}` }, kicker: { default: 'שלב 2' }, headline: { default: 'הצורה המדויקת לך', maxLength: 30 }, cta: null } },
    { seconds: 3, transition: 'slide', motion: 'kenburns', label: 'עיצוב', def: { name: 'עיצוב', layout: { family: 'overlay', headline: 'bottom' }, photoSlot: { aiHint: `a thin brush painting a delicate design onto a nail, extreme focus, ${LIGHT}` }, kicker: { default: 'שלב 3' }, headline: { default: 'כאן קורה הקסם', maxLength: 30 }, cta: null } },
    { seconds: 3, transition: 'slide', motion: 'kenburns', label: 'גימור', def: { name: 'גימור', layout: { family: 'overlay', headline: 'bottom' }, photoSlot: { aiHint: `a finished glossy manicure under a curing lamp glow, ${LIGHT}` }, kicker: { default: 'סיימנו' }, headline: { default: 'מוכן. ומושלם', maxLength: 30 }, cta } },
  ]),
});

// ── 3. Design menu scroll ────────────────────────────────────────────────────
export const nailMenuScroll: ReelTemplate = makeReel({
  key: 'nail-menu-scroll-reel', version: 1, category: 'treatment', group: 'evergreen', name: 'תפריט עיצובים, בגלילה', fields: NAILS,
  description: 'שלושה עיצובים ברצף מהיר, כמו גלילה בתפריט, וסיום עם "בחרי את שלך".',
  musicVibe: 'קצבי, חתכים מהירים',
  scenes: scenes('nail-menu-scroll-reel', 'treatment', 'evergreen', [
    { seconds: 1.8, transition: 'cut', motion: 'none', label: 'עיצוב 1', def: { name: 'עיצוב 1', layout: { family: 'top', shape: 'arch' }, photoSlot: { aiHint: `nail-art design option one, clean studio crop, ${LIGHT}` }, kicker: { default: 'אופציה 1' }, headline: { default: 'קלאסי ונקי', maxLength: 26, lines: 1 }, cta: null } },
    { seconds: 1.8, transition: 'cut', motion: 'none', label: 'עיצוב 2', def: { name: 'עיצוב 2', layout: { family: 'top', shape: 'arch' }, photoSlot: { aiHint: `nail-art design option two, bolder colour, ${LIGHT}` }, kicker: { default: 'אופציה 2' }, headline: { default: 'נועז ובולט', maxLength: 26, lines: 1 }, cta: null } },
    { seconds: 1.8, transition: 'cut', motion: 'none', label: 'עיצוב 3', def: { name: 'עיצוב 3', layout: { family: 'top', shape: 'arch' }, photoSlot: { aiHint: `nail-art design option three, delicate fine-line art, ${LIGHT}` }, kicker: { default: 'אופציה 3' }, headline: { default: 'עדין ומיוחד', maxLength: 26, lines: 1 }, cta: null } },
    { seconds: 2.6, transition: 'fade', motion: 'none', label: 'בחירה', def: { name: 'בחירה', layout: { family: 'text', block: 'blush', photo: 'none' }, kicker: { default: 'איזה מדבר אליך?' }, headline: { default: 'בחרי את שלך', maxLength: 30, lines: 1 }, cta } },
  ]),
});

// ── 4. Before/after wipe ─────────────────────────────────────────────────────
export const nailBeforeAfterWipe: ReelTemplate = makeReel({
  key: 'nail-before-after-wipe-reel', version: 1, category: 'before_after', group: 'evergreen', name: 'לפני / אחרי', fields: NAILS,
  description: 'שלוש סצנות: ציפורניים שבורות או מוזנחות, מעבר, והתוצאה הגמורה. שתי התמונות של לקוחה שאישרה פרסום.',
  musicVibe: 'שקט ומרגש',
  scenes: scenes('nail-before-after-wipe-reel', 'before_after', 'evergreen', [
    { seconds: 2.5, transition: 'cut', motion: 'kenburns', label: 'לפני', def: { name: 'לפני', layout: { family: 'overlay', headline: 'top' }, photoSlot: { sources: ['before', 'upload'], label: 'תמונת לפני' }, kicker: { default: 'לפני' }, headline: { default: 'ככה הגיעה', maxLength: 30 }, cta: null } },
    { seconds: 3, transition: 'slide', motion: 'kenburns', label: 'אחרי', def: { name: 'אחרי', layout: { family: 'overlay', headline: 'top' }, photoSlot: { sources: ['after', 'upload'], label: 'תמונת אחרי' }, kicker: { default: 'אחרי' }, headline: { default: 'וככה יצאה', maxLength: 30 }, subline: { default: 'ללא פילטרים, באור טבעי' }, cta: null } },
    { seconds: 2.5, transition: 'fade', motion: 'none', label: 'סיום', def: { name: 'סיום', layout: { family: 'text', block: 'primary', photo: 'none' }, kicker: { default: 'גם את?' }, headline: { default: 'התור הבא יכול להיות שלך', maxLength: 40 }, cta, deco: { asset: 'sparkle' } } },
  ]),
});
// Both client photos need consent: mark the slots the way the static pair does.
for (const s of nailBeforeAfterWipe.scenes.slice(0, 2)) for (const sl of s.frame.slots) sl.consent = true;
for (const sl of nailBeforeAfterWipe.slots.slice(0, 2)) sl.consent = true;
nailBeforeAfterWipe.needs = ['תמונת לפני ותמונת אחרי של לקוחה שאישרה פרסום'];

// ── 5. Colour swatch run ─────────────────────────────────────────────────────
export const nailColourSwatchRun: ReelTemplate = makeReel({
  key: 'nail-colour-swatch-reel', version: 1, category: 'tip', group: 'evergreen', name: 'ריצת גוונים', fields: NAILS,
  description: 'ארבעה גוונים ברצף מהיר, כל אחד עם שם, וסיום עם שאלה. מתאים למתלבטת בין גוונים.',
  musicVibe: 'קליל וקצבי',
  scenes: scenes('nail-colour-swatch-reel', 'tip', 'evergreen', [
    { seconds: 1.6, transition: 'cut', motion: 'none', label: 'גוון 1', def: { name: 'גוון 1', layout: { family: 'split', side: 'right', block: 'primary' }, photoSlot: { aiHint: `a single glossy nail polish swatch, colour one, ${LIGHT}` }, kicker: { default: 'גוון 1' }, headline: { default: 'שם הגוון', maxLength: 20, lines: 1 }, cta: null } },
    { seconds: 1.6, transition: 'cut', motion: 'none', label: 'גוון 2', def: { name: 'גוון 2', layout: { family: 'split', side: 'right', block: 'blush' }, photoSlot: { aiHint: `a single glossy nail polish swatch, colour two, ${LIGHT}` }, kicker: { default: 'גוון 2' }, headline: { default: 'שם הגוון', maxLength: 20, lines: 1 }, cta: null } },
    { seconds: 1.6, transition: 'cut', motion: 'none', label: 'גוון 3', def: { name: 'גוון 3', layout: { family: 'split', side: 'right', block: 'sand' }, photoSlot: { aiHint: `a single glossy nail polish swatch, colour three, ${LIGHT}` }, kicker: { default: 'גוון 3' }, headline: { default: 'שם הגוון', maxLength: 20, lines: 1 }, cta: null } },
    { seconds: 2.2, transition: 'fade', motion: 'none', label: 'שאלה', def: { name: 'שאלה', layout: { family: 'text', block: 'primary', photo: 'none' }, kicker: { default: 'קשה לבחור?' }, headline: { default: 'איזה גוון את היום?', maxLength: 30, lines: 1 }, cta } },
  ]),
});

// ── 6. Satisfying detail close-up ────────────────────────────────────────────
export const nailDetailCloseup: ReelTemplate = makeReel({
  key: 'nail-closeup-reel', version: 1, category: 'treatment', group: 'evergreen', name: 'קלוז-אפ מספק', fields: NAILS,
  description: 'שתי סצנות: תמונה רחבה, ואז תקריב איטי על הפרט. בלי מילים מיותרות — התמונה עושה את העבודה.',
  musicVibe: 'רגוע, אווירתי',
  scenes: scenes('nail-closeup-reel', 'treatment', 'evergreen', [
    { seconds: 2.5, transition: 'cut', motion: 'kenburns', label: 'רחב', def: { name: 'רחב', layout: { family: 'overlay', headline: 'top' }, photoSlot: { aiHint: `a full finished manicure resting on linen, wide calm shot, ${LIGHT}` }, kicker: { default: 'התוצאה' }, headline: { default: 'תראי את זה מקרוב', maxLength: 30 }, cta: null } },
    { seconds: 3.5, transition: 'fade', motion: 'kenburns', label: 'קלוז-אפ', def: { name: 'קלוז-אפ', layout: { family: 'overlay', headline: 'bottom' }, photoSlot: { aiHint: `an extreme macro of a single nail-art detail, shallow focus, satisfying, ${LIGHT}` }, kicker: { default: 'קלוז-אפ' }, headline: { default: 'הפרט הקטן שעושה את הכול', maxLength: 34 }, cta } },
  ]),
});

// ── 7. Testimonial ────────────────────────────────────────────────────────────
export const nailTestimonial: ReelTemplate = makeReel({
  key: 'nail-testimonial-reel', version: 1, category: 'review', group: 'evergreen', name: 'לקוחה מספרת', fields: NAILS,
  description: 'תמונה מהסטודיו, הציטוט מהביקורת השמורה, והזמנה.',
  musicVibe: 'חם ואישי',
  scenes: scenes('nail-testimonial-reel', 'review', 'evergreen', [
    { seconds: 2.5, transition: 'cut', motion: 'kenburns', label: 'פתיחה', def: { name: 'פתיחה', layout: { family: 'overlay', headline: 'top' }, photoSlot: { aiHint: `a warm still life at a manicure table, nail polish bottles, ${LIGHT}` }, kicker: { default: 'לקוחה מספרת' }, headline: { default: 'מה אומרות אחרי הביקור', maxLength: 36 }, cta: null } },
    { seconds: 4, transition: 'fade', motion: 'none', label: 'הציטוט', def: { name: 'הציטוט', layout: { family: 'top' }, photoSlot: { label: 'תמונה (לא חובה)', required: false, aiHint: `nail polish bottles on linen, ${LIGHT}` }, quote: true, headline: { default: 'הידיים הכי מטופחות יוצאות מכאן 💅', maxLength: 200 }, cta: null } },
    { seconds: 3, transition: 'fade', motion: 'none', label: 'הזמנה', def: { name: 'הזמנה', layout: { family: 'text', block: 'primary', photo: 'none' }, kicker: { default: 'גם את' }, headline: { default: 'הביקורת הבאה יכולה להיות שלך', maxLength: 40 }, cta, deco: { asset: 'sparkle' } } },
  ]),
});

// ── 8. Offer countdown ────────────────────────────────────────────────────────
export const nailOfferCountdown: ReelTemplate = makeReel({
  key: 'nail-countdown-reel', version: 1, category: 'offer', group: 'closer', name: 'מבצע, ספירה לאחור', fields: NAILS,
  description: 'שלוש, שתיים, אחת, והמבצע עם המחיר הגדול.',
  musicVibe: 'אנרגטי',
  scenes: scenes('nail-countdown-reel', 'offer', 'closer', [
    { seconds: 1.5, transition: 'cut', motion: 'none', label: '3', def: { name: '3', layout: { family: 'text', block: 'primary', photo: 'none' }, kicker: { default: 'משהו טוב מגיע' }, headline: { default: '3', maxLength: 4, lines: 1 }, cta: null } },
    { seconds: 1.5, transition: 'cut', motion: 'none', label: '2', def: { name: '2', layout: { family: 'text', block: 'blush', photo: 'none' }, kicker: { default: 'עוד רגע' }, headline: { default: '2', maxLength: 4, lines: 1 }, cta: null } },
    { seconds: 1.5, transition: 'cut', motion: 'none', label: '1', def: { name: '1', layout: { family: 'text', block: 'primary', photo: 'none' }, kicker: { default: 'הנה זה' }, headline: { default: '1', maxLength: 4, lines: 1 }, cta: null } },
    { seconds: 4, transition: 'fade', motion: 'kenburns', label: 'המבצע', def: { name: 'המבצע', layout: { family: 'split', side: 'bottom', block: 'primary' }, photoSlot: { aiHint: `a fresh gel manicure moment, ${LIGHT}` }, kicker: { default: 'מבצע לזמן מוגבל' }, headline: { default: 'מניקור ג׳ל', maxLength: 36 }, price: { default: '₪170', note: 'במקום ₪220' }, cta, headlineWeight: 900 } },
  ]),
});

export const NAILS_REELS: ReelTemplate[] = [
  nailReveal, nailProcess, nailMenuScroll, nailBeforeAfterWipe,
  nailColourSwatchRun, nailDetailCloseup, nailTestimonial, nailOfferCountdown,
];
