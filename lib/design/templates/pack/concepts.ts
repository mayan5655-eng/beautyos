// lib/design/templates/pack/concepts.ts
//
// Eight post concepts from the first Kalmea pack that the library did not have yet (checked against every
// cream definition by concept, not by name): a consultation intro, a pre-purchase checklist, "meet your
// cosmetician", a nail-shape picker, a bold-colour post, "time to refresh", "meet your nail tech" and a
// service list. Each is built twice, feed 4:5 and story 9:16, with her name or logo, one headline, one line
// or three short lines, a booking button and her contact.
//
// Both formats keep every word inside the safe zone (lib/design/safeZone.ts: stories, like reels, have
// Instagram's interface drawn over the top and bottom), which the cream story layouts do not.
//
// Copy: an invitation, never a claim about a result, never a price. The service list has no prices on
// purpose: they are hers to type into the lines.

import type { Category, ImageSource, Template } from '../../contract.ts';
import type { FieldKey } from '../../../businessFields.ts';
import { Frame, type Px } from './kit.ts';

type Concept = {
  slug: string;
  name: string;
  description: string;
  field: FieldKey;
  category: Category;
  kind: 'photo' | 'statement';
  kicker: string;
  headline: string;
  sub?: string;
  bullets?: string[];
  cta: string;
  aiHint?: string;
  sources?: ImageSource[];
  needs: string[];
};

const PHOTO_SOURCES: ImageSource[] = ['gallery', 'clinic', 'hero', 'upload', 'ai', 'previous'];
// "Meet her": her own picture. No AI source: an invented face would stand in for her.
const PORTRAIT_SOURCES: ImageSource[] = ['portrait', 'upload', 'gallery', 'clinic', 'previous'];

