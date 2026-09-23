// lib/design/templates/cream.ts
//
// The studio look, as one builder. Every template in the launch library is
// a short definition (what it says, which picture, which decoration) and
// this file turns it into two full templates - feed 4:5 and story 9:16 -
// with one geometry:
//
//   - a soft cream page, never white (surface / blush / sand from her hue)
//   - one large photo: a rounded top block, full-bleed with a cream rise,
//     or two client photos side by side
//   - an elegant display headline (Frank Ruhl Libre), a lighter subline
//   - generous air: the text never touches the photo
//   - a pill strip at the bottom with her logo and her contact line
//   - a large price on offers
//   - a delicate line drawing only where the theme asks for one
//
// The spacing scale is 8px at 1080 wide: margin 64, photo radius 48, gaps
// of 8/16/24/40/48. Everything is computed in pixels here and stored as
// percentages, which is what the contract wants; the output is plain data
// like any hand-written template and goes through the same lock file.

import { CANVAS, type Category, type ColorRole, type DecoAsset, type Format, type Layer, type SlotDef, type Template, type VariableDef } from '../contract.ts';

export type CreamDef = {
  /** 'offer' -> keys offer-feed and offer-story. */
  slug: string;
  name: string;
  category: Category;
  description: string;
  needs?: string[];
  holiday?: string;
  versions: { feed: number; story: number };
  /** top = rounded block over the text; bleed = full photo with a cream rise; pair = before/after. */
  photo: 'top' | 'bleed' | 'pair';
  photoSlot?: Partial<Pick<SlotDef, 'sources' | 'aiHint' | 'required' | 'label'>>;
  kicker?: { default: string; maxLength?: number };
  headline: { default: string; maxLength?: number };
  subline?: { default: string; maxLength?: number };
  /** A large price beside the headline (offers, gift cards, packages). */
  price?: { default: string; label?: string; note?: string; required?: boolean };
  /** The testimonial layout: her saved review as a quote instead of headline/subline. */
  quote?: boolean;
  cta?: { default: string } | null;
  deco?: { asset: DecoAsset; color?: ColorRole; opacity?: number; flip?: boolean } | null;
  /** Emphasis of the headline: 700 by default, 900 shouts. */
  headlineWeight?: 700 | 900;
};

type Px = { x: number; y: number; w: number; h: number };

const M = 64;          // page margin
const R = 48;          // photo radius, strip radius
const STRIP_H = 96;

const DEFAULT_SOURCES: SlotDef['sources'] = ['gallery', 'clinic', 'hero', 'upload', 'ai', 'previous'];

/** The per-format numbers: where the photo ends and how large the type is. */
function metrics(format: Format, def: CreamDef) {
  const story = format === 'story';
  return story
    ? { photoBottom: def.quote ? 1064 : 1184, bodyTop: def.quote ? 1100 : 1232, kicker: 26, headline: 92, headlineLines: 3, headlineH: 290, subline: 34, price: 140, priceH: 170, cta: 30, ctaY: 1648, quoteText: 44, quoteLines: 5, quoteH: 300 }
    : { photoBottom: def.quote ? 646 : 748, bodyTop: def.quote ? 670 : 788, kicker: 24, headline: 84, headlineLines: 2, headlineH: 190, subline: 32, price: 128, priceH: 150, cta: 28, ctaY: 1094, quoteText: 40, quoteLines: 4, quoteH: 216 };
}

