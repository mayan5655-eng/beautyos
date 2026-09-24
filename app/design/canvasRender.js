'use client';

// app/design/canvasRender.js
//
// Draws a template straight onto a canvas: shapes, grain, photos, the
// decoration, stars, the logo and every text, in the same order and
// geometry DomPreview uses, with none of html2canvas in between. The PNG
// export and the reel recorder both draw with this, so a file is what the
// screen shows. Text goes through lib/design/canvasText (wrap, fit, never
// clip) and uses the browser's own shaping, so Hebrew keeps its letters in
// order and a phone number stays a phone number.

import { CANVAS, ratingCount } from '@/lib/design/contract';
import { applyOverrides } from '@/lib/design/design';
import { drawText } from '@/lib/design/canvasText';
import { resolveImageRef } from './images';

// ── Fonts ───────────────────────────────────────────────────────────────────
const familyCache = new Map();
/** A CSS font-family value with its variables resolved, so a canvas can use it. */
export function resolveFamily(css) {
  if (familyCache.has(css)) return familyCache.get(css);
  const el = document.createElement('span');
  el.style.cssText = `position:absolute;visibility:hidden;font-family:${css}`;
  document.body.appendChild(el);
  const fam = getComputedStyle(el).fontFamily || 'sans-serif';
  el.remove();
  familyCache.set(css, fam);
  return fam;
}

async function loadFonts(layers, fonts) {
  const need = new Set();
  for (const l of layers) {
    if (l.type === 'text') need.add(`${l.weight || 600}|${l.font}`);
    if (l.type === 'logo') need.add(`700|display`);
  }
  await Promise.all([...need].map((k) => {
    const [weight, role] = k.split('|');
    return document.fonts.load(`${weight} 40px ${resolveFamily(fonts[role])}`, 'אבג abc 123').catch(() => null);
  }));
  if (document.fonts?.ready) await document.fonts.ready;
}

// ── Images ──────────────────────────────────────────────────────────────────
export const loadImage = (src) => new Promise((resolve) => {
  if (!src) { resolve(null); return; }
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = src;
});

/** An SVG line drawing tinted to one colour, as an image: currentColor becomes the hex, and a size is added so it draws in every browser. */
async function loadDeco(asset, color) {
  try {
    const svg = await (await fetch(`/design-deco/${asset}.svg`)).text();
    const tinted = svg.replace(/currentColor/g, color).replace('<svg ', '<svg width="400" height="400" ');
    return await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(tinted));
  } catch { return null; }
}

/** Everything a set of layers needs that is not a number: her pictures, the logo, the grain, the tinted drawings, the fonts. */
export async function loadAssets(layers, fill, colors) {
  const assets = { images: {}, logo: null, grain: null, deco: {} };
  await loadFonts(layers, fill.fonts);
  const jobs = [];
  for (const l of layers) {
    if (l.type === 'image' && !assets.images[l.slot]) {
      assets.images[l.slot] = null;
      jobs.push((async () => { const ref = fill.images?.[l.slot]; assets.images[l.slot] = ref ? await loadImage(await resolveImageRef(ref)) : null; })());
    } else if (l.type === 'logo' && fill.logoUrl && !assets.logo) {
      jobs.push((async () => { assets.logo = await loadImage(fill.logoUrl); })());
    } else if (l.type === 'texture' && !assets.grain) {
      jobs.push((async () => { assets.grain = await loadImage('/design-grain.png'); })());
    } else if (l.type === 'deco') {
      const key = `${l.asset}|${l.color}`;
      if (!(key in assets.deco)) { assets.deco[key] = null; jobs.push((async () => { assets.deco[key] = await loadDeco(l.asset, colors[l.color]); })()); }
    }
  }
  await Promise.all(jobs);
  return assets;
}

// ── Shapes and gradients ────────────────────────────────────────────────────
const hexToRgb = (hex) => {
  const h = String(hex || '').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return Number.isNaN(n) ? { r: 0, g: 0, b: 0 } : { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};
const rgba = (hex, a) => { const { r, g, b } = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };

function rrectPath(ctx, x, y, w, h, tl, tr, br, bl) {
  const c = (r) => Math.max(0, Math.min(r, w / 2, h / 2));
  tl = c(tl); tr = c(tr); br = c(br); bl = c(bl);
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.arcTo(x + w, y, x + w, y + h, tr);
  ctx.arcTo(x + w, y + h, x, y + h, br);
  ctx.arcTo(x, y + h, x, y, bl);
  ctx.arcTo(x, y, x + w, y, tl);
  ctx.closePath();
}

/** The outline of a layer: an ellipse, an arch (round top, square bottom) or a rounded rectangle. */
function shapePath(ctx, b, l) {
  if (l.shape === 'ellipse' || l.radius === 999) { ctx.beginPath(); ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2); return; }
  if (l.shape === 'arch') { const r = b.w / 2; rrectPath(ctx, b.x, b.y, b.w, b.h, r, r, 0, 0); return; }
  const r = l.radius || 0;
  rrectPath(ctx, b.x, b.y, b.w, b.h, r, r, r, r);
}

