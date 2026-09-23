// lib/design/contract.ts
//
// The template contract: what a template IS, independent of anything that
// draws it. A template is data - a JSON-shaped object with a key, a version,
// a canvas, named variables (text she can fill), named slots (pictures she
// can fill) and layers that bind to them by name. Colours are ROLES, never
// hex; fonts are ROLES, never families. Her branding is mapped onto the
// roles by lib/design/mapBranding.ts, and whoever renders (the DOM preview
// in stage 2, CE.SDK behind the renderer interface in stage 3) reads the
// same object. No renderer is imported here and none ever will be.
//
// Two rules the tests enforce:
//   - a template at a given (key, version) never changes; edit = new version
//     (lib/design/templates/templates.lock.json holds the hashes)
//   - every layer binds to a declared variable or slot, and every box lies
//     inside the canvas

export type Format = 'feed45' | 'story' | 'square';
export type Category = 'offer' | 'before_after' | 'tip' | 'review' | 'treatment' | 'seasonal' | 'announce';

export const CANVAS: Record<Format, { w: number; h: number }> = {
  feed45: { w: 1080, h: 1350 },
  story: { w: 1080, h: 1920 },
  square: { w: 1080, h: 1080 },
};

/** How the gallery groups the library: what she posts all year, what the calendar brings, what closes a sale. */
export type TemplateGroup = 'evergreen' | 'seasonal' | 'closer';
export const GROUP_LABELS: Record<TemplateGroup, string> = {
  evergreen: 'כל השנה',
  seasonal: 'חגים ועונות',
  closer: 'סוגרים עסקה',
};

export const CATEGORY_LABELS: Record<Category, string> = {
  offer: 'מבצעים',
  before_after: 'לפני / אחרי',
  review: 'לקוחות מספרות',
  treatment: 'טיפולים',
  tip: 'טיפים וידע',
  seasonal: 'חגים ועונות',
  announce: 'הודעות',
};

/**
 * Colour roles. mapBranding turns her primary colour into all of them.
 *   primary / deep / tint / contrast / secondary  - her accent and its family
 *   ink / muted                                    - text
 *   surface / blush / sand                         - the three backgrounds of
 *     the studio look: warm cream, a blush of her hue on cream, a warm
 *     neutral. Never white.
 */
export type ColorRole = 'primary' | 'deep' | 'tint' | 'contrast' | 'secondary' | 'ink' | 'surface' | 'muted' | 'blush' | 'sand';
export const COLOR_ROLES: ColorRole[] = ['primary', 'deep', 'tint', 'contrast', 'secondary', 'ink', 'surface', 'muted', 'blush', 'sand'];

/** display = Frank Ruhl Libre (headlines), body = Assistant, accent = Heebo (kickers, labels). */
export type FontRole = 'display' | 'body' | 'accent';

/** Position and size as percentages of the canvas (0..100). */
export type Box = { x: number; y: number; w: number; h: number };

export type TextLayer = {
  id: string;
  type: 'text';
  /** Variable key this text shows. */
  bind: string;
  box: Box;
  font: FontRole;
  /** Pixels at canvas scale (1080 wide). */
  size: number;
  weight?: 400 | 500 | 600 | 700 | 800 | 900;
  color: ColorRole;
  align: 'right' | 'center' | 'left';
  /** Where the text sits inside a box taller than it; centre by default. */
  valign?: 'top' | 'center' | 'bottom';
  /** Wrap at most this many lines; the renderer shrinks the text to fit. */
  maxLines?: number;
  lineHeight?: number;
  /** In em, e.g. 0.08 for a spaced kicker. */
  letterSpacing?: number;
  /** A pill behind the text. */
  background?: { color: ColorRole; radius: number; padding: number };
  editable?: boolean;
};

export type ImageLayer = {
  id: string;
  type: 'image';
  /** Slot key this picture comes from. */
  slot: string;
  box: Box;
  fit: 'cover' | 'contain';
  /** Corner radius in px at canvas scale; 999 = a circle (ellipse of the box). */
  radius?: number;
  /** arch = rounded at the top only (half the width), square at the bottom. */
  shape?: 'rect' | 'arch';
  /** Focal point (0..1) the cover crop keeps. */
  focus?: { x: number; y: number };
  /**
   * A wash over the picture so text on it reads. bottom/top fade from one
   * edge; flat covers evenly; rise is solid across the lower part and fades
   * out above it - cream climbing a full-bleed photo.
   */
  overlay?: { color: ColorRole; opacity: number; direction?: 'top' | 'bottom' | 'flat' | 'rise' };
};

