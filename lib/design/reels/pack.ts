// lib/design/reels/pack.ts
//
// The Kalmea pack's reels, composed with the frame kit (lib/design/templates/pack/kit.ts): eighteen
// three-scene, ten-second 9:16 sequences.
//
//   photo reels      one picture for the whole reel (a shared slot, chosen from her gallery) under words
//   graphic reels    no picture at all: waves, a calendar, bottles - drawn by graphic layers that move
//   presenter reels  an AI character (or her own photo), the same character on all three scenes
//
// Rules every scene here follows (tests: test-design-pack.ts):
//   - words and contact stay inside the reel safe zone (lib/design/safeZone.ts, y 250..1580, x 64..1016)
//   - colours are roles; text sits on a ground it reads on (test-design-contrast.ts SAFE_PAIRS)
//   - the booking call to action and her contact appear once, on the last scene, never over a moving picture
//
// The copy is an invitation to book. It claims no result, no price and no offer terms; where a template says
// "an offer" the detail is hers to write.

import type { Category, ColorRole } from '../contract.ts';
import type { FieldKey } from '../../businessFields.ts';
import { makeReel, type Motion, type ReelScene, type ReelTemplate, type Transition } from '../reel.ts';
import { Frame, aiLabel, type Px } from '../templates/pack/kit.ts';
import { CTA_DEFAULT, PRESENTERS, presenterSlot, type PresenterSet } from '../templates/pack/presenters.ts';

export const FULL: Px = { x: 0, y: 0, w: 1080, h: 1920 };
const SECONDS = [3.3, 3.4, 3.3];
const SCENE_LABELS = ['פתיחה', 'המשך', 'סיום'];
const TRANSITIONS: Transition[] = ['cut', 'fade', 'fade'];

export type Copy = { label: string; headlines: [string, string, string]; detail: string };

export type Kit = { f: Frame; i: number; last: boolean; copy: Copy };

export function headline(k: Kit, box: Px, o: { size: number; color: ColorRole; align?: 'right' | 'center'; lines?: number; font?: 'display' | 'body' }) {
  const key = k.f.v('headline', 'כותרת', k.copy.headlines[k.i], { max: 60, lineBreaks: true });
  k.f.text(key, box, { font: o.font || 'display', size: o.size, weight: 700, color: o.color, align: o.align || 'right', maxLines: o.lines || 2, lineHeight: 1.1, id: 'headline' });
}

/**
 * The small label pill of the first scene. It sits at the right margin, under her name (a right-to-left page
 * starts at the right); a layout that places it somewhere on purpose passes `placed`.
 */
export function label(k: Kit, box: Px, color: ColorRole = 'primary', fg: ColorRole = 'contrast', placed = false) {
  if (k.i !== 0) return;
  const key = k.f.v('label', 'תווית', k.copy.label, { max: 26 });
  const at = placed ? box : { ...box, x: 1016 - box.w };
  k.f.text(key, at, { font: 'accent', size: 30, weight: 700, color: fg, align: 'right', maxLines: 1, pill: { color, radius: 40, padding: 24 }, id: 'label' });
}

export function detail(k: Kit, box: Px, color: ColorRole, o: { size?: number; align?: 'right' | 'center'; weight?: 400 | 500 | 600 } = {}) {
  const key = k.f.v('detail', 'שורה נוספת', k.copy.detail, { max: 50 });
  k.f.text(key, box, { size: o.size || 36, weight: o.weight || 500, color, align: o.align || 'right', maxLines: 1, id: 'detail' });
}

/** Booking button and her contact: last scene only. `bg`/`fg` are a role pair that reads. */
export function closing(k: Kit, y: number, bg: ColorRole, fg: ColorRole, contactColor: ColorRole) {
  const cta = k.f.v('cta', 'הזמנה לפעולה', CTA_DEFAULT, { max: 36, kind: 'cta' });
  k.f.shape({ x: 100, y, w: 880, h: 92 }, bg, { radius: 46, id: 'cta-pill' });
  k.f.text(cta, { x: 100, y, w: 880, h: 92 }, { size: 40, weight: 700, color: fg, align: 'center', maxLines: 1, id: 'cta' });
  const contact = k.f.v('contact', 'טלפון ואינסטגרם', '', { source: 'contact', max: 80 });
  k.f.text(contact, { x: 64, y: y + 104, w: 952, h: 46 }, { size: 30, weight: 600, color: contactColor, align: 'center', maxLines: 1, id: 'contact' });
}