/** A CSS-angle linear gradient across a box (180deg = top to bottom). */
function cssGradient(ctx, b, angleDeg, from, to) {
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(a), dy = -Math.cos(a);
  const half = (Math.abs(b.w * dx) + Math.abs(b.h * dy)) / 2;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const g = ctx.createLinearGradient(cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half);
  g.addColorStop(0, from); g.addColorStop(1, to);
  return g;
}

function drawWash(ctx, b, overlay, colors) {
  const c = colors[overlay.color], a = overlay.opacity;
  let fill;
  if (overlay.direction === 'bottom') { fill = ctx.createLinearGradient(0, b.y + b.h, 0, b.y); fill.addColorStop(0, rgba(c, a)); fill.addColorStop(0.4, rgba(c, a * 0.6)); fill.addColorStop(0.75, rgba(c, 0)); }
  else if (overlay.direction === 'top') { fill = ctx.createLinearGradient(0, b.y, 0, b.y + b.h); fill.addColorStop(0, rgba(c, a)); fill.addColorStop(0.7, rgba(c, 0)); }
  else if (overlay.direction === 'rise') { fill = ctx.createLinearGradient(0, b.y + b.h, 0, b.y); fill.addColorStop(0, rgba(c, a)); fill.addColorStop(0.38, rgba(c, a)); fill.addColorStop(0.55, rgba(c, a * 0.55)); fill.addColorStop(0.8, rgba(c, 0)); }
  else fill = rgba(c, a);
  ctx.fillStyle = fill;
  ctx.fillRect(b.x, b.y, b.w, b.h);
}

/** A picture in a layer's shape, covering its box around the focal point, zoomed by `zoom`, with its wash. Used by the recorder for Ken Burns. */
export function drawImageLayer(ctx, l, b, img, colors, zoom = 1) {
  ctx.save();
  shapePath(ctx, b, l);
  ctx.clip();
  if (img) {
    const scale = Math.max(b.w / img.width, b.h / img.height) * zoom;
    const dw = img.width * scale, dh = img.height * scale;
    const f = l.focus || { x: 0.5, y: 0.5 };
    ctx.drawImage(img, b.x - (dw - b.w) * f.x, b.y - (dh - b.h) * f.y, dw, dh);
  } else {
    ctx.fillStyle = cssGradient(ctx, b, 160, colors.blush, colors.sand);
    ctx.fillRect(b.x, b.y, b.w, b.h);
  }
  if (l.overlay) drawWash(ctx, b, l.overlay, colors);
  ctx.restore();
}

const STAR = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z';

// ── Layers ──────────────────────────────────────────────────────────────────
/** Pixel box of a layer on a canvas of W x H. */
export const boxPx = (l, W, H) => ({ x: (l.box.x / 100) * W, y: (l.box.y / 100) * H, w: (l.box.w / 100) * W, h: (l.box.h / 100) * H });

/**
 * Draw layers in order. `filter(layer, index, all)` skips layers (the recorder
 * draws pictures itself, live). Order and geometry follow DomPreview.
 */