export const CONCEPTS: Concept[] = [
  {
    slug: 'skin-consultation', name: 'פגישת היכרות עם העור', field: 'cosmetics', category: 'treatment', kind: 'photo',
    description: 'מזמינה לפגישה ראשונה: שיחה קצרה על מה שחשוב לך, ואז בוחרות יחד איך ממשיכות.',
    kicker: 'פגישת היכרות', headline: 'מתחילות בהיכרות עם העור שלך.', sub: 'שיחה קצרה על מה שחשוב לך, ואז בוחרות יחד איך ממשיכות.', cta: 'לקביעת פגישה',
    aiHint: 'two women talking across a small table in a bright, calm skincare clinic, soft natural light, faces not in sharp focus, warm neutral tones', needs: ['תמונה אחת'],
  },
  {
    slug: 'product-checklist', name: 'לפני שקונים עוד מוצר', field: 'cosmetics', category: 'tip', kind: 'statement',
    description: 'שלוש שאלות לשאול לפני קנייה של עוד מוצר טיפוח.',
    kicker: 'לפני שקונים', headline: 'לפני שקונים עוד מוצר, שאלי את עצמך.', bullets: ['מה העור שלי באמת צריך?', 'יש לי כבר משהו דומה?', 'איך זה משתלב בשגרה שלי?'], cta: 'לשאלות, שלחי הודעה',
    needs: [],
  },
  {
    slug: 'meet-cosmetician', name: 'נעים להכיר, קוסמטיקאית', field: 'cosmetics', category: 'announce', kind: 'photo',
    description: 'היכרות אישית עם התמונה שלך: מי את, ואיך נראה מפגש אצלך.',
    kicker: 'נעים להכיר', headline: 'נעים להכיר. אני כאן בשבילך.', sub: 'בקליניקה שלי כל מפגש מתחיל בהקשבה.', cta: 'לקביעת פגישה',
    sources: PORTRAIT_SOURCES, needs: ['תמונה שלך'],
  },
  {
    slug: 'nail-shapes', name: 'בחירת צורת ציפורניים', field: 'nails', category: 'tip', kind: 'statement',
    description: 'שלוש צורות לבחירה: עגולה, שקד ומרובעת. מזמינה לבחור יחד בתור.',
    kicker: 'בוחרות צורה', headline: 'איזו צורה מתאימה לך?', bullets: ['עגולה ועדינה', 'שקד קלאסי', 'מרובעת ובולטת'], cta: 'לקביעת תור, שלחי הודעה',
    needs: [],
  },
  {
    slug: 'nail-bold-colour', name: 'צבע בולט', field: 'nails', category: 'treatment', kind: 'photo',
    description: 'תמונה של עבודה בצבע בולט, וכותרת שמזמינה לבחור גוון.',
    kicker: 'צבע בולט', headline: 'צבע שאי אפשר לפספס.', sub: 'בחרי גוון שמתאים בדיוק לך.', cta: 'לקביעת תור',
    aiHint: 'a hand with bold saturated glossy nails against a soft neutral backdrop, studio light, macro, vivid colour', needs: ['תמונה אחת'],
  },
  {
    slug: 'nail-refresh', name: 'הזמן לחדש', field: 'nails', category: 'announce', kind: 'photo',
    description: 'תזכורת עדינה לחדש את הסט: תור קטן וסט חדש.',
    kicker: 'הגיע הזמן', headline: 'הזמן לרענן את הציפורניים?', sub: 'תור קטן, וסט חדש מחכה לך.', cta: 'לקביעת תור',
    aiHint: 'a freshly manicured hand resting on a soft towel, clean natural nails, calm bright light, macro', needs: ['תמונה אחת'],
  },
  {
    slug: 'meet-nail-tech', name: 'נעים להכיר, מניקוריסטית', field: 'nails', category: 'announce', kind: 'photo',
    description: 'היכרות אישית עם התמונה שלך: מי את, ואיך נראה סט אצלך.',
    kicker: 'נעים להכיר', headline: 'נעים להכיר. אני כאן בשבילך.', sub: 'בסטודיו שלי כל סט מתחיל בהקשבה.', cta: 'לקביעת תור',
    sources: PORTRAIT_SOURCES, needs: ['תמונה שלך'],
  },
  {
    slug: 'nail-services', name: 'השירותים שלי', field: 'nails', category: 'treatment', kind: 'statement',
    description: 'רשימת שירותים קצרה. את כותבת בכל שורה את השירות ואת המחיר שלו.',
    kicker: 'השירותים שלי', headline: 'מה אפשר לקבוע אצלי?', bullets: ['מניקור קלאסי', 'לק ג׳ל', 'עיצוב לבחירתך'], cta: 'לקביעת תור, שלחי הודעה',
    needs: [],
  },
];