export function strip(k: Kit, color: ColorRole) { k.f.logo({ x: 64, y: 270, w: 952, h: 72 }, color); }

export type ReelDef = {
  key: string;
  name: string;
  description: string;
  category: Category;
  fields: FieldKey[];
  copy: Copy;
  vibe: string;
  motion: Motion;
  needs: string[];
  caption?: string;
  draw: (k: Kit) => void;
};

export function reel(d: ReelDef): ReelTemplate {
  const scenes: ReelScene[] = SECONDS.map((seconds, i) => {
    const f = new Frame('story');
    d.draw({ f, i, last: i === 2, copy: d.copy });
    const frame = f.build({
      key: `${d.key}-s${i + 1}`, category: d.category, group: 'evergreen', fields: d.fields,
      name: `${d.name} · ${SCENE_LABELS[i]}`, description: d.description, needs: [],
    });
    return { id: `s${i + 1}`, seconds, transition: TRANSITIONS[i], motion: d.motion, label: SCENE_LABELS[i], frame };
  });
  return makeReel({
    key: d.key, version: 1, category: d.category, group: 'evergreen', name: d.name, description: d.description, fields: d.fields,
    musicVibe: d.vibe, needs: d.needs, ...(d.caption ? { suggestedCaption: d.caption } : {}), scenes,
  });
}

export const photoSlot = (aiHint: string) => ({
  key: 'shared_photo',
  label: 'התמונה של הרילס',
  sources: ['gallery', 'clinic', 'hero', 'upload', 'ai', 'previous'] as ('gallery' | 'clinic' | 'hero' | 'upload' | 'ai' | 'previous')[],
  aiHint,
  required: true,
});
export const PHOTO_NEEDS = ['תמונה אחת, מהגלריה שלך או מ-AI'];
export const NAILS: FieldKey[] = ['nails'];
export const BOTH: FieldKey[] = ['cosmetics', 'nails'];

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// Photo reels (nails): one picture, three lines of words
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const french = reel({
  key: 'pk-nail-french-reel', name: 'פרנץ׳ מדויק', description: 'תמונה אחת של עבודה, ושלוש שורות: נקי, מדויק, שלך. כרטיס שעולה מלמטה והזמנה לתור.',
  category: 'treatment', fields: NAILS, vibe: 'רגוע ונקי', motion: 'kenburns', needs: PHOTO_NEEDS,
  copy: { label: 'פרנץ׳ עדין', headlines: ['נקי.\nמדויק. שלך.', 'הפרטים הקטנים\nשעושים את ההבדל.', 'הסט הבא שלך\nמחכה כאן.'], detail: 'קלאסיקה שתמיד מתאימה' },
  draw: (k) => {
    const s = k.f.slot(photoSlot('an elegant adult hand with short almond-shaped milky pink nails and fine classic white French tips resting on warm ivory linen, soft side window light, macro photography, quiet luxury'));
    k.f.image(s, FULL, { overlay: { color: 'surface', opacity: 0.9, direction: 'top' }, id: 'photo' });
    strip(k, 'ink');
    label(k, { x: 64, y: 350, w: 420, h: 64 });
    const top = k.last ? 1010 : 1130;
    k.f.shape({ x: 70, y: top, w: 940, h: 1540 - top }, 'surface', { radius: 36, id: 'card' });
    headline(k, { x: 110, y: top + 30, w: 860, h: 210 }, { size: 98, color: 'ink' });
    if (k.last) {
      detail(k, { x: 110, y: top + 250, w: 860, h: 60 }, 'ink');
      closing(k, top + 330, 'primary', 'contrast', 'ink');
    }
  },
});

