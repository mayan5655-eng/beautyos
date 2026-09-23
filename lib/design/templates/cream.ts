// lib/design/templates/cream.ts
//
// The studio look, as one builder with several LAYOUT FAMILIES. Every
// template in the library is a short definition (what it says, which
// picture, which family, which decoration) and this file turns it into
// full templates - feed 4:5 and story 9:16 - that share one voice:
//
//   - cream, blush and sand from her hue, never white; or her accent as a
//     full colour block when the definition asks for colour weight
//   - Frank Ruhl Libre headline, Assistant subline, Heebo kicker
//   - a pill strip with her logo and her contact line
//   - a large price where there is one; a line drawing only where the
//     theme asks
//
// and differ in bones:
//
//   top       one photo as a rounded block, circle or arch; text below it
//             (or above it, textPos 'above')
//   overlay   full-bleed photo, the words on it over a deep wash, at the
//             bottom or the top
//   split     photo on one half, a colour block on the other; side right,
//             left or bottom
//   text      a big typographic statement on a colour block, a small circle
//             photo or none
//   collage   two or three photos in a grid, text below
//   magazine  full-bleed photo with a caption band across it
//   frame     the photo inside a thin border, the words outside
//   pair      before / after: two client photos, labelled (consent)
//
// The spacing scale is 8px at 1080 wide: margin 64, radius 48, gaps of
// 8/16/24/40/48. Everything is computed in pixels here and stored as
// percentages, which is what the contract wants; the output is plain data
// like any hand-written template and goes through the same lock file.

import { CANVAS, type Category, type ColorRole, type DecoAsset, type Layer, type SlotDef, type Template, type TemplateGroup, type VariableDef } from '../contract.ts';

export type PhotoShape = 'rect' | 'circle' | 'arch';
export type Block = 'primary' | 'blush' | 'sand' | 'deep';

export type Layout =
  | { family: 'top'; shape?: PhotoShape; textPos?: 'below' | 'above' }
  | { family: 'overlay'; headline?: 'bottom' | 'top' }
  | { family: 'split'; side?: 'right' | 'left' | 'bottom'; block?: Block }
  | { family: 'text'; block?: Block | 'surface'; photo?: 'circle' | 'none' }
  | { family: 'collage'; count?: 2 | 3 }
  | { family: 'magazine'; band?: Block; bandPos?: 'middle' | 'low' }
  | { family: 'frame'; shape?: PhotoShape }
  | { family: 'pair' };

