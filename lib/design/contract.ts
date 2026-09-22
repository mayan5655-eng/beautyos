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
export type Category = 'offer' | 'before_after' | 'tip' | 'review' | 'new_treatment' | 'seasonal';

export const CANVAS: Record<Format, { w: number; h: number }> = {
  feed45: { w: 1080, h: 1350 },
  story: { w: 1080, h: 1920 },
  square: { w: 1080, h: 1080 },
};

export const CATEGORY_LABELS: Record<Category, string> = {
  offer: 'מבצע',
  before_after: 'לפני / אחרי',
  tip: 'טיפ',
  review: 'ביקורת לקוחה',
  new_treatment: 'טיפול חדש',
  seasonal: 'עונתי',
};

/** Colour roles. mapBranding turns her primary colour into all of them. */
export type ColorRole = 'primary' | 'deep' | 'tint' | 'contrast' | 'secondary' | 'ink' | 'surface' | 'muted';
export const COLOR_ROLES: ColorRole[] = ['primary', 'deep', 'tint', 'contrast', 'secondary', 'ink', 'surface', 'muted'];

export type FontRole = 'display' | 'body';

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
  weight?: 400 | 500 | 600 | 700 | 800;
  color: ColorRole;
  align: 'right' | 'center' | 'left';
  /** Wrap at most this many lines; the renderer shrinks the text to fit. */
  maxLines?: number;
  lineHeight?: number;
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
  radius?: number;
  /** Focal point (0..1) the cover crop keeps. */
  focus?: { x: number; y: number };
  /** A wash over the picture so text on it reads. */
  overlay?: { color: ColorRole; opacity: number; direction?: 'top' | 'bottom' | 'flat' };
};

export type ShapeLayer = {
  id: string;
  type: 'shape';
  box: Box;
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

export type Layer = TextLayer | ImageLayer | ShapeLayer | LogoLayer;

/** Where a variable's value comes from before she types anything. */
export type VariableSource =
  | 'business_name' | 'therapist_name' | 'therapist_title' | 'booking_url'
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
};

export const templateId = (t: Pick<Template, 'key' | 'version'>) => `${t.key}@${t.version}`;

const inCanvas = (b: Box) =>
  [b.x, b.y, b.w, b.h].every((n) => Number.isFinite(n)) && b.x >= 0 && b.y >= 0 && b.w > 0 && b.h > 0 && b.x + b.w <= 100.0001 && b.y + b.h <= 100.0001;

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
    if (!inCanvas(l.box)) errors.push(`layer ${l.id} box is outside the canvas`);
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
    }
  }
  return errors;
}