function build(c: Concept, format: 'feed45' | 'story'): Template {
  const f = new Frame(format);
  const story = format === 'story';
  const M = 64, IN = 952;
  const headlineVar = f.v('headline', 'כותרת', c.headline, { source: 'user', max: 44, lineBreaks: true, required: true });
  const kicker = f.v('kicker', 'כותרת עליונה', c.kicker, { max: 26 });
  const cta = f.v('cta', 'כפתור', c.cta, { source: 'user', max: 26, kind: 'cta' });
  const contact = f.v('contact', 'טלפון ואינסטגרם', '', { source: 'contact', max: 80 });

  const ctaPill = (y: number, h = 84) => {
    f.shape({ x: M, y, w: IN, h }, 'primary', { radius: h / 2, id: 'cta-pill' });
    f.text(cta, { x: M, y, w: IN, h }, { size: 36, weight: 700, color: 'contrast', align: 'center', maxLines: 1, id: 'cta' });
  };

  if (c.kind === 'photo') {
    const slot = f.slot({ key: 'photo', label: 'תמונה', sources: c.sources || PHOTO_SOURCES, required: true, ...(c.aiHint ? { aiHint: c.aiHint } : {}) });
    const logo: Px = story ? { x: M, y: 270, w: IN, h: 72 } : { x: M, y: 56, w: IN, h: 72 };
    const photo: Px = story ? { x: M, y: 370, w: IN, h: 650 } : { x: M, y: 150, w: IN, h: 620 };
    const kick: Px = story ? { x: M + IN - 420, y: 1050, w: 420, h: 56 } : { x: M + IN - 420, y: 800, w: 420, h: 56 };
    const head: Px = story ? { x: M, y: 1130, w: IN, h: 200 } : { x: M, y: 870, w: IN, h: 180 };
    f.logo(logo, 'ink');
    f.image(slot, photo, { radius: 48, focus: { x: 0.5, y: 0.4 }, id: 'photo' });
    f.text(kicker, kick, { font: 'accent', size: 26, weight: 700, color: 'contrast', align: 'right', maxLines: 1, pill: { color: 'primary', radius: 40, padding: 22 }, id: 'kicker' });
    f.text(headlineVar, head, { font: 'display', size: story ? 88 : 78, weight: 700, color: 'ink', align: 'right', maxLines: 2, lineHeight: 1.1, id: 'headline' });
    if (c.sub) {
      const sub = f.v('subline', 'שורת משנה', c.sub, { source: 'user', max: 80 });
      f.text(sub, story ? { x: M, y: 1340, w: IN, h: 76 } : { x: M, y: 1060, w: IN, h: 76 }, { size: story ? 34 : 32, weight: 400, color: 'ink', align: 'right', maxLines: 2, id: 'subline' });
    }
    ctaPill(story ? 1440 : 1160);
    f.text(contact, story ? { x: M, y: 1534, w: IN, h: 40 } : { x: M, y: 1258, w: IN, h: 40 }, { size: 26, weight: 600, color: 'ink', align: 'center', maxLines: 1, id: 'contact' });
  } else {
    f.shape({ x: 0, y: 0, w: f.W, h: f.H }, 'blush', { id: 'page' });
    f.logo(story ? { x: M, y: 270, w: IN, h: 72 } : { x: M, y: 56, w: IN, h: 72 }, 'ink');
    f.text(kicker, story ? { x: M + IN - 420, y: 400, w: 420, h: 56 } : { x: M + IN - 420, y: 170, w: 420, h: 56 }, { font: 'accent', size: 26, weight: 700, color: 'contrast', align: 'right', maxLines: 1, pill: { color: 'primary', radius: 40, padding: 22 }, id: 'kicker' });
    f.text(headlineVar, story ? { x: M, y: 490, w: IN, h: 400 } : { x: M, y: 250, w: IN, h: 300 }, { font: 'display', size: story ? 108 : 92, weight: 700, color: 'ink', align: 'right', maxLines: 3, lineHeight: 1.08, id: 'headline' });
    const rows = c.bullets || [];
    const y0 = story ? 950 : 610, step = story ? 118 : 100;
    rows.forEach((line, i) => {
      const key = f.v(`line_${i + 1}`, `שורה ${i + 1}`, line, { source: 'user', max: 44 });
      const y = y0 + i * step;
      f.shape({ x: M + IN - 22, y: y + 29, w: 22, h: 22 }, 'primary', { ellipse: true, id: `dot-${i + 1}` });
      f.text(key, { x: M, y, w: IN - 44, h: 80 }, { size: story ? 46 : 42, weight: 600, color: 'ink', align: 'right', maxLines: 1, id: `line-${i + 1}` });
    });
    ctaPill(story ? 1420 : 1000);
    f.text(contact, story ? { x: M, y: 1522, w: IN, h: 40 } : { x: M, y: 1098, w: IN, h: 40 }, { size: 26, weight: 600, color: 'ink', align: 'center', maxLines: 1, id: 'contact' });
  }

  return f.build({
    key: `pk-${c.slug}-${story ? 'story' : 'feed'}`, category: c.category, group: 'evergreen', fields: [c.field],
    name: c.name, description: c.description, needs: c.needs,
  });
}

export const PACK_CONCEPT_POSTS: Template[] = CONCEPTS.flatMap((c) => [build(c, 'feed45'), build(c, 'story')]);
