// lib/design/sceneSpec.ts
//
// Template + her fill + her overrides -> a flat, vendor-neutral list of
// blocks in absolute pixels and hex colours. This is what a renderer draws.
// Roles are resolved here, percentages become pixels here, fonts become
// files here, so a renderer has nothing to interpret.
//
// The reverse direction (a renderer reporting a moved box) goes through
// pxBoxToPercent, so what lands in overrides is always template units.

import { CANVAS, type Box, type Template } from './contract.ts';
import { applyOverrides, type Overrides } from './design.ts';
import type { Fill } from './mapBranding.ts';

export type FontFiles = { display: string; body: string };

export type SceneBlock =
  | { kind: 'rect'; id: string; x: number; y: number; w: number; h: number; color: string; opacity: number; radius: number; gradientTo: string | null; gradientAngle: number }
  | { kind: 'image'; id: string; x: number; y: number; w: number; h: number; ref: string | null; fit: 'cover' | 'contain'; focusX: number; focusY: number; radius: number; overlayColor: string | null; overlayOpacity: number; overlayDirection: 'top' | 'bottom' | 'flat' }
  | { kind: 'text'; id: string; x: number; y: number; w: number; h: number; bind: string; text: string; fontFile: string; sizePx: number; weight: number; color: string; align: 'right' | 'center' | 'left'; maxLines: number; lineHeight: number; pillColor: string | null; pillRadius: number; pillPadding: number; editable: boolean }
  | { kind: 'logo'; id: string; x: number; y: number; w: number; h: number; ref: string | null; fallbackText: string | null; fontFile: string; color: string };

export type SceneSpec = {
  width: number;
  height: number;
  background: string;
  blocks: SceneBlock[];
};

const r1 = (n: number) => Math.round(n * 10) / 10;

export function buildSceneSpec(template: Template, fill: Fill, overrides: Overrides | null | undefined, fonts: FontFiles): SceneSpec {
  const canvas = CANVAS[template.format] || CANVAS.feed45;
  const colors = { ...fill.colors, ...(overrides?.colors || {}) };
  const px = (b: Box) => ({ x: r1((b.x / 100) * canvas.w), y: r1((b.y / 100) * canvas.h), w: r1((b.w / 100) * canvas.w), h: r1((b.h / 100) * canvas.h) });
  const blocks: SceneBlock[] = [];
  for (const l of applyOverrides(template, overrides)) {
    const box = px(l.box);
    if (l.type === 'shape') {
      blocks.push({ kind: 'rect', id: l.id, ...box, color: colors[l.color], opacity: l.opacity ?? 1, radius: l.radius || 0, gradientTo: l.gradient ? colors[l.gradient.to] : null, gradientAngle: l.gradient?.angle ?? 180 });
    } else if (l.type === 'image') {
      blocks.push({
        kind: 'image', id: l.id, ...box, ref: fill.images?.[l.slot] || null, fit: l.fit, focusX: l.focus?.x ?? 0.5, focusY: l.focus?.y ?? 0.5, radius: l.radius || 0,
        overlayColor: l.overlay ? colors[l.overlay.color] : null, overlayOpacity: l.overlay?.opacity ?? 0, overlayDirection: l.overlay?.direction || 'flat',
      });
    } else if (l.type === 'logo') {
      const fallback = l.fallback === 'business_name' ? (fill.values.business_name || null) : null;
      if (!fill.logoUrl && !fallback) continue;
      blocks.push({ kind: 'logo', id: l.id, ...box, ref: fill.logoUrl, fallbackText: fill.logoUrl ? null : fallback, fontFile: fonts.display, color: colors[l.color || 'ink'] });
    } else if (l.type === 'text') {
      const text = fill.values?.[l.bind] || '';
      if (!text) continue;
      blocks.push({
        kind: 'text', id: l.id, ...box, bind: l.bind, text, fontFile: l.font === 'display' ? fonts.display : fonts.body, sizePx: l.size, weight: l.weight || 600, color: colors[l.color],
        align: l.align, maxLines: l.maxLines || 0, lineHeight: l.lineHeight || 1.2,
        pillColor: l.background ? colors[l.background.color] : null, pillRadius: l.background?.radius || 0, pillPadding: l.background?.padding || 0,
        editable: l.editable !== false,
      });
    }
  }
  return { width: canvas.w, height: canvas.h, background: colors.surface, blocks };
}

/** A renderer's pixel box back into template percentages, clamped to the canvas. */
export function pxBoxToPercent(canvas: { w: number; h: number }, b: { x: number; y: number; w: number; h: number }): Box {
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
  const w = clamp((b.w / canvas.w) * 100, 0.5, 100);
  const h = clamp((b.h / canvas.h) * 100, 0.5, 100);
  const x = clamp((b.x / canvas.w) * 100, 0, 100 - w);
  const y = clamp((b.y / canvas.h) * 100, 0, 100 - h);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { x: r2(x), y: r2(y), w: r2(w), h: r2(h) };
}

/** True when two boxes differ by more than rounding noise. */
export function boxChanged(a: Box, b: Box): boolean {
  return Math.abs(a.x - b.x) > 0.05 || Math.abs(a.y - b.y) > 0.05 || Math.abs(a.w - b.w) > 0.05 || Math.abs(a.h - b.h) > 0.05;
}
