// lib/design/templates/pack/kit.ts
//
// A small frame builder for the hand-composed templates of the Kalmea pack (presenter posts and reels, photo
// and graphic reels). The cream builder (templates/cream.ts) is a layout-family machine for the studio look;
// these designs need layers it does not have - moving graphics, rotated polaroids, a character label tied to a
// slot - so they are composed here, in canvas pixels, and stored as the same plain Template data.
//
// Rules the kit enforces so every template built with it is safe by construction:
//   - colours are ROLES; there is no way to pass a hex
//   - text on a coloured ground uses a role that reads on it (see test-design-contrast.ts SAFE_PAIRS)
//   - a layer id is unique, a bound variable or slot exists (validateTemplate runs in the tests)

import { CANVAS, type Box, type Category, type ColorRole, type GraphicKind, type GraphicMotion, type ImageLayer, type Layer, type SlotDef, type Template, type TemplateGroup, type TextLayer, type VariableDef, type VisibleWhen } from '../../contract.ts';
import type { FieldKey } from '../../../businessFields.ts';

export type Px = { x: number; y: number; w: number; h: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

export const AI_LABEL_TEXT = 'דמות AI להמחשה';

export class Frame {
  readonly W: number;
  readonly H: number;
  readonly layers: Layer[] = [];
  readonly variables: VariableDef[] = [];
  readonly slots: SlotDef[] = [];
  private seq = 0;

  readonly format: 'feed45' | 'story';

  // (no constructor parameter property: node's strip-types mode, which runs the tests, does not support it)
  constructor(format: 'feed45' | 'story') {
    this.format = format;
    this.W = CANVAS[format].w;
    this.H = CANVAS[format].h;
  }

  /** Canvas pixels -> the percentages a template stores. */
  box(b: Px): Box {
    return { x: r2((b.x / this.W) * 100), y: r2((b.y / this.H) * 100), w: r2((b.w / this.W) * 100), h: r2((b.h / this.H) * 100) };
  }

  private id(prefix: string) { return `${prefix}-${++this.seq}`; }

  /** Register a variable once; returns its key so a layer can bind to it. */
  v(key: string, label: string, def: string, o: { max?: number; source?: VariableDef['source']; kind?: VariableDef['kind']; required?: boolean; lineBreaks?: boolean } = {}): string {
    if (!this.variables.some((x) => x.key === key)) {
      this.variables.push({ key, label, kind: o.kind || 'text', source: o.source || 'static', default: def, maxLength: o.max ?? 60, ...(o.required ? { required: true } : {}), ...(o.lineBreaks ? { lineBreaks: true } : {}) });
    }
    return key;
  }

  slot(def: SlotDef): string {
    if (!this.slots.some((s) => s.key === def.key)) this.slots.push(def);
    return def.key;
  }

  shape(b: Px, color: ColorRole, o: { opacity?: number; radius?: number; rotate?: number; ellipse?: boolean; visibleWhen?: VisibleWhen; id?: string } = {}): this {
    this.layers.push({ id: o.id || this.id('shape'), type: 'shape', box: this.box(b), ...(o.ellipse ? { shape: 'ellipse' as const } : {}), color, ...(o.opacity !== undefined ? { opacity: o.opacity } : {}), ...(o.radius ? { radius: o.radius } : {}), ...(o.rotate ? { rotate: o.rotate } : {}), ...(o.visibleWhen ? { visibleWhen: o.visibleWhen } : {}) });
    return this;
  }

  image(slot: string, b: Px, o: { radius?: number; shape?: ImageLayer['shape']; rotate?: number; focus?: { x: number; y: number }; overlay?: ImageLayer['overlay']; fit?: 'cover' | 'contain'; id?: string } = {}): this {
    this.layers.push({ id: o.id || this.id('photo'), type: 'image', slot, box: this.box(b), fit: o.fit || 'cover', ...(o.radius ? { radius: o.radius } : {}), ...(o.shape ? { shape: o.shape } : {}), ...(o.rotate ? { rotate: o.rotate } : {}), ...(o.focus ? { focus: o.focus } : {}), ...(o.overlay ? { overlay: o.overlay } : {}) });
    return this;
  }

  text(bind: string, b: Px, o: { font?: TextLayer['font']; size: number; weight?: TextLayer['weight']; color: ColorRole; align?: TextLayer['align']; valign?: TextLayer['valign']; maxLines?: number; lineHeight?: number; letterSpacing?: number; pill?: { color: ColorRole; radius: number; padding: number }; visibleWhen?: VisibleWhen; id?: string }): this {
    this.layers.push({
      id: o.id || this.id('text'), type: 'text', bind, box: this.box(b), font: o.font || 'body', size: o.size, weight: o.weight || 600, color: o.color, align: o.align || 'right',
      ...(o.valign ? { valign: o.valign } : {}), ...(o.maxLines ? { maxLines: o.maxLines } : {}), ...(o.lineHeight ? { lineHeight: o.lineHeight } : {}), ...(o.letterSpacing ? { letterSpacing: o.letterSpacing } : {}),
      ...(o.pill ? { background: o.pill } : {}), ...(o.visibleWhen ? { visibleWhen: o.visibleWhen } : {}),
    });
    return this;
  }

  logo(b: Px, color: ColorRole = 'ink'): this {
    // The logo layer draws her business name when she has no logo, from this variable (as the cream builder does).
    this.v('business_name', 'שם העסק', '', { source: 'business_name', max: 60 });
    this.layers.push({ id: 'logo', type: 'logo', box: this.box(b), fallback: 'business_name', color });
    return this;
  }

  graphic(kind: GraphicKind, b: Px, color: ColorRole, o: { color2?: ColorRole; colors?: ColorRole[]; opacity?: number; motion?: GraphicMotion; params?: Record<string, number>; rotate?: number; id?: string } = {}): this {
    this.layers.push({ id: o.id || this.id(`g-${kind}`), type: 'graphic', kind, box: this.box(b), color, ...(o.color2 ? { color2: o.color2 } : {}), ...(o.colors ? { colors: o.colors } : {}), ...(o.opacity !== undefined ? { opacity: o.opacity } : {}), ...(o.motion ? { motion: o.motion } : {}), ...(o.params ? { params: o.params } : {}), ...(o.rotate ? { rotate: o.rotate } : {}) });
    return this;
  }

  /**
   * A framed picture rotated like a card on a table. The card and the photo are two layers that rotate about
   * THEIR OWN centres, so the photo's centre is moved to where the card's rotated bottom-weighted centre lands:
   * both read as one object.
   */
  polaroid(slot: string, c: { cx: number; cy: number; w: number; h: number; border: number; bottom: number; deg: number }): this {
    const cardX = c.cx - c.w / 2, cardY = c.cy - c.h / 2;
    this.shape({ x: cardX, y: cardY, w: c.w, h: c.h }, 'surface', { radius: 14, rotate: c.deg });
    const pw = c.w - 2 * c.border, ph = c.h - c.border - c.bottom;
    // the photo sits above the card's centre by (bottom - border) / 2 in the card's own frame
    const dy = -(c.bottom - c.border) / 2;
    const a = (c.deg * Math.PI) / 180;
    // (0, dy) rotated clockwise by a, in screen coordinates (y down): (-dy sin a, dy cos a)
    const px = c.cx - dy * Math.sin(a);
    const py = c.cy + dy * Math.cos(a);
    this.image(slot, { x: px - pw / 2, y: py - ph / 2, w: pw, h: ph }, { radius: 6, rotate: c.deg });
    return this;
  }

  build(meta: { key: string; version?: number; category: Category; name: string; description: string; group?: TemplateGroup; fields: FieldKey[]; needs?: string[]; suggestedCaption?: string }): Template {
    const t: Template = {
      key: meta.key, version: meta.version || 1, category: meta.category, format: this.format, name: meta.name, description: meta.description,
      variables: this.variables, slots: this.slots, layers: this.layers, needs: meta.needs || [], fields: meta.fields,
    };
    if (meta.group) t.group = meta.group;
    if (meta.suggestedCaption) t.suggestedCaption = meta.suggestedCaption;
    return t;
  }
}

/** The label that says the picture is an AI character: a fixed layer, visible only while the character shows. */
export function aiLabel(f: Frame, slot: string, at: Px, color: ColorRole = 'ink', pill: ColorRole = 'surface', align: 'left' | 'right' = 'right'): void {
  const key = f.v('ai_label', 'תווית דמות AI', AI_LABEL_TEXT, { source: 'fixed', max: 30 });
  f.text(key, at, { font: 'accent', size: 28, weight: 600, color, align, maxLines: 1, pill: { color: pill, radius: 40, padding: 22 }, visibleWhen: { slot, origin: 'ai_character' }, id: 'ai-label' });
}