export type ShapeLayer = {
  id: string;
  type: 'shape';
  box: Box;
  /** rect (default) or ellipse: soft layered blobs behind content. */
  shape?: 'rect' | 'ellipse';
  color: ColorRole;
  opacity?: number;
  radius?: number;
  gradient?: { to: ColorRole; angle: number };
};

export type LogoLayer = {
  id: string;
  type: 'logo';
  box: Box;
  /** When she has no logo: her business name in the display font, or nothing. */
  fallback: 'business_name' | 'none';
  /** Colour for the fallback wordmark. */
  color?: ColorRole;
};

/** Film grain over everything below it: the difference between flat and printed. */
export type TextureLayer = {
  id: string;
  type: 'texture';
  box: Box;
  opacity: number;
  blend?: 'soft-light' | 'multiply';
};

/**
 * A delicate line drawing in one colour role, from public/design-deco/<asset>.svg
 * (stroked, currentColor). Only where the theme calls for it: a leaf, a
 * ribbon, a candle for the holidays. Kept inside `contain` in its box.
 */
export type DecoAsset = 'leaf' | 'ribbon' | 'candle' | 'pomegranate' | 'sparkle' | 'wave';
export const DECO_ASSETS: DecoAsset[] = ['leaf', 'ribbon', 'candle', 'pomegranate', 'sparkle', 'wave'];

export type DecoLayer = {
  id: string;
  type: 'deco';
  asset: DecoAsset;
  box: Box;
  color: ColorRole;
  opacity?: number;
  /** Mirror horizontally, so one drawing serves both corners. */
  flip?: boolean;
};

/**
 * Five stars drawn as shapes, filled up to the rating the bound variable
 * holds ("★★★★☆" from her review, or a digit). Shapes, not glyphs: the
 * Hebrew fonts have no star.
 */
export type RatingLayer = {
  id: string;
  type: 'rating';
  bind: string;
  box: Box;
  color: ColorRole;
  align: 'right' | 'left';
};

export type Layer = TextLayer | ImageLayer | ShapeLayer | LogoLayer | TextureLayer | DecoLayer | RatingLayer;

/** How many stars a rating value means: "★★★★☆" -> 4, "5" -> 5, anything else -> 5. */
export function ratingCount(value: string | null | undefined): number {
  const s = String(value || '');
  const filled = (s.match(/★/g) || []).length;
  if (filled) return Math.min(5, filled);
  const n = Number(s);
  return Number.isFinite(n) && n >= 1 && n <= 5 ? Math.round(n) : 5;
}

/** Where a variable's value comes from before she types anything. */
export type VariableSource =
  | 'business_name' | 'therapist_name' | 'therapist_title' | 'booking_url'
  | 'phone' | 'instagram' | 'contact'
  | 'review_text' | 'review_name' | 'review_rating' | 'static' | 'user';

export type VariableDef = {
  key: string;
  /** Hebrew label for the fill form. */
  label: string;
  kind: 'text' | 'price' | 'cta' | 'stars';
  source: VariableSource;
  /** Used when the source is empty, or for source 'static'. */
  default?: string;
  maxLength?: number;
  required?: boolean;
};

export type ImageSource = 'gallery' | 'clinic' | 'portrait' | 'hero' | 'upload' | 'before' | 'after' | 'ai' | 'previous';

export type SlotDef = {
  key: string;
  label: string;
  sources: ImageSource[];
  /** For the AI source: what the picture should be when no client photo belongs (abstract, on-brand, no text). */
  aiHint?: string;
  required?: boolean;
  /** Pictures of a client: the picker refuses them without recorded consent. */
  consent?: boolean;
};

export type Template = {
  key: string;
  version: number;
  category: Category;
  format: Format;
  name: string;
  description: string;
  variables: VariableDef[];
  slots: SlotDef[];
  layers: Layer[];
  /** What she must have for this template to fill fully (shown in the gallery). */
  needs: string[];
  /** Seasonal: which occasion opens its window (lib/design/holidays.ts). */
  holiday?: string;
  /** Gallery group; a template without one sits with the evergreens. */
  group?: TemplateGroup;
};