const burgundy = reel({
  key: 'pk-nail-burgundy-reel', name: 'בורדו עם אופי', description: 'צבע עמוק על רקע כהה: כותרת גדולה, כוכב שמסתובב והזמנה לתור.',
  category: 'treatment', fields: NAILS, vibe: 'עמוק ואלגנטי', motion: 'kenburns', needs: PHOTO_NEEDS,
  copy: { label: 'סט עם נוכחות', headlines: ['צבע אחד.\nהרבה אופי.', 'יש גוונים\nשפשוט מרגישים נכון.', 'קובעות\nסט חדש?'], detail: 'בורדו עמוק עם נוכחות' },
  draw: (k) => {
    const s = k.f.slot(photoSlot('a hand with deep burgundy glossy nails resting on dark red velvet, dramatic soft light, macro, rich colour'));
    k.f.image(s, FULL, { overlay: { color: 'ink', opacity: 0.55, direction: 'flat' }, id: 'photo' });
    strip(k, 'surface');
    label(k, { x: 64, y: 350, w: 420, h: 64 });
    headline(k, { x: 90, y: 460, w: 900, h: 250 }, { size: 103, color: 'surface' });
    k.f.shape({ x: 740, y: 740, w: 250, h: 6 }, 'primary', { id: 'rule' });
    k.f.graphic('burst', { x: 800, y: 1120, w: 110, h: 110 }, 'surface', { motion: 'spin', id: 'star-a' });
    k.f.graphic('burst', { x: 130, y: 1260, w: 56, h: 56 }, 'primary', { motion: 'spin', id: 'star-b' });
    if (k.last) {
      detail(k, { x: 100, y: 1250, w: 880, h: 60 }, 'surface');
      closing(k, 1340, 'surface', 'ink', 'surface');
    }
  },
});

const studio = reel({
  key: 'pk-nail-studio-reel', name: 'מאחורי הסט', description: 'מבט מאחורי הקלעים: תמונה בכרטיס מעוגל עם טבעת, וכותרת שמתחלפת.',
  category: 'treatment', fields: NAILS, vibe: 'חם ואישי', motion: 'kenburns', needs: PHOTO_NEEDS,
  copy: { label: 'מאחורי הקלעים', headlines: ['מאחורי כל סט\nיש דיוק.', 'מהצורה\nעד הפרט האחרון.', 'נפגשות\nבסטודיו?'], detail: 'עבודה עם תשומת לב' },
  draw: (k) => {
    k.f.shape(FULL, 'surface', { id: 'bg' });
    const s = k.f.slot(photoSlot('a nail artist at work, hands close up painting a nail, bright studio, warm natural light'));
    strip(k, 'ink');
    headline(k, { x: 90, y: 380, w: 900, h: 220 }, { size: 94, color: 'ink' });
    k.f.image(s, { x: 70, y: 640, w: 940, h: 740 }, { radius: 60, id: 'photo' });
    k.f.graphic('rings', { x: 760, y: 610, w: 230, h: 90 }, 'primary', { params: { count: 1 }, rotate: -12, id: 'ring' });
    label(k, { x: 110, y: 1300, w: 460, h: 64 }, 'surface', 'ink', true);
    if (k.last) closing(k, 1420, 'primary', 'contrast', 'ink');
  },
});

const nude = reel({
  key: 'pk-nail-nude-reel', name: 'רגע לעצמך', description: 'תמונה באליפסה עם טבעת דקה, וניוד עדין: רגע לעצמך עד קצות האצבעות.',
  category: 'treatment', fields: NAILS, vibe: 'רך ורגוע', motion: 'kenburns', needs: PHOTO_NEEDS,
  copy: { label: 'מניקור בגוון נוד', headlines: ['רגע לעצמך.\nעד קצות האצבעות.', 'נוד עדין.\nתחושה נעימה.', 'זה הזמן\nלתור שלך.'], detail: 'בדיוק בסגנון שלך' },
  draw: (k) => {
    k.f.shape(FULL, 'blush', { id: 'bg' });
    const s = k.f.slot(photoSlot('a hand with soft nude glossy nails resting gently on a pale neutral surface, soft natural light, macro, calm mood'));
    strip(k, 'ink');
    headline(k, { x: 90, y: 370, w: 900, h: 230 }, { size: 98, color: 'ink' });
    k.f.image(s, { x: 150, y: 640, w: 780, h: 640 }, { radius: 999, id: 'photo' });
    k.f.graphic('rings', { x: 120, y: 610, w: 840, h: 700 }, 'primary', { params: { count: 1 }, rotate: 3, id: 'ring' });
    label(k, { x: 300, y: 1320, w: 480, h: 64 }, 'surface', 'ink', true);
    if (k.last) closing(k, 1410, 'primary', 'contrast', 'ink');
  },
});

