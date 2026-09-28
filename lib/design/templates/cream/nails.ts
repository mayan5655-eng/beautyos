// lib/design/templates/cream/nails.ts
//
// Six evergreen definitions FOR NAILS (see ../cream.ts for the DSL, and
// lib/businessFields.ts for the field concept these are tagged with).
//
// "Before/after and designs matter most" was the brief this pack was built
// against, so it leans there: a dedicated before/after (not the cosmetics
// one relabelled — see the note on `fields` in ../../contract.ts for why a
// shared idea gets its own single-field template rather than one template
// with vague-enough words to fit both) and a nail-art showcase, alongside
// one offer, one review and one tip so every suggestion-engine category
// (lib/design/suggestions.ts) has somewhere to point for a nails tenant.
//
// A starting set, not a mirror of the 50-template cosmetics library — real
// content someone should expand the way the seed service menu itself was
// expanded, not a draft awaiting correction.

import type { CreamDef } from '../cream.ts';

const NAIL_LIGHT = 'soft natural light, warm neutral tones, a clean manicure table';

export const nailBeforeAfter: CreamDef = {
  slug: 'nail-before-after', name: 'ציפורניים: לפני / אחרי', category: 'before_after', group: 'evergreen',
  fields: ['nails'],
  description: 'שתי תמונות של לקוחה זו לצד זו, כותרת ושורת הסבר. שתי התמונות דורשות אישור פרסום.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'pair' },
  kicker: { default: 'ציפורניים לפני ואחרי' },
  headline: { default: 'ציפורניים חדשות לגמרי', maxLength: 40 },
  subline: { default: 'התוצאה מדברת בעד עצמה' },
  cta: { default: 'גם את? לקביעת תור' },
};

export const nailArtShowcase: CreamDef = {
  slug: 'nail-art-showcase', name: 'עיצוב ציפורניים', category: 'treatment', group: 'evergreen',
  fields: ['nails'],
  description: 'תמונת עיצוב גדולה, כותרת אלגנטית וכפתור. לפוסט עיצוב ציפורניים.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'top' },
  photoSlot: { aiHint: `extreme macro of a delicate hand-painted nail-art design, a thin brush near the nail, ${NAIL_LIGHT}, precise and artistic, no face` },
  kicker: { default: 'עיצוב ציפורניים' },
  headline: { default: 'עיצוב שמותאם בדיוק לך', maxLength: 40 },
  subline: { default: 'כל עיצוב מתחיל מהשראה שלך' },
  cta: { default: 'לקביעת תור' },
};

export const nailGelOffer: CreamDef = {
  slug: 'nail-gel-offer', name: 'מבצע מניקור ג׳ל', category: 'offer', group: 'evergreen',
  fields: ['nails'],
  description: 'תמונה גדולה, כותרת אלגנטית, מחיר גדול לצידה, וכפתור. לפוסט מבצע.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'top' },
  photoSlot: { aiHint: `macro of a hand under a small UV/LED lamp curing a fresh coat of gel polish, ${NAIL_LIGHT}, a soft glow from the lamp` },
  kicker: { default: 'מבצע לזמן מוגבל' },
  headline: { default: 'מניקור ג׳ל', maxLength: 40 },
  subline: { default: 'לק שמחזיק שבועות, בלי סדקים' },
  price: { default: '₪170', note: 'לזמן מוגבל' },
  cta: { default: 'לקביעת תור' },
  headlineWeight: 900,
};

export const nailReview: CreamDef = {
  slug: 'nail-review', name: 'לקוחה מספרת (ציפורניים)', category: 'review', group: 'evergreen',
  fields: ['nails'],
  description: 'ציטוט של לקוחה מהביקורות השמורות, עם דירוג ושם, מעל תמונה מהסטודיו.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'top' },
  photoSlot: { label: 'תמונה (לא חובה)', required: false, aiHint: `still life: a few nail polish bottles in soft neutral tones on a pale linen surface, ${NAIL_LIGHT}` },
  quote: true,
  headline: { default: 'הידיים הכי מטופחות יוצאות מכאן 💅', maxLength: 200 },
  cta: { default: 'לקביעת תור' },
};

export const nailTip: CreamDef = {
  slug: 'nail-tip', name: 'טיפ לציפורניים', category: 'tip', group: 'evergreen',
  fields: ['nails'],
  description: 'טיפ אחד קצר, כותרת שנשארת בראש, ונצנוץ מצויר. לפוסט ידע.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'text', block: 'blush', photo: 'circle' },
  photoSlot: { aiHint: `a small dish of cuticle oil and a nail file on a linen cloth, ${NAIL_LIGHT}, minimal` },
  kicker: { default: 'טיפ קטן' },
  headline: { default: 'איך לשמור על הג׳ל זמן רב יותר?', maxLength: 40 },
  subline: { default: 'שמן קוטיקולה כל יום שומר על הלק אחיד ומבריק' },
  cta: { default: 'עוד טיפים בפרופיל' },
  deco: { asset: 'sparkle' },
};

export const nailPedicureTreatment: CreamDef = {
  slug: 'nail-pedicure-treatment', name: 'פדיקור', category: 'treatment', group: 'evergreen',
  fields: ['nails'],
  description: 'תמונה גדולה, כותרת אלגנטית וכפתור. לפוסט פדיקור.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'top' },
  photoSlot: { aiHint: `a woman's bare feet resting on a folded white towel at the edge of a pedicure basin with warm water and a few rose petals, calm spa atmosphere, no face` },
  kicker: { default: 'טיפוח כפות הרגליים' },
  headline: { default: 'זמן לפנק את הרגליים', maxLength: 40 },
  subline: { default: 'פדיקור מרגיע לרגליים רכות ומטופחות' },
  cta: { default: 'לקביעת תור' },
};

export const NAILS: CreamDef[] = [
  nailBeforeAfter, nailArtShowcase, nailGelOffer, nailReview, nailTip, nailPedicureTreatment,
];
