// lib/design/reels/pack-concepts.ts
//
// Eight reels from the first Kalmea pack whose idea the library did not have: a clinic tour, "before you buy
// a serum", "before your appointment", "what does your skin need", a gift voucher, "before the appointment"
// for nails, choosing a shape, and from inspiration to design. Built with the frame kit like the rest of the
// pack (lib/design/reels/pack.ts), so they share its rules: words and contact inside the safe zone, text on a
// ground its colour role reads on, the booking button and her contact on the last scene only.
//
// Copy is an invitation. Nothing here states a price, a duration, a result or an offer's terms; the gift
// voucher says it exists and sends her to a message.

import type { Category, ColorRole } from '../contract.ts';
import type { FieldKey } from '../../businessFields.ts';
import type { ReelTemplate } from '../reel.ts';
import { closing, detail, headline, label, photoSlot, reel, strip, FULL, type Copy, type Kit } from './pack.ts';

const COSMETICS: FieldKey[] = ['cosmetics'];
const NAILS: FieldKey[] = ['nails'];

type Decor = 'rings' | 'burst' | 'frame' | 'wave';

/** A reel with no picture: a colour ground, one quiet moving graphic, big words. */
function plain(o: { key: string; name: string; description: string; category: Category; fields: FieldKey[]; bg: ColorRole; decor: Decor; copy: Copy; vibe: string }): ReelTemplate {
  return reel({
    key: o.key, name: o.name, description: o.description, category: o.category, fields: o.fields, copy: o.copy, vibe: o.vibe, motion: 'none', needs: [],
    draw: (k: Kit) => {
      k.f.shape(FULL, o.bg, { id: 'bg' });
      strip(k, 'ink');
      label(k, { x: 64, y: 350, w: 360, h: 64 }, 'primary', 'contrast');
      if (o.decor === 'rings') k.f.graphic('rings', { x: 140, y: 520, w: 800, h: 800 }, 'deep', { params: { count: 6 }, id: 'rings' });
      if (o.decor === 'burst') {
        k.f.graphic('burst', { x: 760, y: 470, w: 150, h: 150 }, 'primary', { motion: 'spin', params: { points: 5 }, id: 'star-a' });
        k.f.graphic('burst', { x: 130, y: 1180, w: 80, h: 80 }, 'primary', { motion: 'spin', id: 'star-b' });
      }
      if (o.decor === 'frame') k.f.graphic('frame', { x: 80, y: 480, w: 920, h: 900 }, 'ink', { params: { radius: 60 }, id: 'frame' });
      if (o.decor === 'wave') k.f.graphic('wave', { x: -60, y: 1240, w: 1200, h: 800 }, 'tint', { motion: 'wave', params: { amp: 70 }, id: 'wave' });
      headline(k, { x: 110, y: 620, w: 860, h: 400 }, { size: 112, color: 'ink', align: 'center' });
      if (k.i === 0) detail(k, { x: 100, y: 1060, w: 880, h: 70 }, 'ink', { size: 38, align: 'center' });
      if (k.last) closing(k, 1340, 'primary', 'contrast', 'ink');
    },
  });
}

const tour = reel({
  key: 'pk-skin-clinic-tour-reel', name: 'סיור בקליניקה', description: 'שלוש תמונות של הקליניקה שלך, וכותרות שמזמינות להכיר: ברוכה הבאה, כאן מתחיל הרגע שלך, נתראה.',
  category: 'announce', fields: COSMETICS, vibe: 'רגוע ומזמין', motion: 'kenburns', needs: ['שלוש תמונות של הקליניקה שלך'],
  copy: { label: 'סיור בקליניקה', headlines: ['ברוכה הבאה\nלקליניקה שלי.', 'כאן מתחיל\nהרגע שלך.', 'נתראה\nבטיפול הבא?'], detail: 'הקליניקה שלי, בשבילך' },
  draw: (k) => {
    // a different picture per scene: this is a tour, so the slots are the scene's own (s1_photo, s2_photo, s3_photo)
    const base = photoSlot('a bright calm skincare clinic interior, a treatment bed with a folded white towel, soft natural light, plants, warm neutral tones');
    const s = k.f.slot({ ...base, key: 'photo', label: `תמונה ${k.i + 1}` });
    k.f.image(s, FULL, { overlay: { color: 'ink', opacity: 0.3, direction: 'flat' }, id: 'photo' });
    strip(k, 'surface');
    label(k, { x: 64, y: 350, w: 360, h: 64 });
    const top = k.last ? 1000 : 1130;
    k.f.shape({ x: 60, y: top, w: 960, h: 1560 - top }, 'surface', { radius: 48, id: 'card' });
    headline(k, { x: 100, y: top + 30, w: 880, h: 230 }, { size: 92, color: 'ink' });
    if (k.last) {
      detail(k, { x: 100, y: top + 270, w: 880, h: 60 }, 'ink');
      closing(k, top + 350, 'primary', 'contrast', 'ink');
    }
  },
});