export function drawLayers(ctx, { layers, fill, colors, assets, W, H, filter = null }) {
  const fonts = fill.fonts;
  layers.forEach((l, i, all) => {
    if (filter && !filter(l, i, all)) return;
    const b = boxPx(l, W, H);
    ctx.save();
    if (l.type === 'shape') {
      ctx.globalAlpha = l.opacity ?? 1;
      shapePath(ctx, b, l);
      ctx.fillStyle = l.gradient ? cssGradient(ctx, b, l.gradient.angle, colors[l.color], colors[l.gradient.to]) : colors[l.color];
      ctx.fill();
    } else if (l.type === 'texture') {
      if (assets.grain) {
        const pat = ctx.createPattern(assets.grain, 'repeat');
        if (pat && pat.setTransform && typeof DOMMatrix !== 'undefined') pat.setTransform(new DOMMatrix().scale(256 / assets.grain.width));
        ctx.globalAlpha = l.opacity;
        ctx.globalCompositeOperation = l.blend === 'multiply' ? 'multiply' : 'soft-light';
        ctx.fillStyle = pat;
        ctx.fillRect(b.x, b.y, b.w, b.h);
      }
    } else if (l.type === 'image') {
      drawImageLayer(ctx, l, b, assets.images[l.slot], colors, 1);
    } else if (l.type === 'deco') {
      const img = assets.deco[`${l.asset}|${l.color}`];
      if (img) {
        ctx.globalAlpha = l.opacity ?? 1;
        const s = Math.min(b.w, b.h);
        const x = b.x + (b.w - s) / 2, y = b.y + (b.h - s) / 2;
        if (l.flip) { ctx.translate(x + s, y); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, s, s); } else ctx.drawImage(img, x, y, s, s);
      }
    } else if (l.type === 'rating') {
      const n = ratingCount(fill.values?.[l.bind]);
      const size = b.h, gap = b.w * 0.03;
      const star = new Path2D(STAR);
      ctx.strokeStyle = colors[l.color]; ctx.fillStyle = colors[l.color]; ctx.lineJoin = 'round';
      // A right-to-left row: the first star is the rightmost. The group sits at the box's right edge, or its left for align 'left'.
      const groupRight = l.align === 'left' ? b.x + 5 * size + 4 * gap : b.x + b.w;
      for (let k = 0; k < 5; k++) {
        ctx.save();
        ctx.translate(groupRight - (k + 1) * size - k * gap, b.y); ctx.scale(size / 24, size / 24);
        ctx.lineWidth = 1.6;
        if (k < n) ctx.fill(star);
        ctx.stroke(star);
        ctx.restore();
      }
    } else if (l.type === 'logo') {
      if (assets.logo) {
        const img = assets.logo;
        const s = Math.min(b.w / img.width, b.h / img.height);
        const dw = img.width * s, dh = img.height * s;
        ctx.drawImage(img, b.x + b.w - dw, b.y + (b.h - dh) / 2, dw, dh);
      } else if (l.fallback !== 'none' && fill.values?.business_name) {
        drawText(ctx, { text: fill.values.business_name, x: b.x, y: b.y, w: b.w, h: b.h, family: resolveFamily(fonts.display), weight: 700, sizePx: 40, lineHeight: 1.1, maxLines: 1, align: 'right', valign: 'center', color: colors[l.color || 'ink'] });
      }
    } else if (l.type === 'text') {
      const str = fill.values?.[l.bind];
      if (str) {
        const k = l.size / 40;
        drawText(ctx, {
          text: str, x: b.x, y: b.y, w: b.w, h: b.h, family: resolveFamily(fonts[l.font]), weight: l.weight || 600, sizePx: l.size, lineHeight: l.lineHeight || 1.2,
          maxLines: l.maxLines || 0, align: l.align, valign: l.valign || 'center', color: colors[l.color], letterSpacingEm: l.letterSpacing || 0,
          pill: l.background ? { color: colors[l.background.color], radius: l.background.radius * k, padX: l.background.padding * k, padY: l.background.padding * 0.6 * k } : null,
        });
      }
    }
    ctx.restore();
  });
}

const canvasFor = (format) => { const c = document.createElement('canvas'); c.width = CANVAS[format].w; c.height = CANVAS[format].h; return c; };

/** A finished template as a PNG blob: the page colour, then every layer. */
export async function renderTemplateBlob(template, fill, overrides = null) {
  const colors = { ...fill.colors, ...(overrides?.colors || {}) };
  const layers = applyOverrides(template, overrides);
  const canvas = canvasFor(template.format);
  const ctx = canvas.getContext('2d');
  const assets = await loadAssets(layers, fill, colors);
  ctx.fillStyle = colors.surface;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawLayers(ctx, { layers, fill, colors, assets, W: canvas.width, H: canvas.height });
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('הייצוא נכשל'))), 'image/png'));
}

/** Some of a frame's layers on a transparent canvas (the recorder's under-photo and over-photo parts). */
export async function renderLayersCanvas(frame, fill, filter, overrides = null) {
  const colors = { ...fill.colors, ...(overrides?.colors || {}) };
  const layers = applyOverrides(frame, overrides);
  const canvas = canvasFor(frame.format);
  const assets = await loadAssets(layers.filter((l, i, all) => filter(l, i, all)), fill, colors);
  drawLayers(canvas.getContext('2d'), { layers, fill, colors, assets, W: canvas.width, H: canvas.height, filter });
  return canvas;
}
