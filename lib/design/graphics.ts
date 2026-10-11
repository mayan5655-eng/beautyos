// lib/design/graphics.ts
//
// The geometry of a `graphic` layer (lib/design/contract.ts), as plain data: an ordered list of paths and
// text runs in the layer's own pixel box. Nothing here draws. The DOM preview turns the list into an <svg>,
// the canvas renderer (PNG export, reel recorder) into Path2D calls, and a test reads it directly - so the
// three can never disagree about what a calendar or a wave looks like, and "the same picture everywhere" is
// a property of one function rather than of three copies.
//
// Coordinates are in canvas pixels at 1080 wide, relative to the top-left of the layer's box. Colours are
// ROLES (or 'white', which resolves to a warm off-white - the studio look never uses pure white), resolved
// by whoever draws against her colours.
//
// `t` is seconds. Only a layer with a `motion` reads it; everything else is the still pose. Callers that
// show a still pass STILL_T, so the gallery card, the editor and the PNG are one pose.

import type { ColorRole, GraphicLayer } from './contract.ts';

export type Paint = ColorRole | 'white';

export type Prim =
  | { t: 'path'; d: string; fill?: Paint; stroke?: Paint; strokeWidth?: number; opacity?: number; dash?: [number, number] }
  | { t: 'text'; x: number; y: number; size: number; str: string; fill: Paint };

export type GraphicDrawing = {
  w: number;
  h: number;
  prims: Prim[];
  /** Whole-drawing rotation about (cx, cy), degrees clockwise. */
  rotate?: { deg: number; cx: number; cy: number };
};

/** The pose every non-recording renderer draws. */
export const STILL_T = 2.2;
/** 'white' resolves here: warm, never #FFFFFF. */
export const WARM_WHITE = '#FFFDF9';

export const resolvePaint = (p: Paint, colors: Record<ColorRole, string>): string => (p === 'white' ? WARM_WHITE : colors[p]);

const r1 = (n: number) => Math.round(n * 10) / 10;
const pt = (x: number, y: number) => `${r1(x)} ${r1(y)}`;

export function circlePath(cx: number, cy: number, r: number): string {
  return `M${pt(cx - r, cy)}a${r1(r)} ${r1(r)} 0 1 0 ${r1(2 * r)} 0a${r1(r)} ${r1(r)} 0 1 0 ${r1(-2 * r)} 0Z`;
}

export function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return `M${pt(cx - rx, cy)}a${r1(rx)} ${r1(ry)} 0 1 0 ${r1(2 * rx)} 0a${r1(rx)} ${r1(ry)} 0 1 0 ${r1(-2 * rx)} 0Z`;
}

export function rrectPath(x: number, y: number, w: number, h: number, r: number): string {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  return `M${pt(x + k, y)}H${r1(x + w - k)}A${r1(k)} ${r1(k)} 0 0 1 ${pt(x + w, y + k)}V${r1(y + h - k)}A${r1(k)} ${r1(k)} 0 0 1 ${pt(x + w - k, y + h)}H${r1(x + k)}A${r1(k)} ${r1(k)} 0 0 1 ${pt(x, y + h - k)}V${r1(y + k)}A${r1(k)} ${r1(k)} 0 0 1 ${pt(x + k, y)}Z`;
}