const art = reel({
  key: 'pk-nail-art-reel', name: 'נייל ארט קטן', description: 'שני צילומים מוטים כמו פולארואידים על שולחן, וכוכב מסתובב.',
  category: 'treatment', fields: NAILS, vibe: 'שובב ומוקפד', motion: 'none', needs: PHOTO_NEEDS,
  copy: { label: 'נייל ארט', headlines: ['קטן בפרטים.\nגדול בסטייל.', 'הטאץ׳\nשהוא רק שלך.', 'מה נצייר\nבסט הבא?'], detail: 'בוחרות ביחד את העיצוב' },
  draw: (k) => {
    k.f.shape(FULL, 'blush', { id: 'bg' });
    const s = k.f.slot(photoSlot('a hand with small delicate nail art, fine lines and tiny dots, pink background, soft light, macro'));
    strip(k, 'ink');
    headline(k, { x: 80, y: 370, w: 920, h: 230 }, { size: 104, color: 'ink' });
    k.f.polaroid(s, { cx: 420, cy: 960, w: 580, h: 700, border: 26, bottom: 96, deg: -5 });
    k.f.polaroid(s, { cx: 650, cy: 1090, w: 500, h: 620, border: 24, bottom: 90, deg: 6 });
    k.f.graphic('burst', { x: 800, y: 620, w: 130, h: 130 }, 'primary', { motion: 'spin', params: { points: 5 }, id: 'star' });
    if (k.last) closing(k, 1400, 'primary', 'contrast', 'ink');
  },
});