export function creamTemplate(def: CreamDef, format: 'feed45' | 'story'): Template {
  const canvas = CANVAS[format];
  const W = canvas.w, H = canvas.h;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const pct = (b: Px) => ({ x: r2((b.x / W) * 100), y: r2((b.y / H) * 100), w: r2((b.w / W) * 100), h: r2((b.h / H) * 100) });
  const m = metrics(format, def);
  const cta = def.cta === null ? null : def.cta || { default: 'לקביעת תור' };
  const headlineWeight = def.headlineWeight || 700;

  // ── Variables ──────────────────────────────────────────────────────────────
  const variables: VariableDef[] = [];
  if (def.kicker) variables.push({ key: 'kicker', label: 'כותרת עליונה', kind: 'text', source: 'static', default: def.kicker.default, maxLength: def.kicker.maxLength || 26 });
  if (def.quote) {
    variables.push(
      { key: 'quote_mark', label: 'מרכאות', kind: 'text', source: 'static', default: '״', maxLength: 2 },
      { key: 'review_text', label: 'הביקורת', kind: 'text', source: 'review_text', default: def.headline.default, maxLength: def.headline.maxLength || 200, required: true },
      { key: 'stars', label: 'דירוג', kind: 'stars', source: 'review_rating', default: '★★★★★', maxLength: 5 },
      { key: 'review_name', label: 'שם הלקוחה', kind: 'text', source: 'review_name', default: 'לקוחה', maxLength: 30 },
    );
  } else {
    variables.push({ key: 'headline', label: 'כותרת', kind: 'text', source: 'user', default: def.headline.default, maxLength: def.headline.maxLength || 44, required: true });
    if (def.subline) variables.push({ key: 'subline', label: 'שורת משנה', kind: 'text', source: 'user', default: def.subline.default, maxLength: def.subline.maxLength || 60 });
  }
  if (def.price) {
    variables.push({ key: 'price', label: def.price.label || 'מחיר', kind: 'price', source: 'user', default: def.price.default, maxLength: 12, required: def.price.required !== false });
    if (def.price.note) variables.push({ key: 'price_note', label: 'הערת מחיר', kind: 'text', source: 'static', default: def.price.note, maxLength: 24 });
  }
  if (def.photo === 'pair') {
    variables.push(
      { key: 'label_before', label: 'תווית ימין', kind: 'text', source: 'static', default: 'לפני', maxLength: 10 },
      { key: 'label_after', label: 'תווית שמאל', kind: 'text', source: 'static', default: 'אחרי', maxLength: 10 },
    );
  }
  if (cta) variables.push({ key: 'cta', label: 'כפתור', kind: 'cta', source: 'user', default: cta.default, maxLength: 26 });
  variables.push(
    { key: 'business_name', label: 'שם העסק', kind: 'text', source: 'business_name', maxLength: 40 },
    { key: 'contact', label: 'טלפון ואינסטגרם', kind: 'text', source: 'contact', maxLength: 60 },
  );

  // ── Slots ──────────────────────────────────────────────────────────────────
  const slots: SlotDef[] = def.photo === 'pair'
    ? [
      { key: 'before', label: 'לפני', sources: ['before', 'upload'], required: true, consent: true },
      { key: 'after', label: 'אחרי', sources: ['after', 'upload'], required: true, consent: true },
    ]
    : [{ key: 'photo', label: def.photoSlot?.label || 'תמונה', sources: def.photoSlot?.sources || DEFAULT_SOURCES, required: def.photoSlot?.required ?? true, ...(def.photoSlot?.aiHint ? { aiHint: def.photoSlot.aiHint } : {}) }];

  // ── Layers ─────────────────────────────────────────────────────────────────
  const layers: Layer[] = [];
  const bleed = def.photo === 'bleed';
  const inner = W - 2 * M;

  // Depth under everything: a blush wash low on the left, a sand wash under the strip.
  if (!bleed) {
    layers.push({ id: 'wash_blush', type: 'shape', shape: 'ellipse', box: { x: -22, y: format === 'story' ? 58 : 52, w: 62, h: 34 }, color: 'blush', opacity: 0.85 });
    layers.push({ id: 'wash_sand', type: 'shape', shape: 'ellipse', box: { x: 58, y: 82, w: 64, h: 30 }, color: 'sand', opacity: 0.6 });
  }

  // The photo(s).
  if (def.photo === 'pair') {
    const half = (inner - 24) / 2;
    const ph = m.photoBottom - M;
    layers.push({ id: 'before', type: 'image', slot: 'before', box: pct({ x: W / 2 + 12, y: M, w: half, h: ph }), fit: 'cover', radius: 40, focus: { x: 0.5, y: 0.3 } });
    layers.push({ id: 'after', type: 'image', slot: 'after', box: pct({ x: M, y: M, w: half, h: ph }), fit: 'cover', radius: 40, focus: { x: 0.5, y: 0.3 } });
    const ly = m.photoBottom - 24 - 44;
    layers.push({ id: 'label_before', type: 'text', bind: 'label_before', box: pct({ x: W - M - 24 - 220, y: ly, w: 220, h: 44 }), font: 'accent', size: 22, weight: 600, color: 'ink', align: 'right', maxLines: 1, letterSpacing: 0.1, background: { color: 'surface', radius: 22, padding: 14 } });
    layers.push({ id: 'label_after', type: 'text', bind: 'label_after', box: pct({ x: M + 24, y: ly, w: 220, h: 44 }), font: 'accent', size: 22, weight: 600, color: 'contrast', align: 'left', maxLines: 1, letterSpacing: 0.1, background: { color: 'primary', radius: 22, padding: 14 } });
  } else if (bleed) {
    layers.push({ id: 'photo', type: 'image', slot: 'photo', box: { x: 0, y: 0, w: 100, h: 100 }, fit: 'cover', focus: { x: 0.5, y: 0.3 }, overlay: { color: 'surface', opacity: 1, direction: 'rise' } });
  } else {
    layers.push({ id: 'photo', type: 'image', slot: 'photo', box: pct({ x: M, y: M, w: inner, h: m.photoBottom - M }), fit: 'cover', radius: R, focus: { x: 0.5, y: 0.35 } });
  }

  // The words.
  let y = m.bodyTop;
  if (def.kicker) {
    layers.push({ id: 'kicker', type: 'text', bind: 'kicker', box: pct({ x: M, y, w: inner, h: m.kicker + 10 }), font: 'accent', size: m.kicker, weight: 500, color: 'primary', align: 'right', maxLines: 1, letterSpacing: 0.14 });
    y += m.kicker + 18;
  }
  if (def.quote) {
    layers.push({ id: 'quote_mark', type: 'text', bind: 'quote_mark', box: pct({ x: W - M - 120, y, w: 120, h: 90 }), font: 'display', size: 150, weight: 900, color: 'primary', align: 'right', maxLines: 1, lineHeight: 1 });
    y += 100;
    layers.push({ id: 'review_text', type: 'text', bind: 'review_text', box: pct({ x: M, y, w: inner, h: m.quoteH }), font: 'display', size: m.quoteText, weight: 500, color: 'ink', align: 'right', maxLines: m.quoteLines, lineHeight: 1.35 });
    y += m.quoteH + 16;
    layers.push({ id: 'stars', type: 'rating', bind: 'stars', box: pct({ x: W - M - 400, y: y + 4, w: 400, h: 36 }), color: 'primary', align: 'right' });
    layers.push({ id: 'review_name', type: 'text', bind: 'review_name', box: pct({ x: W - M - 520, y: y + 50, w: 520, h: 40 }), font: 'accent', size: 26, weight: 500, color: 'muted', align: 'right', maxLines: 1, letterSpacing: 0.04 });
  } else {
    const priceW = def.price ? (format === 'story' ? 360 : 330) : 0;
    const headX = def.price ? M + priceW + 32 : M;
    layers.push({ id: 'headline', type: 'text', bind: 'headline', box: pct({ x: headX, y, w: W - M - headX, h: m.headlineH }), font: 'display', size: m.headline, weight: headlineWeight, color: 'ink', align: 'right', maxLines: m.headlineLines, lineHeight: 1.06 });
    if (def.price) {
      layers.push({ id: 'price', type: 'text', bind: 'price', box: pct({ x: M, y, w: priceW, h: m.priceH }), font: 'display', size: m.price, weight: 900, color: 'primary', align: 'left', maxLines: 1, lineHeight: 1 });
      if (def.price.note) layers.push({ id: 'price_note', type: 'text', bind: 'price_note', box: pct({ x: M, y: y + m.priceH + 6, w: priceW, h: 32 }), font: 'accent', size: 24, weight: 400, color: 'muted', align: 'left', maxLines: 1, letterSpacing: 0.04 });
    }
    y += m.headlineH + 12;
    if (def.subline) {
      const sx = def.deco ? 260 : M;
      layers.push({ id: 'subline', type: 'text', bind: 'subline', box: pct({ x: sx, y, w: W - M - sx, h: m.subline + 14 }), font: 'body', size: m.subline, weight: 400, color: 'muted', align: 'right', maxLines: 1 });
    }
  }

  // The decoration, alone on the left of the button row.
  if (def.deco) {
    const size = format === 'story' ? 190 : 160;
    layers.push({ id: 'deco', type: 'deco', asset: def.deco.asset, box: pct({ x: M, y: m.ctaY - size + 60, w: size, h: size }), color: def.deco.color || 'primary', opacity: def.deco.opacity ?? 0.9, ...(def.deco.flip ? { flip: true } : {}) });
  }

  // The button.
  if (cta) {
    layers.push({ id: 'cta', type: 'text', bind: 'cta', box: pct({ x: W - M - 440, y: m.ctaY, w: 440, h: 64 }), font: 'body', size: m.cta, weight: 700, color: 'contrast', align: 'right', maxLines: 1, background: { color: 'primary', radius: 40, padding: 26 } });
  }

  // The strip: her logo on the right, her contact line on the left, on a blush pill.
  const sy = H - M - STRIP_H;
  layers.push({ id: 'strip', type: 'shape', box: pct({ x: M, y: sy, w: inner, h: STRIP_H }), color: 'blush', radius: R });
  layers.push({ id: 'logo', type: 'logo', box: pct({ x: W - M - 32 - 320, y: sy + 20, w: 320, h: STRIP_H - 40 }), fallback: 'business_name', color: 'ink' });
  layers.push({ id: 'contact', type: 'text', bind: 'contact', box: pct({ x: M + 36, y: sy + 20, w: 500, h: STRIP_H - 40 }), font: 'accent', size: 24, weight: 500, color: 'ink', align: 'left', maxLines: 1, letterSpacing: 0.02 });

  // Grain over everything: the difference between flat and printed.
  layers.push({ id: 'grain', type: 'texture', box: { x: 0, y: 0, w: 100, h: 100 }, opacity: 0.16, blend: 'soft-light' });

  const t: Template = {
    key: `${def.slug}-${format === 'story' ? 'story' : 'feed'}`,
    version: format === 'story' ? def.versions.story : def.versions.feed,
    category: def.category,
    format,
    name: def.name,
    description: def.description,
    needs: def.needs || (def.photo === 'pair' ? ['תמונת לפני ותמונת אחרי של לקוחה שאישרה פרסום'] : def.quote ? ['לפחות ביקורת אחת שמורה בהגדרות'] : ['תמונה אחת (מהגלריה או AI)']),
    variables,
    slots,
    layers,
  };
  if (def.holiday) t.holiday = def.holiday;
  return t;
}

/** Feed 4:5 and story 9:16 of one definition. */
export const creamTemplates = (def: CreamDef): Template[] => [creamTemplate(def, 'feed45'), creamTemplate(def, 'story')];