export function starPath(cx: number, cy: number, R: number, points: number, rotation: number): string {
  const n = Math.max(3, Math.round(points));
  const parts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n + rotation;
    const q = i % 2 ? R * 0.24 : R;
    parts.push(`${i ? 'L' : 'M'}${pt(cx + Math.cos(a) * q, cy + Math.sin(a) * q)}`);
  }
  return parts.join('') + 'Z';
}

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export function graphicDrawing(l: GraphicLayer, w: number, h: number, t: number = STILL_T): GraphicDrawing {
  const animated = !!l.motion && l.motion !== 'none';
  const op = l.opacity ?? 1;
  const P = l.params || {};
  const prims: Prim[] = [];
  let rotate: GraphicDrawing['rotate'] = l.rotate ? { deg: l.rotate, cx: w / 2, cy: h / 2 } : undefined;

  switch (l.kind) {
    case 'wave': {
      const amp = Math.max(4, Math.min(num(P.amp, 70), h / 3));
      const phase = num(P.phase, 0) + (animated && l.motion === 'wave' ? t * 0.6 * num(P.dir, 1) : 0);
      const top = amp * 1.5;
      const pts: string[] = [];
      for (let x = -20; x <= w + 20; x += 16) {
        const y = top + amp * Math.sin(x / 260 + phase) + amp * 0.36 * Math.sin(x / 130 - phase * 0.7);
        pts.push(`${pts.length ? 'L' : 'M'}${pt(x, y)}`);
      }
      prims.push({ t: 'path', d: `${pts.join('')}L${pt(w + 20, h + 20)}L${pt(-20, h + 20)}Z`, fill: l.color, opacity: op });
      break;
    }
    case 'swatches': {
      const colors = l.colors && l.colors.length ? l.colors : [l.color];
      const n = colors.length;
      const r = Math.min(h * 0.34, w / (n * 2.6));
      colors.forEach((c, i) => {
        const cx = (w * (i + 0.5)) / n;
        const cy = h / 2 + (animated && l.motion === 'float' ? 14 * Math.sin(t * 2 + i) : 0);
        prims.push({ t: 'path', d: circlePath(cx, cy, r), fill: c, opacity: op });
        prims.push({ t: 'path', d: circlePath(cx, cy, r + 10), stroke: 'white', strokeWidth: 2, opacity: 0.5 * op });
      });
      break;
    }
    case 'burst': {
      const R = Math.min(w, h) / 2;
      const rot = num(P.rot, 0) + (animated && l.motion === 'spin' ? t * 0.18 : 0);
      prims.push({ t: 'path', d: starPath(w / 2, h / 2, R, num(P.points, 4), rot), fill: l.color, opacity: op });
      break;
    }
    case 'calendar': {
      const rad = Math.min(w, h) * 0.06;
      const head = h * 0.15;
      // a soft offset copy stands in for a shadow, so every renderer draws it the same way
      prims.push({ t: 'path', d: rrectPath(0, h * 0.02, w, h * 0.98, rad), fill: 'ink', opacity: 0.12 * op });
      prims.push({ t: 'path', d: rrectPath(0, 0, w, h * 0.98, rad), fill: 'white', opacity: op });
      prims.push({
        t: 'path',
        d: `M0 ${r1(rad)}A${r1(rad)} ${r1(rad)} 0 0 1 ${pt(rad, 0)}H${r1(w - rad)}A${r1(rad)} ${r1(rad)} 0 0 1 ${pt(w, rad)}V${r1(head)}H0Z`,
        fill: l.color,
        opacity: op,
      });
      const hl = l.color2 || 'primary';
      const hlCol = num(P.hlCol, 3), hlRow = num(P.hlRow, 1);
      const gridTop = head + (h * 0.98 - head) * 0.14;
      const rowGap = (h * 0.98 - head) * 0.215;
      const cr = Math.min(w / 5 * 0.26, rowGap * 0.4);
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 5; col++) {
          const cx = w * (0.12 + col * 0.19), cy = gridTop + row * rowGap;
          const on = row === hlRow && col === hlCol;
          prims.push({ t: 'path', d: circlePath(cx, cy, cr), fill: on ? hl : 'surface', opacity: op });
          prims.push({ t: 'text', x: cx, y: cy + cr * 0.36, size: cr * 0.95, str: String(1 + row * 5 + col), fill: 'ink' });
        }
      }
      if (animated && l.motion === 'tilt') rotate = { deg: num(P.tilt, 2) * Math.sin(t * 0.7), cx: w / 2, cy: h / 2 };
      break;
    }
    case 'bottle': {
      prims.push({ t: 'path', d: rrectPath(w * 0.1, h * 0.28, w * 0.8, h * 0.72, w * 0.3), fill: l.color, opacity: op });
      prims.push({ t: 'path', d: rrectPath(w * 0.34, 0, w * 0.32, h * 0.36, w * 0.06), fill: l.color2 || 'ink', opacity: op });
      prims.push({ t: 'path', d: rrectPath(w * 0.24, h * 0.5, w * 0.16, h * 0.28, w * 0.08), fill: 'white', opacity: 0.25 * op });
      if (animated && l.motion === 'float') rotate = { deg: 3 * Math.sin(t * 0.7), cx: w / 2, cy: h / 2 };
      break;
    }
    case 'rings': {
      const count = Math.max(1, Math.min(10, Math.round(num(P.count, 6))));
      for (let i = 0; i < count; i++) {
        const k = 0.62 + i * 0.07;
        prims.push({ t: 'path', d: ellipsePath(w / 2, h / 2, (w / 2) * k, (h / 2) * k), stroke: l.color, strokeWidth: 3, opacity: Math.max(0.05, 0.2 - i * 0.022) * op });
      }
      break;
    }
    case 'frame': {
      prims.push({ t: 'path', d: rrectPath(3, 3, w - 6, h - 6, num(P.radius, 50)), stroke: l.color, strokeWidth: 3, dash: [7, 17], opacity: op });
      break;
    }
  }
  return { w, h, prims, ...(rotate ? { rotate } : {}) };
}