export type CreamDef = {
  /** 'offer' -> keys offer-feed and offer-story. */
  slug: string;
  name: string;
  category: Category;
  group: TemplateGroup;
  /** Which formats to build; both by default. */
  formats?: ('feed45' | 'story')[];
  description: string;
  needs?: string[];
  holiday?: string;
  versions: { feed: number; story: number };
  layout: Layout;
  /** Colour weight of the page itself: cream by default; blush or her accent for a mostly-colour template. */
  page?: 'surface' | 'blush' | 'primary';
  photoSlot?: Partial<Pick<SlotDef, 'sources' | 'aiHint' | 'required' | 'label'>>;
  kicker?: { default: string; maxLength?: number };
  /** lines 1 = a short one-liner (a question, a myth); 2 = the usual two-line headline. */
  headline: { default: string; maxLength?: number; lines?: 1 | 2 };
  subline?: { default: string; maxLength?: number; lines?: 1 | 2 };
  /** Three short lines under a one-line headline (a routine, three facts); replaces the subline. */
  bullets?: string[];
  /** A large price beside the headline (offers, gift cards, packages). */
  price?: { default: string; label?: string; note?: string; required?: boolean };
  /** The testimonial: her saved review as a quote instead of headline/subline. */
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
const CTA_H = 64;

const DEFAULT_SOURCES: SlotDef['sources'] = ['gallery', 'clinic', 'hero', 'upload', 'ai', 'previous'];

/** Text colours on a given ground. */
function palette(ground: Block | 'surface') {
  const onColour = ground === 'primary' || ground === 'deep';
  return {
    ink: (onColour ? 'contrast' : 'ink') as ColorRole,
    muted: (onColour ? 'contrast' : 'muted') as ColorRole,
    kicker: (onColour ? 'contrast' : 'primary') as ColorRole,
    price: (onColour ? 'contrast' : 'primary') as ColorRole,
    ctaBg: (onColour ? 'surface' : 'primary') as ColorRole,
    ctaText: (onColour ? 'deep' : 'contrast') as ColorRole,
    deco: (onColour ? 'contrast' : 'primary') as ColorRole,
  };
}

export function creamTemplate(def: CreamDef, format: 'feed45' | 'story'): Template {
  const canvas = CANVAS[format];
  const W = canvas.w, H = canvas.h;
  const story = format === 'story';
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const pct = (b: Px) => ({ x: r2((b.x / W) * 100), y: r2((b.y / H) * 100), w: r2((b.w / W) * 100), h: r2((b.h / H) * 100) });
  const inner = W - 2 * M;
  const L = def.layout;
  const cta = def.cta === null ? null : def.cta || { default: 'לקביעת תור' };
  const headlineWeight = def.headlineWeight || 700;
  const page = def.page || 'surface';

  // Type sizes per format.
  const T = story
    ? { kicker: 26, headline: 92, headlineLines: 3, headlineH: 290, headlineOneH: 110, subline: 34, price: 140, priceH: 170, cta: 30, quoteText: 44, quoteLines: 5, quoteH: 300, bullet: 32, bulletH: 54, statement: 120, statementLines: 4 }
    : { kicker: 24, headline: 84, headlineLines: 2, headlineH: 190, headlineOneH: 100, subline: 32, price: 128, priceH: 150, cta: 28, quoteText: 40, quoteLines: 4, quoteH: 216, bullet: 30, bulletH: 48, statement: 104, statementLines: 4 };

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
    if (def.subline && !def.bullets) variables.push({ key: 'subline', label: 'שורת משנה', kind: 'text', source: 'user', default: def.subline.default, maxLength: def.subline.maxLength || (def.subline.lines === 2 ? 120 : 60) });
    if (def.bullets) def.bullets.forEach((b, i) => variables.push({ key: `line_${i + 1}`, label: `שורה ${i + 1}`, kind: 'text', source: 'user', default: b, maxLength: 44 }));
  }
  if (def.price) {
    variables.push({ key: 'price', label: def.price.label || 'מחיר', kind: 'price', source: 'user', default: def.price.default, maxLength: 12, required: def.price.required !== false });
    if (def.price.note) variables.push({ key: 'price_note', label: 'הערת מחיר', kind: 'text', source: 'static', default: def.price.note, maxLength: 24 });
  }
  if (L.family === 'pair') {
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
  const photoSlot = (key: string, required: boolean, label?: string): SlotDef => ({
    key, label: label || def.photoSlot?.label || 'תמונה', sources: def.photoSlot?.sources || DEFAULT_SOURCES, required,
    ...(def.photoSlot?.aiHint ? { aiHint: def.photoSlot.aiHint } : {}),
  });
  const noPhoto = L.family === 'text' && (L.photo || 'circle') === 'none';
  const collageCount = L.family === 'collage' ? L.count || 3 : 0;
  const slots: SlotDef[] = L.family === 'pair'
    ? [
      { key: 'before', label: 'לפני', sources: ['before', 'upload'], required: true, consent: true },
      { key: 'after', label: 'אחרי', sources: ['after', 'upload'], required: true, consent: true },
    ]
    : collageCount
      ? Array.from({ length: collageCount }, (_, i) => photoSlot(`photo_${i + 1}`, i === 0, `תמונה ${i + 1}`))
      : noPhoto ? [] : [photoSlot('photo', def.photoSlot?.required ?? true)];

  // ── Layers ─────────────────────────────────────────────────────────────────
  const layers: Layer[] = [];
  const sy = H - M - STRIP_H;                 // strip top
  const ctaY = sy - 40 - CTA_H;               // button row, above the strip
  const bodyBottom = ctaY - 24;               // the words end here

  // The page: cream by default; blush or her accent for a mostly-colour template.
  if (page !== 'surface') layers.push({ id: 'page', type: 'shape', box: { x: 0, y: 0, w: 100, h: 100 }, color: page });
  const fullPhoto = L.family === 'overlay' || L.family === 'magazine';
  const colourBlock = L.family === 'split' || (L.family === 'text' && (L.block || 'blush') !== 'surface');
  if (!fullPhoto && page === 'surface' && !colourBlock) {
    layers.push({ id: 'wash_blush', type: 'shape', shape: 'ellipse', box: { x: -22, y: story ? 58 : 52, w: 62, h: 34 }, color: 'blush', opacity: 0.85 });
    layers.push({ id: 'wash_sand', type: 'shape', shape: 'ellipse', box: { x: 58, y: 82, w: 64, h: 30 }, color: 'sand', opacity: 0.6 });
  }

  // Where the words go and on what ground; set by the family below.
  let ground: Block | 'surface' = page;
  let textX = M, textW = inner, textTop = 0;
  const align: 'right' | 'left' = 'right';
  let decoAt: Px | null = null;
  let ctaRow = ctaY;

  const short = def.quote || !!def.bullets || def.subline?.lines === 2;
  const photoShape = (shape?: PhotoShape) => (shape === 'circle' ? { radius: 999 } : shape === 'arch' ? { radius: 0, shape: 'arch' as const } : { radius: R });
  const photoCommon = { fit: 'cover' as const, focus: { x: 0.5, y: 0.35 } };
  const decoSize = story ? 190 : 160;
  const decoLeft = (): Px => ({ x: M, y: ctaY + CTA_H - decoSize, w: decoSize, h: decoSize });

  if (L.family === 'top') {
    const ph = story ? (short ? 1000 : 1120) : (short ? 582 : 684);
    if (L.textPos === 'above') {
      // Words first, then the photo down to the button row.
      textTop = M + 16;
      const py = textTop + (story ? 520 : 380);
      const box = { x: M, y: py, w: inner, h: ctaY - 40 - py };
      layers.push({ id: 'photo', type: 'image', slot: 'photo', box: pct(box), ...photoCommon, ...photoShape(L.shape) });
      decoAt = null;
    } else {
      const d = Math.min(ph, inner);
      const box = L.shape === 'circle' ? { x: (W - d) / 2, y: M + 16, w: d, h: d } : { x: M, y: M, w: inner, h: ph };
      layers.push({ id: 'photo', type: 'image', slot: 'photo', box: pct(box), ...photoCommon, ...photoShape(L.shape) });
      textTop = box.y + box.h + 40;
      decoAt = decoLeft();
    }
  } else if (L.family === 'frame') {
    // A thin line in her accent, a cream gap, then the photo.
    const ph = story ? 1120 : 684;
    const circle = L.shape === 'circle';
    const outer = circle ? { x: (W - ph) / 2, y: M, w: ph, h: ph } : { x: M, y: M, w: inner, h: ph };
    layers.push({ id: 'frame', type: 'shape', box: pct(outer), color: 'primary', radius: circle ? 999 : 8 });
    layers.push({ id: 'frame_gap', type: 'shape', box: pct({ x: outer.x + 4, y: outer.y + 4, w: outer.w - 8, h: outer.h - 8 }), color: page, radius: circle ? 999 : 6 });
    const inset = 28;
    layers.push({ id: 'photo', type: 'image', slot: 'photo', box: pct({ x: outer.x + inset, y: outer.y + inset, w: outer.w - 2 * inset, h: outer.h - 2 * inset }), ...photoCommon, radius: circle ? 999 : 0 });
    textTop = outer.y + outer.h + 40;
    decoAt = decoLeft();
  } else if (L.family === 'overlay') {
    const top = L.headline === 'top';
    layers.push({ id: 'photo', type: 'image', slot: 'photo', box: { x: 0, y: 0, w: 100, h: 100 }, fit: 'cover', focus: { x: 0.5, y: top ? 0.65 : 0.3 }, overlay: { color: 'deep', opacity: 0.9, direction: top ? 'top' : 'rise' } });
    ground = 'deep';
    const wordsH = story ? 500 : 360;
    textTop = top ? M + 24 : bodyBottom - wordsH;
    decoAt = top ? null : decoLeft();
  } else if (L.family === 'split') {
    const side = L.side || 'right';
    const block = L.block || 'primary';
    ground = block;
    if (side === 'bottom') {
      const ph = Math.round(H * (story ? 0.5 : 0.5));
      layers.push({ id: 'photo', type: 'image', slot: 'photo', box: pct({ x: 0, y: 0, w: W, h: ph }), fit: 'cover', focus: { x: 0.5, y: 0.35 } });
      layers.push({ id: 'block', type: 'shape', box: pct({ x: 0, y: ph, w: W, h: H - ph }), color: block });
      textTop = ph + 48;
      decoAt = decoLeft();
    } else {
      const half = W / 2;
      layers.push({ id: 'photo', type: 'image', slot: 'photo', box: pct({ x: side === 'right' ? half : 0, y: 0, w: half, h: H }), fit: 'cover', focus: { x: 0.5, y: 0.4 } });
      layers.push({ id: 'block', type: 'shape', box: pct({ x: side === 'right' ? 0 : half, y: 0, w: half, h: H }), color: block });
      textX = (side === 'right' ? 0 : half) + 40; textW = half - 40 - 28;
      textTop = Math.round(H * (story ? 0.3 : 0.2));
      decoAt = null;
    }
  } else if (L.family === 'text') {
    const block = L.block || 'blush';
    if (block !== 'surface') layers.push({ id: 'block', type: 'shape', box: { x: 0, y: 0, w: 100, h: 100 }, color: block });
    ground = block;
    textTop = M + (story ? 160 : 90);
    if (!noPhoto) {
      const d = story ? 320 : 260;
      layers.push({ id: 'photo', type: 'image', slot: 'photo', box: pct({ x: M, y: ctaY + CTA_H - d, w: d, h: d }), fit: 'cover', focus: { x: 0.5, y: 0.4 }, radius: 999 });
      decoAt = null;
    } else decoAt = decoLeft();
  } else if (L.family === 'collage') {
    const ph = story ? 1120 : 684;
    const gap = 24;
    if (collageCount === 2) {
      const half = (inner - gap) / 2;
      layers.push({ id: 'photo_1', type: 'image', slot: 'photo_1', box: pct({ x: W / 2 + gap / 2, y: M, w: half, h: ph }), ...photoCommon, radius: 40 });
      layers.push({ id: 'photo_2', type: 'image', slot: 'photo_2', box: pct({ x: M, y: M, w: half, h: ph }), ...photoCommon, radius: 40 });
    } else {
      const bigW = Math.round(inner * 0.58), smallW = inner - bigW - gap, smallH = (ph - gap) / 2;
      layers.push({ id: 'photo_1', type: 'image', slot: 'photo_1', box: pct({ x: W - M - bigW, y: M, w: bigW, h: ph }), ...photoCommon, radius: 40 });
      layers.push({ id: 'photo_2', type: 'image', slot: 'photo_2', box: pct({ x: M, y: M, w: smallW, h: smallH }), ...photoCommon, radius: 40 });
      layers.push({ id: 'photo_3', type: 'image', slot: 'photo_3', box: pct({ x: M, y: M + smallH + gap, w: smallW, h: smallH }), ...photoCommon, radius: 40 });
    }
    textTop = M + ph + 40;
    decoAt = null;
  } else if (L.family === 'magazine') {
    const band = L.band || 'primary';
    layers.push({ id: 'photo', type: 'image', slot: 'photo', box: { x: 0, y: 0, w: 100, h: 100 }, fit: 'cover', focus: { x: 0.5, y: 0.3 } });
    const bandH = story ? 440 : 340;
    const by = L.bandPos === 'low' ? ctaY - 24 - bandH : Math.round(H * (story ? 0.48 : 0.42));
    layers.push({ id: 'band', type: 'shape', box: pct({ x: 0, y: by, w: W, h: bandH }), color: band, opacity: 0.96 });
    ground = band;
    textTop = by + 36;
    // The button sits right under the band when the band is mid-page, on the photo.
    ctaRow = L.bandPos === 'low' ? ctaY : by + bandH + 24;
    decoAt = { x: M, y: ctaRow + CTA_H - (story ? 170 : 140), w: story ? 170 : 140, h: story ? 170 : 140 };
  } else if (L.family === 'pair') {
    const ph = story ? 1120 : 684;
    const half = (inner - 24) / 2;
    layers.push({ id: 'before', type: 'image', slot: 'before', box: pct({ x: W / 2 + 12, y: M, w: half, h: ph }), fit: 'cover', radius: 40, focus: { x: 0.5, y: 0.3 } });
    layers.push({ id: 'after', type: 'image', slot: 'after', box: pct({ x: M, y: M, w: half, h: ph }), fit: 'cover', radius: 40, focus: { x: 0.5, y: 0.3 } });
    const ly = M + ph - 24 - 44;
    layers.push({ id: 'label_before', type: 'text', bind: 'label_before', box: pct({ x: W - M - 24 - 220, y: ly, w: 220, h: 44 }), font: 'accent', size: 22, weight: 600, color: 'ink', align: 'right', maxLines: 1, letterSpacing: 0.1, background: { color: 'surface', radius: 22, padding: 14 } });
    layers.push({ id: 'label_after', type: 'text', bind: 'label_after', box: pct({ x: M + 24, y: ly, w: 220, h: 44 }), font: 'accent', size: 22, weight: 600, color: 'contrast', align: 'left', maxLines: 1, letterSpacing: 0.1, background: { color: 'primary', radius: 22, padding: 14 } });
    textTop = M + ph + 40;
    decoAt = null;
  }

  const P = palette(ground);
  const statement = L.family === 'text';
  // The strip and the button on a full photo or a colour ground.
  const onPhoto = ground === 'deep';
  const stripColor: ColorRole = onPhoto || page === 'primary' || ground === 'primary' ? 'surface' : 'blush';

  // ── The words, stacked from textTop inside [textX, textX + textW] ─────────
  let y = textTop;
  if (def.kicker) {
    layers.push({ id: 'kicker', type: 'text', bind: 'kicker', box: pct({ x: textX, y, w: textW, h: T.kicker + 10 }), font: 'accent', size: T.kicker, weight: 500, color: P.kicker, align, maxLines: 1, letterSpacing: 0.14 });
    y += T.kicker + 18;
  }
  if (def.quote) {
    layers.push({ id: 'quote_mark', type: 'text', bind: 'quote_mark', box: pct({ x: textX + textW - 120, y, w: 120, h: 90 }), font: 'display', size: 150, weight: 900, color: P.kicker, align: 'right', maxLines: 1, lineHeight: 1 });
    y += 100;
    layers.push({ id: 'review_text', type: 'text', bind: 'review_text', box: pct({ x: textX, y, w: textW, h: T.quoteH }), font: 'display', size: T.quoteText, weight: 500, color: P.ink, align, maxLines: T.quoteLines, lineHeight: 1.35 });
    y += T.quoteH + 16;
    layers.push({ id: 'stars', type: 'rating', bind: 'stars', box: pct({ x: textX + textW - 400, y: y + 4, w: 400, h: 36 }), color: P.kicker, align: 'right' });
    layers.push({ id: 'review_name', type: 'text', bind: 'review_name', box: pct({ x: textX + textW - 520, y: y + 50, w: 520, h: 40 }), font: 'accent', size: 26, weight: 500, color: P.muted, align: 'right', maxLines: 1, letterSpacing: 0.04 });
  } else {
    const beside = !!def.price && textW >= 700;
    const priceW = beside ? Math.min(Math.round(textW * 0.42), story ? 360 : 330) : 0;
    const headX = beside ? textX + priceW + 32 : textX;
    const oneLine = def.headline.lines === 1 || !!def.bullets;
    const size = statement ? T.statement : T.headline;
    const lines = statement ? 3 : oneLine ? 1 : T.headlineLines;
    const headH = statement ? Math.round(size * 1.04 * lines) : oneLine ? T.headlineOneH : T.headlineH;
    // A short headline hugs what follows it on a statement or a wash; elsewhere it sits centred in its box.
    const headValign = statement ? 'top' : L.family === 'overlay' ? 'bottom' : 'center';
    layers.push({ id: 'headline', type: 'text', bind: 'headline', box: pct({ x: headX, y, w: textX + textW - headX, h: headH }), font: 'display', size, weight: statement ? 900 : headlineWeight, color: P.ink, align, valign: headValign, maxLines: lines, lineHeight: statement ? 1.02 : 1.06 });
    if (def.price && beside) {
      layers.push({ id: 'price', type: 'text', bind: 'price', box: pct({ x: textX, y, w: priceW, h: T.priceH }), font: 'display', size: T.price, weight: 900, color: P.price, align: 'left', maxLines: 1, lineHeight: 1 });
      if (def.price.note) layers.push({ id: 'price_note', type: 'text', bind: 'price_note', box: pct({ x: textX, y: y + T.priceH + 6, w: priceW, h: 32 }), font: 'accent', size: 24, weight: 400, color: P.muted, align: 'left', maxLines: 1, letterSpacing: 0.04 });
    }
    y += headH + 12;
    if (def.price && !beside) {
      // Stacked: the price on its own row under the headline, its note beside it.
      layers.push({ id: 'price', type: 'text', bind: 'price', box: pct({ x: textX, y, w: textW, h: T.priceH }), font: 'display', size: T.price, weight: 900, color: P.price, align: 'right', maxLines: 1, lineHeight: 1 });
      y += T.priceH + 8;
      if (def.price.note) { layers.push({ id: 'price_note', type: 'text', bind: 'price_note', box: pct({ x: textX, y, w: textW, h: 32 }), font: 'accent', size: 24, weight: 400, color: P.muted, align: 'right', maxLines: 1, letterSpacing: 0.04 }); y += 44; }
    }
    // Leave the left corner to the decoration when it sits beside the subline.
    const sx = def.deco && decoAt && decoAt.y < y + T.subline * 2 ? textX + decoSize + 40 : textX;
    if (def.bullets) {
      def.bullets.forEach((_, i) => {
        layers.push({ id: `line_${i + 1}`, type: 'text', bind: `line_${i + 1}`, box: pct({ x: sx, y: y + i * T.bulletH, w: textX + textW - sx, h: T.bulletH }), font: 'body', size: T.bullet, weight: i === 0 ? 600 : 400, color: P.ink, align, maxLines: 1 });
      });
    } else if (def.subline) {
      const two = def.subline.lines === 2;
      layers.push({ id: 'subline', type: 'text', bind: 'subline', box: pct({ x: sx, y, w: textX + textW - sx, h: two ? T.subline * 2.8 : T.subline + 14 }), font: 'body', size: T.subline, weight: 400, color: P.muted, align, ...(statement ? { valign: 'top' } : {}), maxLines: two ? 2 : 1, ...(two ? { lineHeight: 1.35 } : {}) });
    }
  }

  // The decoration, where the family left room for it.
  if (def.deco && decoAt) {
    layers.push({ id: 'deco', type: 'deco', asset: def.deco.asset, box: pct(decoAt), color: def.deco.color || P.deco, opacity: def.deco.opacity ?? 0.9, ...(def.deco.flip ? { flip: true } : {}) });
  }

  // The button.
  if (cta) {
    const cw = Math.min(440, textW);
    layers.push({ id: 'cta', type: 'text', bind: 'cta', box: pct({ x: textX + textW - cw, y: ctaRow, w: cw, h: CTA_H }), font: 'body', size: T.cta, weight: 700, color: P.ctaText, align: 'right', maxLines: 1, background: { color: P.ctaBg, radius: 40, padding: 26 } });
  }

  // The strip: her logo on the right, her contact line on the left.
  layers.push({ id: 'strip', type: 'shape', box: pct({ x: M, y: sy, w: inner, h: STRIP_H }), color: stripColor, radius: R, opacity: fullPhoto ? 0.94 : 1 });
  layers.push({ id: 'logo', type: 'logo', box: pct({ x: W - M - 32 - 320, y: sy + 20, w: 320, h: STRIP_H - 40 }), fallback: 'business_name', color: 'ink' });
  layers.push({ id: 'contact', type: 'text', bind: 'contact', box: pct({ x: M + 36, y: sy + 20, w: 500, h: STRIP_H - 40 }), font: 'accent', size: 24, weight: 500, color: 'ink', align: 'left', maxLines: 1, letterSpacing: 0.02 });

  // Grain over everything: the difference between flat and printed.
  layers.push({ id: 'grain', type: 'texture', box: { x: 0, y: 0, w: 100, h: 100 }, opacity: 0.16, blend: 'soft-light' });

  const t: Template = {
    key: `${def.slug}-${story ? 'story' : 'feed'}`,
    version: story ? def.versions.story : def.versions.feed,
    category: def.category,
    format,
    name: def.name,
    description: def.description,
    needs: def.needs || (L.family === 'pair' ? ['תמונת לפני ותמונת אחרי של לקוחה שאישרה פרסום'] : def.quote ? ['לפחות ביקורת אחת שמורה בהגדרות'] : collageCount ? [`${collageCount} תמונות (מהגלריה או AI)`] : noPhoto ? [] : ['תמונה אחת (מהגלריה או AI)']),
    variables,
    slots,
    layers,
  };
  if (def.holiday) t.holiday = def.holiday;
  t.group = def.group;
  return t;
}

/** Every format of one definition: feed 4:5 and story 9:16 by default. */
export const creamTemplates = (def: CreamDef): Template[] => (def.formats || ['feed45', 'story']).map((f) => creamTemplate(def, f));