const serum = plain({
  key: 'pk-skin-serum-reel', name: 'לפני שקונים סרום', description: 'שלוש שורות: לפני שקונים סרום, שואלים מה העור צריך, ובוחרים יחד. ללא תמונה.',
  category: 'tip', fields: COSMETICS, bg: 'blush', decor: 'rings', vibe: 'רגוע',
  copy: { label: 'לפני הקנייה', headlines: ['לפני שקונים\nסרום.', 'שואלים קודם:\nמה העור צריך?', 'ובוחרים\nיחד איתי.'], detail: 'בלי למהר, בלי לנחש' },
});

const prep = plain({
  key: 'pk-skin-before-appointment-reel', name: 'לפני התור שלך', description: 'הזמנה קצרה: כמה דברים קטנים שכדאי לדעת לפני הטיפול, בהודעה אליך. ללא תמונה.',
  category: 'announce', fields: COSMETICS, bg: 'sand', decor: 'frame', vibe: 'עדין',
  copy: { label: 'לפני הטיפול', headlines: ['לפני התור\nשלך.', 'כמה דברים קטנים\nשכדאי לדעת.', 'שלחי הודעה\nונשלח לך.'], detail: 'ההכנה לטיפול, בקצרה' },
});

const needs = plain({
  key: 'pk-skin-needs-reel', name: 'מה העור שלך צריך', description: 'שאלה שפותחת שיחה: מה העור שלך צריך? מתחילות בשאלה ובוחרות יחד. ללא תמונה.',
  category: 'tip', fields: COSMETICS, bg: 'surface', decor: 'burst', vibe: 'חם',
  copy: { label: 'היכרות עם העור', headlines: ['מה העור\nשלך צריך?', 'כל עור\nמתחיל בשאלה.', 'בואי נברר\nיחד.'], detail: 'שיחה קצרה על העור שלך' },
});

const gift = plain({
  key: 'pk-skin-gift-reel', name: 'שובר מתנה', description: 'מתנה של זמן לעצמה: שובר לטיפול, והזמנה לשלוח הודעה לפרטים. בלי מחיר. ללא תמונה.',
  category: 'offer', fields: COSMETICS, bg: 'blush', decor: 'burst', vibe: 'חגיגי ועדין',
  copy: { label: 'שובר מתנה', headlines: ['מתנה\nשמרגישים.', 'זמן לעצמה,\nבשובר מתנה.', 'לפרטים,\nשלחי הודעה.'], detail: 'שובר לטיפול, בדיוק בשבילה' },
});

const nailPrep = plain({
  key: 'pk-nail-before-appointment-reel', name: 'לפני התור', description: 'מזמינה להגיע עם רעיון, תמונה או גוון שאהבת, ולבנות את הסט יחד. ללא תמונה.',
  category: 'announce', fields: NAILS, bg: 'surface', decor: 'frame', vibe: 'קליל',
  copy: { label: 'לפני התור', headlines: ['לפני שמגיעות\nלתור.', 'רעיון, תמונה\nאו גוון שאהבת.', 'מביאות,\nובונות יחד.'], detail: 'כל סט מתחיל ברעיון' },
});

const shape = plain({
  key: 'pk-nail-shape-reel', name: 'איזו צורה מתאימה לך', description: 'שאלה על צורת הציפורן: עגולה, שקד או מרובעת, ובחירה משותפת בתור. ללא תמונה.',
  category: 'tip', fields: NAILS, bg: 'tint', decor: 'wave', vibe: 'קליל',
  copy: { label: 'בוחרות צורה', headlines: ['איזו צורה\nמתאימה לך?', 'עגולה, שקד\nאו מרובעת.', 'בוחרות יחד\nבתור.'], detail: 'לכל יד הצורה שלה' },
});

const inspiration = plain({
  key: 'pk-nail-inspiration-reel', name: 'מהשראה לעיצוב', description: 'תמונה שאהבת הופכת לסט: מגיעות עם רעיון, יוצאות עם סט. ללא תמונה.',
  category: 'announce', fields: NAILS, bg: 'blush', decor: 'burst', vibe: 'שובב',
  copy: { label: 'השראה', headlines: ['מהשראה\nלעיצוב.', 'תמונה שאהבת,\nסט שלך.', 'בואי נעצב\nיחד.'], detail: 'מגיעות עם רעיון, יוצאות עם סט' },
});

export const PACK_CONCEPT_REELS: ReelTemplate[] = [tour, serum, prep, needs, gift, nailPrep, shape, inspiration];
