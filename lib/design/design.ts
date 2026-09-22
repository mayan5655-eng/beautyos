// lib/design/design.ts
//
// A design is HER row: a template key + version, the values she filled, the
// pictures she chose, and her overrides - what she changed beyond filling.
// The template stays immutable; overrides are merged over it at render time,
// so a design can always be reopened exactly as she left it.
//
// overrides = {
//   layers: { [layerId]: { box?, size?, color?, hidden?, align?, weight? } },
//   colors: { [role]: '#hex' },          // her palette swaps
//   order:  ['layerId', ...]              // z-order, when she reordered
// }

import { COLOR_ROLES, type ColorRole, type Layer, type Template } from './contract.ts';

export type LayerOverride = {
  box?: { x: number; y: number; w: number; h: number };
  size?: number;
  color?: ColorRole;
  align?: 'right' | 'center' | 'left';
  weight?: 400 | 500 | 600 | 700 | 800;
  hidden?: boolean;
};

export type Overrides = {
  layers?: Record<string, LayerOverride>;
  colors?: Partial<Record<ColorRole, string>>;
  order?: string[];
  /** Slot -> she confirmed the client agreed to publication (before/after). */
  consent?: Record<string, boolean>;
};

/**
 * A picture reference a design may hold: a public https URL, or a private
 * storage path prefixed "private:" (client before/after photos), which the
 * renderer turns into a short-lived signed URL at view time and never
 * stores signed.
 */
export const PRIVATE_REF = /^private:[0-9a-f-]{36}\/clients\/[A-Za-z0-9._\/-]{1,300}$/i;
export const isPrivateRef = (v: unknown): v is string => typeof v === 'string' && PRIVATE_REF.test(v);
export const privatePath = (ref: string) => ref.replace(/^private:/, '');

export type DesignRow = {
  id: string;
  tenant_id: string;
  template_key: string;
  template_version: number;
  category: string;
  format: string;
  name: string;
  values: Record<string, string>;
  images: Record<string, string | null>;
  overrides: Overrides;
  preview_path: string | null;
  export_path: string | null;
  is_default: boolean;
  parent_id: string | null;
  status: 'draft' | 'final' | 'archived';
  created_at: string;
  updated_at: string;
};

const num = (v: unknown, lo: number, hi: number): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};

/** Only what the shape allows, clamped; anything else is dropped silently. */
export function sanitizeOverrides(raw: unknown): Overrides {
  const o = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const out: Overrides = {};
  const layers = o.layers && typeof o.layers === 'object' && !Array.isArray(o.layers) ? (o.layers as Record<string, unknown>) : null;
  if (layers) {
    out.layers = {};
    for (const [id, v] of Object.entries(layers)) {
      if (!/^[a-z0-9_-]{1,40}$/i.test(id) || !v || typeof v !== 'object') continue;
      const l = v as Record<string, unknown>;
      const lo: LayerOverride = {};
      if (l.box && typeof l.box === 'object') {
        const b = l.box as Record<string, unknown>;
        const x = num(b.x, 0, 100), y = num(b.y, 0, 100), w = num(b.w, 0.5, 100), h = num(b.h, 0.5, 100);
        if (x !== null && y !== null && w !== null && h !== null && x + w <= 100.0001 && y + h <= 100.0001) lo.box = { x, y, w, h };
      }
      const size = num(l.size, 8, 400); if (size !== null) lo.size = size;
      if (typeof l.color === 'string' && COLOR_ROLES.includes(l.color as ColorRole)) lo.color = l.color as ColorRole;
      if (l.align === 'right' || l.align === 'center' || l.align === 'left') lo.align = l.align;
      if ([400, 500, 600, 700, 800].includes(Number(l.weight))) lo.weight = Number(l.weight) as LayerOverride['weight'];
      if (typeof l.hidden === 'boolean') lo.hidden = l.hidden;
      if (Object.keys(lo).length) out.layers[id] = lo;
    }
  }
  const colors = o.colors && typeof o.colors === 'object' && !Array.isArray(o.colors) ? (o.colors as Record<string, unknown>) : null;
  if (colors) {
    out.colors = {};
    for (const [role, hex] of Object.entries(colors)) {
      if (COLOR_ROLES.includes(role as ColorRole) && typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex)) out.colors[role as ColorRole] = hex;
    }
  }
  if (Array.isArray(o.order)) {
    const order = o.order.filter((id): id is string => typeof id === 'string' && /^[a-z0-9_-]{1,40}$/i.test(id));
    if (order.length) out.order = [...new Set(order)];
  }
  const consent = o.consent && typeof o.consent === 'object' && !Array.isArray(o.consent) ? (o.consent as Record<string, unknown>) : null;
  if (consent) {
    out.consent = {};
    for (const [slot, v] of Object.entries(consent)) if (/^[a-z0-9_-]{1,40}$/i.test(slot) && v === true) out.consent[slot] = true;
  }
  return out;
}

/** Text values, trimmed and capped by the template's own maxLength. */
export function sanitizeValues(template: Template, raw: unknown): Record<string, string> {
  const o = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const v of template.variables) {
    if (typeof o[v.key] !== 'string') continue;
    let s = (o[v.key] as string).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
    if (v.maxLength && s.length > v.maxLength) s = s.slice(0, v.maxLength).trim();
    out[v.key] = s;
  }
  return out;
}

/** Slot -> URL, only for slots the template has and only http(s) URLs. */
export function sanitizeImages(template: Template, raw: unknown): Record<string, string | null> {
  const o = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const out: Record<string, string | null> = {};
  for (const s of template.slots) {
    const v = o[s.key];
    if (v === null) { out[s.key] = null; continue; }
    if (typeof v === 'string' && (/^https:\/\/[^\s"'<>]{1,2000}$/.test(v) || isPrivateRef(v))) out[s.key] = v;
  }
  return out;
}

/** The template's layers with her overrides applied and her order respected. */
export function applyOverrides(template: Template, overrides: Overrides | null | undefined): Layer[] {
  const ov = overrides || {};
  let layers: Layer[] = template.layers.map((l) => {
    const o = ov.layers?.[l.id];
    if (!o) return l;
    const next: Layer = { ...l };
    if (o.box) next.box = o.box;
    if (next.type === 'text') {
      if (o.size) next.size = o.size;
      if (o.color) next.color = o.color;
      if (o.align) next.align = o.align;
      if (o.weight) next.weight = o.weight;
    } else if (next.type === 'shape' && o.color) {
      next.color = o.color;
    } else if (next.type === 'logo' && o.color) {
      next.color = o.color;
    }
    return next;
  });
  if (ov.layers) layers = layers.filter((l) => !ov.layers?.[l.id]?.hidden);
  if (ov.order?.length) {
    const rank = new Map(ov.order.map((id, i) => [id, i]));
    layers = [...layers].sort((a, b) => (rank.get(a.id) ?? 1e6) - (rank.get(b.id) ?? 1e6));
  }
  return layers;
}