export const templateId = (t: Pick<Template, 'key' | 'version'>) => `${t.key}@${t.version}`;

const inCanvas = (b: Box) =>
  [b.x, b.y, b.w, b.h].every((n) => Number.isFinite(n)) && b.x >= 0 && b.y >= 0 && b.w > 0 && b.h > 0 && b.x + b.w <= 100.0001 && b.y + b.h <= 100.0001;

const bleeds = (b: Box) =>
  [b.x, b.y, b.w, b.h].every((n) => Number.isFinite(n)) && b.w > 0 && b.h > 0 && b.x > -60 && b.y > -60 && b.x + b.w < 160 && b.y + b.h < 160;

/** Every problem with a template, or an empty list. */
export function validateTemplate(t: Template): string[] {
  const errors: string[] = [];
  if (!/^[a-z0-9-]+$/.test(t.key)) errors.push(`key "${t.key}" must be kebab-case`);
  if (!Number.isInteger(t.version) || t.version < 1) errors.push('version must be a positive integer');
  if (!CANVAS[t.format]) errors.push(`unknown format ${t.format}`);
  if (!CATEGORY_LABELS[t.category]) errors.push(`unknown category ${t.category}`);
  if (!t.name) errors.push('name is required');
  const vars = new Set<string>();
  for (const v of t.variables) {
    if (vars.has(v.key)) errors.push(`duplicate variable ${v.key}`);
    vars.add(v.key);
    if (v.source === 'static' && !v.default) errors.push(`static variable ${v.key} needs a default`);
  }
  const slots = new Set<string>();
  for (const s of t.slots) {
    if (slots.has(s.key)) errors.push(`duplicate slot ${s.key}`);
    slots.add(s.key);
    if (!s.sources.length) errors.push(`slot ${s.key} allows no source`);
    if ((s.sources.includes('before') || s.sources.includes('after')) && !s.consent) errors.push(`slot ${s.key} shows client photos and must require consent`);
  }
  const ids = new Set<string>();
  for (const l of t.layers) {
    if (ids.has(l.id)) errors.push(`duplicate layer id ${l.id}`);
    ids.add(l.id);
    // Decorative blobs and washes may bleed past the edge; content may not.
    const decorative = l.type === 'shape' || l.type === 'texture';
    if (decorative ? !bleeds(l.box) : !inCanvas(l.box)) errors.push(`layer ${l.id} box is outside the canvas`);
    if (l.type === 'text') {
      if (!vars.has(l.bind)) errors.push(`text layer ${l.id} binds to unknown variable ${l.bind}`);
      if (!COLOR_ROLES.includes(l.color)) errors.push(`text layer ${l.id} uses unknown colour role ${l.color}`);
      if (l.background && !COLOR_ROLES.includes(l.background.color)) errors.push(`text layer ${l.id} pill uses unknown colour role`);
      if (!(l.size > 0)) errors.push(`text layer ${l.id} needs a size`);
    } else if (l.type === 'image') {
      if (!slots.has(l.slot)) errors.push(`image layer ${l.id} uses unknown slot ${l.slot}`);
    } else if (l.type === 'shape') {
      if (!COLOR_ROLES.includes(l.color)) errors.push(`shape ${l.id} uses unknown colour role ${l.color}`);
    } else if (l.type === 'logo') {
      if (l.color && !COLOR_ROLES.includes(l.color)) errors.push(`logo ${l.id} uses unknown colour role`);
    } else if (l.type === 'texture') {
      if (!(l.opacity > 0 && l.opacity <= 0.6)) errors.push(`texture ${l.id} opacity must be in (0, 0.6]`);
    } else if (l.type === 'rating') {
      if (!vars.has(l.bind)) errors.push(`rating ${l.id} binds to unknown variable ${l.bind}`);
      if (!COLOR_ROLES.includes(l.color)) errors.push(`rating ${l.id} uses unknown colour role ${l.color}`);
    } else if (l.type === 'deco') {
      if (!DECO_ASSETS.includes(l.asset)) errors.push(`deco ${l.id} uses unknown asset ${l.asset}`);
      if (!COLOR_ROLES.includes(l.color)) errors.push(`deco ${l.id} uses unknown colour role ${l.color}`);
    }
  }
  return errors;
}
