// lib/design/canvasText.ts
//
// Text on a canvas, the way the studio wants it: wrapped at word breaks,
// shrunk only as far as needed (lib/design/fitText), aligned in its box,
// never clipped. It talks to a canvas only through the few 2D-context
// members below, so a test can hand it a model and check the lines it
// would draw.
//
// This is what the reel recorder and the PNG export draw text with. They
// used to rasterise the DOM with html2canvas, which laid out its own copy of
// the page: it drew wrapped headlines lower than the DOM had placed them
// (the second line fell below the box and was clipped), scrambled the
// order of letter-spaced Hebrew, and had no answer for CSS masks. Drawing
// with fillText uses the browser's own text shaping and bidi, so Hebrew,
// digits and Latin come out as they do on screen.

import { fitText } from './fitText.ts';

export type CanvasLike = {
  font: string;
  fillStyle: unknown;
  textAlign: string;
  textBaseline: string;
  direction?: string;
  letterSpacing?: string;
  measureText: (s: string) => { width: number; fontBoundingBoxAscent?: number; fontBoundingBoxDescent?: number };
  fillText: (s: string, x: number, y: number) => void;
  save: () => void;
  restore: () => void;
  beginPath: () => void;
  fill: () => void;
  moveTo: (x: number, y: number) => void;
  lineTo: (x: number, y: number) => void;
  arcTo: (x1: number, y1: number, x2: number, y2: number, r: number) => void;
  closePath: () => void;
};

export type TextSpec = {
  text: string;
  /** The box, in canvas pixels. */
  x: number; y: number; w: number; h: number;
  /** A resolved CSS font-family list. */
  family: string;
  weight: number;
  sizePx: number;
  lineHeight: number;
  /** 0 = as many lines as the box holds. */
  maxLines: number;
  align: 'right' | 'center' | 'left';
  valign: 'top' | 'center' | 'bottom';
  color: string;
  /** In em. */
  letterSpacingEm?: number;
  /** A pill behind the text: colour, corner radius and padding in canvas pixels. */
  pill?: { color: string; radius: number; padX: number; padY: number } | null;
};

export type DrawnText = { px: number; lines: string[]; fits: boolean; tops: number[] };

/** 'ltr' for text with no Hebrew or Arabic letters (a phone, a handle, a Latin name); 'rtl' otherwise. */
export const textDirection = (s: string): 'ltr' | 'rtl' => (/[֐-׿؀-ۿ]/.test(s) ? 'rtl' : 'ltr');

/**
 * Greedy word wrap. A single word wider than the line is broken by
 * characters, like `word-break: break-word`.
 */
export function wrapWords(text: string, maxWidth: number, width: (s: string) => number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (!cur || width(next) <= maxWidth) { cur = next; continue; }
    lines.push(cur);
    cur = w;
  }
  if (cur) lines.push(cur);
  const out: string[] = [];
  for (const l of lines) {
    if (l.includes(' ') || width(l) <= maxWidth) { out.push(l); continue; }
    let piece = '';
    for (const ch of Array.from(l)) {
      if (piece && width(piece + ch) > maxWidth) { out.push(piece); piece = ch; } else piece += ch;
    }
    if (piece) out.push(piece);
  }
  return out;
}

function roundRect(ctx: CanvasLike, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Lay out and draw one text layer. */
export function drawText(ctx: CanvasLike, s: TextSpec): DrawnText {
  const text = s.text.replace(/\s+/g, ' ').trim();
  if (!text) return { px: s.sizePx, lines: [], fits: true, tops: [] };
  const dir = textDirection(text);
  const pill = s.pill || null;
  const availW = s.w - (pill ? 2 * pill.padX : 0);
  const availH = s.h - (pill ? 2 * pill.padY : 0);
  const spacing = s.letterSpacingEm || 0;

  const setFont = (px: number) => {
    ctx.font = `${s.weight} ${px}px ${s.family}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = spacing ? `${(spacing * px).toFixed(2)}px` : '0px';
    ctx.direction = dir;
  };
  const linesAt = (px: number) => {
    setFont(px);
    const w = (str: string) => ctx.measureText(str).width;
    return s.maxLines === 1 ? [text] : wrapWords(text, availW, w);
  };
  const measure = (px: number) => {
    const lines = linesAt(px);
    setFont(px);
    return { width: Math.max(...lines.map((l) => ctx.measureText(l).width)), height: lines.length * px * s.lineHeight };
  };

  const fit = fitText({ basePx: s.sizePx, lineHeight: s.lineHeight, maxLines: s.maxLines, boxWidth: availW, boxHeight: availH, measure });
  const px = fit.px;
  const lines = linesAt(px);
  setFont(px);
  const lineH = px * s.lineHeight;
  const blockH = lines.length * lineH;
  const contentW = Math.max(...lines.map((l) => ctx.measureText(l).width));

  // Where the block sits: a pill hugs its text and sits by alignment; plain text sits by valign in the box.
  let left: number, right: number, top: number;
  if (pill) {
    const pw = Math.min(s.w, contentW + 2 * pill.padX), ph = blockH + 2 * pill.padY;
    const px0 = s.align === 'right' ? s.x + s.w - pw : s.align === 'left' ? s.x : s.x + (s.w - pw) / 2;
    const py0 = s.y + (s.h - ph) / 2;
    ctx.save();
    ctx.fillStyle = pill.color;
    roundRect(ctx, px0, py0, pw, ph, pill.radius);
    ctx.fill();
    ctx.restore();
    left = px0 + pill.padX; right = px0 + pw - pill.padX; top = py0 + pill.padY;
  } else {
    left = s.x; right = s.x + s.w;
    top = s.valign === 'top' ? s.y : s.valign === 'bottom' ? s.y + s.h - blockH : s.y + (s.h - blockH) / 2;
  }

  // Baseline of a line box: CSS centres the font's content area in the line.
  const m = ctx.measureText('Hg');
  const asc = m.fontBoundingBoxAscent ?? px * 0.8, desc = m.fontBoundingBoxDescent ?? px * 0.2;
  ctx.fillStyle = s.color;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = s.align;
  const x = s.align === 'right' ? right : s.align === 'left' ? left : (left + right) / 2;
  const tops: number[] = [];
  lines.forEach((line, i) => {
    const lineTop = top + i * lineH;
    tops.push(lineTop);
    ctx.fillText(line, x, lineTop + (lineH - (asc + desc)) / 2 + asc);
  });
  return { px, lines, fits: fit.fits, tops };
}