const chrome = reel({
  key: 'pk-nail-chrome-reel', name: 'כרום בגוון קרח', description: 'ברק כחלחל: תמונה מלאה עם כוכבים צפים וכותרת בחלק העליון.',
  category: 'treatment', fields: NAILS, vibe: 'מבריק ונקי', motion: 'kenburns', needs: PHOTO_NEEDS,
  copy: { label: 'כרום כחול', headlines: ['ברק\nשאי אפשר לפספס.', 'קצת כרום.\nהרבה סטייל.', 'מוכנה\nלסט הבא?'], detail: 'כרום בגוון קרח' },
  draw: (k) => {
    const s = k.f.slot(photoSlot('a hand with icy blue chrome mirror nails, cool silver light, macro, clean background'));
    k.f.image(s, FULL, { overlay: { color: 'surface', opacity: 0.95, direction: 'top' }, id: 'photo' });
    strip(k, 'ink');
    headline(k, { x: 90, y: 380, w: 900, h: 230 }, { size: 105, color: 'ink' });
    for (let n = 0; n < 3; n++) k.f.graphic('burst', { x: 160 + n * 330, y: 820 + (n % 2) * 140, w: 60 + n * 14, h: 60 + n * 14 }, 'surface', { motion: 'float', id: `star-${n}` });
    label(k, { x: 100, y: 1380, w: 420, h: 64 }, 'surface', 'ink', true);
    if (k.last) closing(k, 1380, 'ink', 'surface', 'ink');
  },
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// Graphic reels: no picture, moving shapes
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const shades = reel({
  key: 'pk-nail-shades-reel', name: 'איזה גוון את', description: 'גלי צבע וגוונים שצפים: איזה גוון את היום? ללא תמונה.',
  category: 'treatment', fields: NAILS, vibe: 'קליל ושמח', motion: 'none', needs: [],
  copy: { label: 'מבחר גוונים', headlines: ['איזה גוון\nאת היום?', 'עדין?\nנועז?', 'הצבע שלך.\nהבחירה שלך.'], detail: 'בוחרות גוון, מתחילות מחדש' },
  draw: (k) => {
    k.f.shape(FULL, 'blush', { id: 'bg' });
    strip(k, 'ink');
    headline(k, { x: 80, y: 420, w: 920, h: 300 }, { size: 120, color: 'ink', align: 'center' });
    k.f.graphic('wave', { x: -60, y: 700, w: 1200, h: 1300 }, 'tint', { motion: 'wave', params: { amp: 75 }, id: 'wave-a' });
    k.f.graphic('wave', { x: -60, y: 1000, w: 1200, h: 1000 }, 'primary', { motion: 'wave', params: { amp: 85, dir: -1, phase: 2 }, id: 'wave-b' });
    k.f.graphic('wave', { x: -60, y: 1440, w: 1200, h: 600 }, 'sand', { motion: 'wave', params: { amp: 68 }, id: 'wave-c' });
    k.f.graphic('swatches', { x: 110, y: 1040, w: 860, h: 190 }, 'primary', { colors: ['surface', 'tint', 'deep', 'sand'], motion: 'float', id: 'dots' });
    if (k.i === 0) detail(k, { x: 90, y: 1280, w: 900, h: 70 }, 'contrast', { size: 38, align: 'center' });
    label(k, { x: 64, y: 350, w: 340, h: 64 }, 'ink', 'surface');
    if (k.last) {
      // the wave under her contact moves; the band is the ground that always reads
      k.f.shape({ x: 100, y: 1484, w: 880, h: 60 }, 'surface', { radius: 30, id: 'contact-band' });
      closing(k, 1380, 'ink', 'surface', 'ink');
    }
  },
});

const fresh = reel({
  key: 'pk-nail-new-reel', name: 'משהו חדש', description: 'מדבקות וכוכב גדול שמסתובב בתוך מסגרת מקווקווה: משהו חדש על הציפורניים.',
  category: 'announce', fields: NAILS, vibe: 'עליז', motion: 'none', needs: [],
  copy: { label: 'חדש בסטודיו', headlines: ['משהו חדש\nעל הציפורניים.', 'סט קטן.\nמצב רוח גדול.', 'בא לך\nלהתחדש?'], detail: 'בדיוק הזמן לסט חדש' },
  draw: (k) => {
    k.f.shape(FULL, 'surface', { id: 'bg' });
    strip(k, 'ink');
    k.f.graphic('frame', { x: 65, y: 380, w: 950, h: 1180 }, 'ink', { params: { radius: 50 }, id: 'frame' });
    k.f.graphic('burst', { x: 100, y: 500, w: 330, h: 330 }, 'primary', { motion: 'spin', params: { points: 12 }, id: 'sticker' });
    label(k, { x: 130, y: 635, w: 270, h: 70 }, 'surface', 'ink', true);
    k.f.graphic('burst', { x: 800, y: 500, w: 110, h: 110 }, 'ink', { motion: 'spin', id: 'star' });
    headline(k, { x: 98, y: 900, w: 890, h: 300 }, { size: 120, color: 'ink', align: 'center' });
    k.f.shape({ x: 250, y: 1230, w: 580, h: 12 }, 'primary', { radius: 6, id: 'rule' });
    if (k.i === 0) detail(k, { x: 100, y: 1280, w: 880, h: 70 }, 'ink', { size: 38, align: 'center' });
    if (k.last) closing(k, 1320, 'primary', 'contrast', 'ink');
  },
});

const time = reel({
  key: 'pk-nail-time-reel', name: 'זמן לסט חדש', description: 'כותרת גדולה על רקע פשוט, עם כוכב שמסתובב: זה הזמן לסט חדש.',
  category: 'announce', fields: NAILS, vibe: 'קצבי', motion: 'none', needs: [],
  copy: { label: 'זמן לציפורניים', headlines: ['זה הזמן\nלסט חדש.', 'בחרי גוון.\nתני לו אופי.', 'התור הבא\nהוא שלך.'], detail: 'מקדישות רגע גם לעצמך' },
  draw: (k) => {
    k.f.shape(FULL, 'sand', { id: 'bg' });
    // a faint wall of her own name behind the words; decoration, so it is allowed to sit anywhere
    const name = k.f.v('name', 'שם העסק', 'שם העסק', { source: 'business_name', max: 40 });
    for (let n = 0; n < 3; n++) k.f.text(name, { x: 64, y: 330 + n * 330, w: 952, h: 240 }, { font: 'display', size: 176, weight: 900, color: 'blush', align: 'center', maxLines: 1, id: `wall-${n}` });
    strip(k, 'ink');
    label(k, { x: 64, y: 350, w: 360, h: 64 }, 'primary', 'contrast');
    headline(k, { x: 80, y: 800, w: 920, h: 340 }, { size: 130, color: 'ink', align: 'center' });
    k.f.shape({ x: 180, y: 1180, w: 720, h: 21 }, 'primary', { radius: 9, id: 'rule' });
    k.f.graphic('burst', { x: 830, y: 470, w: 150, h: 150 }, 'primary', { motion: 'spin', id: 'star' });
    if (k.i === 0) detail(k, { x: 90, y: 1250, w: 900, h: 70 }, 'ink', { size: 38, align: 'center' });
    if (k.last) closing(k, 1300, 'primary', 'contrast', 'ink');
  },
});

const diary = reel({
  key: 'pk-open-diary-reel', name: 'פותחות יומן', description: 'לוח שנה שמתנדנד עם יום מסומן: פותחות יומן לתורים חדשים. מתאים לקוסמטיקה ולמניקור.',
  category: 'announce', fields: BOTH, vibe: 'קליל', motion: 'none', needs: [],
  copy: { label: 'תורים חדשים', headlines: ['פותחות\nיומן.', 'בוחרות תור.\nבוחרות רגע לעצמך.', 'יש לך\nמקום ביומן.'], detail: 'הימים הפנויים בהודעה פרטית' },
  draw: (k) => {
    k.f.shape(FULL, 'blush', { id: 'bg' });
    strip(k, 'ink');
    label(k, { x: 64, y: 350, w: 340, h: 64 }, 'primary', 'contrast');
    headline(k, { x: 90, y: 440, w: 900, h: 240 }, { size: 114, color: 'ink' });
    k.f.graphic('calendar', { x: 110, y: 740, w: 860, h: 640 }, 'primary', { color2: 'deep', motion: 'tilt', id: 'calendar' });
    if (k.last) closing(k, 1420, 'primary', 'contrast', 'ink');
    else detail(k, { x: 110, y: 1430, w: 860, h: 70 }, 'ink', { size: 36, align: 'center' });
  },
});

const duel = reel({
  key: 'pk-nail-pink-red-reel', name: 'ורוד או אדום', description: 'שתי בקבוקים, שני גוונים: מצביעות. ורוד עדין או אדום נועז?',
  category: 'treatment', fields: NAILS, vibe: 'משחקי', motion: 'none', needs: [],
  copy: { label: 'ורוד עדין', headlines: ['ורוד עדין\nאו אדום נועז?', 'איזה גוון\nעושה לך את זה?', 'כתבי לי\nמה את בוחרת.'], detail: 'אדום נועז' },
  draw: (k) => {
    k.f.shape(FULL, 'surface', { id: 'bg' });
    k.f.shape({ x: 540, y: 0, w: 540, h: 1920 }, 'primary', { id: 'half' });
    k.f.shape({ x: 60, y: 250, w: 960, h: 470 }, 'surface', { radius: 48, id: 'band' });
    strip(k, 'ink');
    headline(k, { x: 100, y: 400, w: 880, h: 300 }, { size: 100, color: 'ink', align: 'center' });
    k.f.graphic('rings', { x: 100, y: 900, w: 880, h: 340 }, 'ink', { params: { count: 1 }, rotate: -5, id: 'ring' });
    k.f.graphic('bottle', { x: 250, y: 930, w: 160, h: 240 }, 'primary', { color2: 'ink', motion: 'float', id: 'bottle-a' });
    k.f.graphic('bottle', { x: 670, y: 930, w: 160, h: 240 }, 'surface', { color2: 'ink', motion: 'float', id: 'bottle-b' });
    const a = k.f.v('left_name', 'שם הגוון מימין', 'ורוד עדין', { max: 20 });
    const b = k.f.v('right_name', 'שם הגוון משמאל', k.copy.detail, { max: 20 });
    k.f.text(a, { x: 130, y: 1270, w: 340, h: 64 }, { font: 'accent', size: 30, weight: 700, color: 'ink', align: 'center', maxLines: 1, pill: { color: 'surface', radius: 40, padding: 24 }, id: 'name-a' });
    k.f.text(b, { x: 610, y: 1270, w: 340, h: 64 }, { font: 'accent', size: 30, weight: 700, color: 'ink', align: 'center', maxLines: 1, pill: { color: 'surface', radius: 40, padding: 24 }, id: 'name-b' });
    if (k.last) {
      // her contact sits across the colour split: on a band that reads on both halves
      k.f.shape({ x: 100, y: 1494, w: 880, h: 60 }, 'surface', { radius: 30, id: 'contact-band' });
      closing(k, 1390, 'ink', 'surface', 'ink');
    }
  },
});

const offer = reel({
  key: 'pk-offer-reel', name: 'הטבה בסטודיו', description: 'רקע כהה, טבעות וכוכב שמסתובב: משהו טוב מחכה. הפרטים של ההטבה שלך. מתאים לקוסמטיקה ולמניקור.',
  category: 'offer', fields: BOTH, vibe: 'חגיגי', motion: 'none', needs: [],
  copy: { label: 'הטבה מיוחדת', headlines: ['משהו טוב\nמחכה אצלי.', 'הטבה קטנה.\nסיבה להתחדש.', 'רוצה פרטים?\nשלחי הודעה.'], detail: 'הפרטים בהודעה פרטית' },
  draw: (k) => {
    k.f.shape(FULL, 'ink', { id: 'bg' });
    strip(k, 'surface');
    label(k, { x: 64, y: 350, w: 380, h: 64 }, 'primary', 'contrast');
    k.f.graphic('rings', { x: 140, y: 560, w: 800, h: 800 }, 'surface', { params: { count: 6 }, id: 'rings' });
    k.f.graphic('burst', { x: 760, y: 470, w: 130, h: 130 }, 'primary', { motion: 'spin', id: 'star-a' });
    k.f.graphic('burst', { x: 150, y: 1280, w: 76, h: 76 }, 'primary', { motion: 'spin', id: 'star-b' });
    headline(k, { x: 90, y: 740, w: 900, h: 400 }, { size: 120, color: 'surface', align: 'center', lines: 3 });
    if (k.i < 2) detail(k, { x: 100, y: 1210, w: 880, h: 70 }, 'surface', { size: 36, align: 'center' });
    if (k.last) closing(k, 1330, 'primary', 'contrast', 'surface');
  },
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// Presenter reels: an AI character (or her own photo), the same picture on all three scenes
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────

function presenterReel(c: PresenterSet): ReelTemplate {
  return reel({
    key: `pk-${c.slug}-reel`, name: `מגישה · ${c.name}`,
    description: 'שלוש סצנות עם דמות AI שמזמינה לקבוע תור. אפשר להחליף את הדמות בתמונה שלך, ואז התווית נעלמת.',
    category: c.category, fields: [c.field], vibe: 'חם ועדין', motion: 'kenburns', needs: [],
    caption: c.caption,
    copy: { label: c.badge, headlines: c.headlines, detail: c.detail },
    draw: (k) => {
      const slot = k.f.slot(presenterSlot('shared_presenter', c));
      k.f.image(slot, FULL, { focus: { x: 0.5, y: 0.2 }, overlay: { color: 'ink', opacity: 0.45, direction: 'top' }, id: 'photo' });
      strip(k, 'surface');
      aiLabel(k.f, slot, { x: 64, y: 360, w: 440, h: 56 }, 'ink', 'surface', 'left');
      label(k, { x: 64, y: 436, w: 340, h: 60 });
      const top = k.last ? 1000 : 1130;
      k.f.shape({ x: 60, y: top, w: 960, h: 1560 - top }, 'surface', { radius: 48, id: 'card' });
      headline(k, { x: 100, y: top + 30, w: 880, h: 230 }, { size: 92, color: 'ink' });
      if (k.last) {
        detail(k, { x: 100, y: top + 270, w: 880, h: 60 }, 'ink');
        closing(k, top + 350, 'primary', 'contrast', 'ink');
      }
    },
  });
}

export const PACK_PHOTO_REELS: ReelTemplate[] = [french, burgundy, studio, nude, art, chrome];
export const PACK_GRAPHIC_REELS: ReelTemplate[] = [shades, fresh, time, diary, duel, offer];
export const PACK_PRESENTER_REELS: ReelTemplate[] = PRESENTERS.map(presenterReel);
export const PACK_REELS: ReelTemplate[] = [...PACK_PHOTO_REELS, ...PACK_GRAPHIC_REELS, ...PACK_PRESENTER_REELS];
