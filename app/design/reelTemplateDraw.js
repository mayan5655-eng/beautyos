'use client';

// app/design/reelTemplateDraw.js
//
// Paints and encodes a "תבניות רילס" reel (lib/design/reelTemplates.js) in her browser. Per frame, in this order:
//
//   1. her photo or the clip's frame, covering 9:16, moved by the slot's effect (push-in, Ken Burns, a zoom punch
//      on the beat; clips also change speed: slow motion, sped up, a speed ramp; see sourceMsAt)
//   2. the colour look, as blend-mode washes (warm, clean, soft glam, moody), plus film grain or bokeh where the look
//      has them. Blend modes, not ctx.filter and not per-pixel curves: Safari draws them, and they cost nothing
//   3. the slot's accent: a shine sweeping across (nails) or a few soft sparkles
//   4. the transition from the scene before (a copy of its last frame): flash, dissolve, whip, slide, or the
//      before/after split with a divider that sweeps across, pauses in the middle, and finishes
//   5. the words, one line at a time, each line chosen by us and drawn on its own (.claude/skills/kalmea §4), with
//      the template's entrance: letters appearing right to left, a pop, a highlight bar, a rise, a slam
//   6. her logo (or business name) and a thin bar of her colour
//
// The closing card is her own surface colour with her logo, name, how to book and her handle, each line coming in
// on the beat. Nothing here reads the DOM; text is drawn with fillText straight onto the canvas.
//
// Encoding is the studio's (reelEncoder.js: frame-exact H.264 MP4 with the music as AAC), and MediaRecorder in real
// time where WebCodecs is missing (the clips then play in <video> elements at the slot's speed). The same real-time
// loop is the preview she watches before she exports.

import { resizeImage, IMAGE_PRESETS, COULD_NOT_SHRINK_HE } from '@/lib/imageResize';
import { pickRecorderMime, fileExtFor } from '@/lib/design/recorderMime';
import { drawText } from '@/lib/design/canvasText';
import { renderMood, encodeWav } from '@/lib/design/reelMusic';
import { zoomAt, driftAt, rateAt, sourceMsAt, textBlock, LINE_HEIGHT, transitionHits } from '@/lib/design/reelTemplates';
import { W, H, seekClip, openClip } from './ownReelDraw';
import { encodePresets, canEncodeMusic, encodeReelMp4 } from './reelEncoder';

export { W, H };

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const backOut = (x) => { const t = clamp01(x), c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

/** A photo, shrunk once and decoded. Rejects in Hebrew when this browser cannot read it (HEIC outside Safari). */
export async function preparePhoto(file) {
  const blob = await resizeImage(file, { ...IMAGE_PRESETS.gallery, maxWidth: 1600, maxHeight: 1600 });
  const url = URL.createObjectURL(blob);
  const img = await new Promise((resolve) => { const i = new Image(); i.onload = () => resolve(i.naturalWidth > 0 ? i : null); i.onerror = () => resolve(null); i.src = url; });
  if (!img) { URL.revokeObjectURL(url); throw new Error(COULD_NOT_SHRINK_HE); }
  return { url, img };
}

const sizeOf = (src) => ({ w: src.videoWidth || src.naturalWidth || src.width, h: src.videoHeight || src.naturalHeight || src.height });

function cover(ctx, src, zoom = 1, drift = 0) {
  const { w, h } = sizeOf(src);
  if (!w || !h) return;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const s = Math.max(W / w, H / h) * zoom;
  const dw = w * s, dh = h * s;
  ctx.drawImage(src, (W - dw) / 2 + (drift * (dw - W)) / 2, (H - dh) / 2, dw, dh);
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y); ctx.arcTo(x + w, y, x + w, y + h, rr); ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr); ctx.arcTo(x, y, x + w, y, rr); ctx.closePath();
}

// Deterministic "random" for grain, bokeh and sparkles: the same reel draws the same frame every time.
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// ── Placeholder media (template previews): abstract shapes, never faces ────

const PALETTES = {
  lashes: ['#3b2a35', '#a8737e', '#f2c6c2', '#fbede9'],
  nails: ['#2f3a36', '#c98b8b', '#e9c9a8', '#f7efe6'],
  facial: ['#33403a', '#8fa79a', '#dce4d5', '#fbf8f1'],
};
/** Draw an abstract "shot" for slot `i` at time `t` (s) onto a small canvas: soft blobs and arcs drifting. `seed` varies it per template. */
export function drawPlaceholder(c, group, i0, t, seed = 0) {
  const i = i0 + seed * 3;
  const ctx = c.getContext('2d');
  const w = c.width, h = c.height, pal = PALETTES[group] || PALETTES.lashes;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, pal[(i + 0) % 4]); g.addColorStop(1, pal[(i + 1) % 4]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  for (let k = 0; k < 5; k++) {
    const x = w * (0.2 + 0.6 * hash(i * 9 + k)) + Math.sin(t * 0.9 + k) * w * 0.08;
    const y = h * (0.2 + 0.6 * hash(i * 13 + k + 3)) + Math.cos(t * 0.7 + k * 2) * h * 0.05;
    const r = w * (0.18 + 0.25 * hash(k + i * 5));
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, pal[(k + i + 2) % 4] + 'cc'); rg.addColorStop(1, pal[(k + i + 2) % 4] + '00');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = Math.max(1, w / 90);
  for (let k = 0; k < 7; k++) {
    const y = h * 0.5 + (k - 3) * h * 0.03, sway = Math.sin(t * 1.3 + k) * w * 0.03;
    ctx.beginPath(); ctx.moveTo(w * 0.18, y); ctx.quadraticCurveTo(w * 0.5 + sway, y - h * (0.08 + 0.01 * k), w * 0.82, y); ctx.stroke();
  }
  return c;
}

// ── Looks ──────────────────────────────────────────────────────────────────

let grainTile = null;
function grain() {
  if (grainTile || typeof document === 'undefined') return grainTile;
  const c = document.createElement('canvas'); c.width = c.height = 192;
  const x = c.getContext('2d'), d = x.createImageData(192, 192);
  for (let i = 0; i < d.data.length; i += 4) { const v = Math.floor(hash(i * 0.37) * 255); d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  x.putImageData(d, 0, 0);
  grainTile = c;
  return c;
}

function vignette(ctx, strength, color = '0,0,0') {
  const g = ctx.createRadialGradient(W / 2, H * 0.48, W * 0.35, W / 2, H * 0.48, H * 0.72);
  g.addColorStop(0, `rgba(${color},0)`); g.addColorStop(1, `rgba(${color},${strength})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

function wash(ctx, mode, color) { ctx.globalCompositeOperation = mode; ctx.fillStyle = color; ctx.fillRect(0, 0, W, H); }

/** The colour look, over the picture. `el` = ms into the reel (grain and bokeh move with it). */
export function applyLook(ctx, look, el) {
  ctx.save();
  if (look === 'warm') {
    wash(ctx, 'soft-light', 'rgba(255,165,90,0.30)');
    wash(ctx, 'screen', 'rgba(255,214,170,0.06)');
    ctx.globalCompositeOperation = 'multiply'; vignette(ctx, 0.32, '90,50,20');
  } else if (look === 'clean') {
    wash(ctx, 'screen', 'rgba(255,255,255,0.08)');
    wash(ctx, 'soft-light', 'rgba(190,215,255,0.16)');
    ctx.globalCompositeOperation = 'source-over'; vignette(ctx, 0.08);
  } else if (look === 'glam') {
    wash(ctx, 'soft-light', 'rgba(255,150,185,0.30)');
    ctx.globalCompositeOperation = 'screen';
    const g = ctx.createRadialGradient(W * 0.7, H * 0.18, 0, W * 0.7, H * 0.18, W * 0.9);
    g.addColorStop(0, 'rgba(255,225,238,0.22)'); g.addColorStop(1, 'rgba(255,225,238,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // bokeh: a few soft discs of light drifting upward
    for (let k = 0; k < 8; k++) {
      const x = W * hash(k + 1), r = 50 + 90 * hash(k + 11);
      const y = ((H * hash(k + 21) - el * (0.02 + 0.03 * hash(k + 31))) % (H + 2 * r) + H + 2 * r) % (H + 2 * r) - r;
      const b = ctx.createRadialGradient(x, y, 0, x, y, r);
      b.addColorStop(0, 'rgba(255,236,245,0.20)'); b.addColorStop(0.7, 'rgba(255,236,245,0.10)'); b.addColorStop(1, 'rgba(255,236,245,0)');
      ctx.fillStyle = b; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    ctx.globalCompositeOperation = 'source-over'; vignette(ctx, 0.16, '60,20,40');
  } else if (look === 'moody') {
    wash(ctx, 'multiply', 'rgba(70,60,85,0.35)');
    wash(ctx, 'soft-light', 'rgba(20,70,90,0.22)');
    ctx.globalCompositeOperation = 'source-over'; vignette(ctx, 0.55);
    const tile = grain();
    if (tile) {
      ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.09;
      const ox = Math.floor(hash(Math.floor(el / 42)) * 192), oy = Math.floor(hash(Math.floor(el / 42) + 7) * 192);
      const pat = ctx.createPattern(tile, 'repeat');
      ctx.translate(-ox, -oy); ctx.fillStyle = pat; ctx.fillRect(0, 0, W + 192, H + 192);
    }
  }
  ctx.restore();
}

// ── Accents ────────────────────────────────────────────────────────────────

function accent(ctx, kind, p, el) {
  if (!kind) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (kind === 'glint') {
    // one shine sweeping across, diagonal, between a quarter and three quarters of the shot
    const q = clamp01((p - 0.25) / 0.5);
    if (q > 0 && q < 1) {
      const x = W * 1.3 - q * W * 1.6;
      const g = ctx.createLinearGradient(x - 160, 0, x + 160, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(255,250,240,${0.34 * Math.sin(Math.PI * q)})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.translate(W / 2, H / 2); ctx.rotate(-0.35); ctx.translate(-W / 2, -H / 2);
      ctx.fillStyle = g; ctx.fillRect(-W, -H, W * 3, H * 3);
    }
  } else if (kind === 'sparkle') {
    for (let k = 0; k < 7; k++) {
      const x = W * (0.12 + 0.76 * hash(k + 41)), y = H * (0.2 + 0.55 * hash(k + 51));
      const tw = Math.max(0, Math.sin(el / 260 + k * 1.7));
      const r = (14 + 22 * hash(k + 61)) * tw;
      if (r < 1) continue;
      ctx.fillStyle = `rgba(255,252,245,${0.75 * tw})`;
      ctx.beginPath();
      ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r * 0.3, y); ctx.quadraticCurveTo(x, y, x, y + r);
      ctx.quadraticCurveTo(x, y, x - r * 0.3, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - r * 0.7, y); ctx.quadraticCurveTo(x, y, x, y + r * 0.2); ctx.quadraticCurveTo(x, y, x + r * 0.7, y);
      ctx.quadraticCurveTo(x, y, x, y - r * 0.2); ctx.quadraticCurveTo(x, y, x - r * 0.7, y); ctx.fill();
    }
  }
  ctx.restore();
}

// ── Words ──────────────────────────────────────────────────────────────────

const PLAIN_HEBREW = /^[֐-׿\s.,!?״׳'"־:]+$/;

function styleFor(style, role, look, j, lineCount) {
  const { colors, fam } = look;
  const kicker = role === 'step' && lineCount > 1 && j === 0;
  const base = {
    editorial: { family: fam.display, weight: 700, color: '#ffffff', anim: 'letters', box: null, shadow: 'rgba(0,0,0,0.55)' },
    pill: { family: fam.body, weight: 800, color: colors.contrast, anim: 'pop', box: { color: colors.primary, radius: 999 }, shadow: null },
    highlight: { family: fam.body, weight: 800, color: colors.contrast, anim: 'bar', box: { color: colors.primary, radius: 10 }, shadow: null },
    minimal: { family: fam.body, weight: 600, color: '#ffffff', anim: 'rise', box: null, shadow: 'rgba(0,0,0,0.5)', underline: colors.primary, scale: 0.9 },
    bold: { family: fam.body, weight: 800, color: '#ffffff', anim: 'slam', box: null, shadow: null, offset: colors.primary, scale: 1.18 },
  }[style] || null;
  const s = { ...(base || {}), scale: base?.scale || 1 };
  if (role === 'answer') { s.box = style === 'pill' || style === 'highlight' ? { color: colors.surface, radius: style === 'pill' ? 999 : 10 } : s.box; s.color = s.box ? colors.ink : '#ffffff'; s.weight = 600; }
  if (role === 'label') s.scale *= 0.9;
  if (kicker) { s.scale *= 0.62; s.color = s.box ? s.color : colors.tint || '#ffffff'; s.weight = 700; if (style === 'editorial' || style === 'minimal' || style === 'bold') s.color = '#ffffff'; }
  return s;
}

/** Draw one text overlay `tin` ms after it starts. */
function drawWords(ctx, t, tin, style, look) {
  const b = textBlock(t);
  const n = t.lines.length;
  const pxs = t.lines.map((_, j) => b.px * styleFor(style, t.role, look, j, n).scale);
  const total = pxs.reduce((a, p) => a + p * LINE_HEIGHT, 0);
  let y = b.cy - total / 2;
  if (t.role === 'quote') {
    // a soft dark wash so the quote reads on any picture, and a big quotation mark in her colour
    ctx.save(); ctx.globalAlpha = 0.42 * clamp01(tin / 300); ctx.fillStyle = '#120c10'; ctx.fillRect(0, 0, W, H); ctx.restore();
    ctx.save(); ctx.globalAlpha = clamp01(tin / 300); ctx.font = `700 220px ${look.fam.display}`; ctx.fillStyle = look.colors.primary; ctx.textAlign = 'center'; ctx.direction = 'rtl'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('״', W / 2, y - 10); ctx.restore();
  }
  t.lines.forEach((line, j) => {
    const st = styleFor(style, t.role, look, j, n);
    const px = pxs[j], lh = px * LINE_HEIGHT;
    drawLine(ctx, line, { ...st, px, cy: y + lh / 2, u: tin - j * 140 });
    y += lh;
  });
}

function drawLine(ctx, text, st) {
  if (st.u <= 0) return;
  const maxW = W - 2 * 110;
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let px = st.px;
  ctx.font = `${st.weight} ${px}px ${st.family}`;
  let tw = ctx.measureText(text).width;
  if (tw > maxW) { px *= maxW / tw; ctx.font = `${st.weight} ${px}px ${st.family}`; tw = ctx.measureText(text).width; }
  const cx = W / 2, cy = st.cy, u = st.u;
  let alpha = 1, scale = 1, dy = 0, barW = 1, reveal = null;
  if (st.anim === 'rise') { const a = easeOut(u / 380); alpha = a; dy = (1 - a) * 34; }
  else if (st.anim === 'pop') { alpha = clamp01(u / 120); scale = 0.55 + 0.45 * backOut(u / 340); }
  else if (st.anim === 'slam') { const a = easeOut(u / 220); alpha = clamp01(u / 90); scale = 1.55 - 0.55 * a; }
  else if (st.anim === 'bar') { barW = easeOut(u / 300); alpha = clamp01((u - 150) / 220); }
  else if (st.anim === 'letters') reveal = clamp01(u / Math.min(760, 45 * Array.from(text).length + 120));
  ctx.translate(cx, cy + dy); ctx.scale(scale, scale); ctx.translate(-cx, -cy);

  const padX = px * 0.42, padY = px * 0.2;
  if (st.box) {
    const bw = (tw + 2 * padX) * barW, bh = px * 1.18 + padY;
    ctx.save(); ctx.globalAlpha = st.anim === 'bar' ? 1 : alpha;
    ctx.fillStyle = st.box.color;
    // the bar grows from the right, where a Hebrew line starts
    roundRect(ctx, cx + tw / 2 + padX - bw, cy - bh / 2, bw, bh, st.box.radius === 999 ? bh / 2 : st.box.radius);
    ctx.fill(); ctx.restore();
  }
  ctx.globalAlpha = alpha;
  if (st.shadow) { ctx.shadowColor = st.shadow; ctx.shadowBlur = px * 0.28; ctx.shadowOffsetY = px * 0.04; }
  if (st.offset) { ctx.save(); ctx.fillStyle = st.offset; ctx.fillText(text, cx + px * 0.06, cy + px * 0.06); ctx.restore(); }
  ctx.fillStyle = st.color;
  if (reveal !== null && reveal < 1) {
    const chars = Array.from(text);
    const right = cx + tw / 2;
    if (PLAIN_HEBREW.test(text)) {
      // letter by letter, right to left: the first k letters drawn from the right edge, the next one fading in
      const exact = reveal * chars.length, k = Math.floor(exact);
      ctx.textAlign = 'right';
      if (k > 0) ctx.fillText(chars.slice(0, k).join(''), right, cy);
      if (k < chars.length) {
        const wk = k > 0 ? ctx.measureText(chars.slice(0, k).join('')).width : 0;
        ctx.save(); ctx.beginPath(); ctx.rect(0, cy - px, right - wk, px * 2); ctx.clip();
        ctx.globalAlpha = alpha * (exact - k);
        ctx.fillText(chars.slice(0, k + 1).join(''), right, cy); ctx.restore();
      }
    } else {
      // mixed text (a number, a Latin word): a wipe from the right, so the bidi order is never cut mid-run
      ctx.save(); ctx.beginPath(); ctx.rect(right - tw * reveal - 4, cy - px, tw * reveal + 8, px * 2); ctx.clip();
      ctx.fillText(text, cx, cy); ctx.restore();
    }
  } else ctx.fillText(text, cx, cy);
  if (st.underline && alpha > 0) {
    ctx.shadowColor = 'transparent';
    const uw = tw * 0.5 * easeOut(u / 500);
    ctx.fillStyle = st.underline; ctx.fillRect(cx - uw / 2, cy + px * 0.62, uw, Math.max(4, px * 0.07));
  }
  ctx.restore();
}

// ── Chrome and the closing card ─────────────────────────────────────────────

function chrome(ctx, look) {
  const { colors, fam, logo, name } = look;
  if (logo) {
    const { w, h } = sizeOf(logo);
    const s = Math.min(170 / w, 64 / h), dw = w * s, dh = h * s;
    ctx.save(); ctx.fillStyle = colors.surface; ctx.globalAlpha = 0.9;
    roundRect(ctx, 1016 - dw - 28, 262, dw + 28, dh + 20, 22); ctx.fill(); ctx.restore();
    ctx.drawImage(logo, 1016 - 14 - dw, 272, dw, dh);
  } else if (name) {
    drawText(ctx, { text: name, x: W * 0.35, y: 262, w: 1016 - W * 0.35, h: 70, family: fam.display, weight: 700, sizePx: 36, lineHeight: 1.1, maxLines: 1, align: 'right', valign: 'center', color: colors.ink, pill: { color: colors.surface, radius: 22, padX: 20, padY: 10 } });
  }
  ctx.fillStyle = colors.primary; ctx.fillRect(0, H - 14, W, 14);
}

function drawEnd(ctx, look, inMs, beatMs) {
  const { colors, fam, logo, lines } = look;
  ctx.fillStyle = colors.surface; ctx.fillRect(0, 0, W, H);
  const pulse = 1 + 0.015 * Math.exp(-((inMs % beatMs) / beatMs) * 5);
  ctx.fillStyle = colors.blush; ctx.beginPath(); ctx.arc(W / 2, H * 0.42, W * 0.44 * pulse, 0, Math.PI * 2); ctx.fill();
  const step = beatMs / 2;
  const enter = (i) => easeOut((inMs - i * step) / 380);
  let y = 330, idx = 0;
  if (logo) {
    const a = enter(idx++);
    const { w, h } = sizeOf(logo);
    const s = Math.min(420 / w, 280 / h) * (0.8 + 0.2 * backOut((inMs) / 420)), dw = w * s, dh = h * s;
    ctx.save(); ctx.globalAlpha = a; ctx.drawImage(logo, (W - dw) / 2, y + (280 - dh) / 2, dw, dh); ctx.restore();
    y += 320;
  } else y += 140;
  const spec = {
    name: { family: fam.display, weight: 700, sizePx: 88, h: 124, color: colors.ink },
    cta: { family: fam.body, weight: 700, sizePx: 58, h: 88, color: colors.deep },
    phone: { family: fam.body, weight: 700, sizePx: 74, h: 106, color: colors.ink },
    handle: { family: fam.body, weight: 600, sizePx: 52, h: 84, color: colors.deep },
    link: { family: fam.body, weight: 600, sizePx: 46, h: 76, color: colors.deep },
  };
  for (const l of lines) {
    const s = spec[l.role] || spec.cta;
    const a = enter(idx++);
    ctx.save(); ctx.globalAlpha = a; ctx.translate(0, (1 - a) * 26);
    if (l.role === 'cta') {
      drawText(ctx, { text: l.text, x: 120, y, w: W - 240, h: s.h, family: s.family, weight: s.weight, sizePx: s.sizePx, lineHeight: 1.1, maxLines: 1, align: 'center', valign: 'center', color: colors.contrast, pill: { color: colors.primary, radius: 999, padX: 44, padY: 14 } });
    } else drawText(ctx, { text: l.text, x: 90, y, w: W - 180, h: s.h, family: s.family, weight: s.weight, sizePx: s.sizePx, lineHeight: 1.15, maxLines: 1, align: 'center', valign: 'center', color: s.color });
    ctx.restore();
    y += s.h + (l.role === 'name' ? 34 : 12);
  }
  ctx.fillStyle = colors.primary; ctx.fillRect(0, H - 14, W, 14);
}

/** The closing card's lines: her look's, plus "הקישור לתור בביו" when she has an Instagram handle. */
export function endLinesWithLink(lines) {
  const out = lines.slice();
  if (out.some((l) => l.role === 'handle')) out.push({ role: 'link', text: 'הקישור לתור בביו' });
  return out;
}

// ── The painter ─────────────────────────────────────────────────────────────

/**
 * A painter for one reel on one canvas. The canvas may be smaller than 1080x1920 (the previews): everything is
 * drawn in 1080x1920 units under a scale. `paint(el, frame)` draws the frame `el` ms in; `frame` is what a video
 * scene shows (a decoded frame, a <video>, or a placeholder canvas), ignored on photo scenes.
 * @param {{ canvas: HTMLCanvasElement, plan: any, look: any, lookId: string, textStyle: string, photos: (CanvasImageSource|null)[] }} o
 */
export function createPainter({ canvas, plan, look, lookId, textStyle, photos }) {
  const ctx = canvas.getContext('2d');
  const sc = canvas.width / W;
  const mk = () => { const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height; return c; };
  const snap = mk(), cur = mk();
  const sctx = snap.getContext('2d'), cctx = cur.getContext('2d');
  let shown = -1;
  const sceneAt = (el) => { let i = 0; while (i < plan.scenes.length - 1 && el >= plan.scenes[i + 1].startMs) i++; return i; };
  const full = (c, src, x = 0, alpha = 1) => { c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = alpha; c.drawImage(src, x * sc, 0); c.restore(); };

  function transition(s, inMs) {
    const q = clamp01(inMs / s.transMs);
    switch (s.transition) {
      case 'flash':
        ctx.save(); ctx.fillStyle = '#fffaf6'; ctx.globalAlpha = Math.pow(1 - q, 1.6) * 0.95; ctx.fillRect(0, 0, W, H); ctx.restore();
        break;
      case 'dissolve':
        full(ctx, snap, 0, 1 - smooth(q));
        break;
      case 'whip': case 'slide': {
        // the new picture comes in from the left (the way a Hebrew story moves forward), the old one leaves right
        cctx.setTransform(1, 0, 0, 1, 0, 0); cctx.clearRect(0, 0, cur.width, cur.height); cctx.drawImage(canvas, 0, 0);
        const e = s.transition === 'whip' ? smooth(q) : easeOut(q);
        ctx.save(); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.restore();
        if (s.transition === 'whip') {
          const blur = Math.sin(Math.PI * e);
          full(ctx, snap, e * W);
          full(ctx, cur, -(1 - e) * W);
          for (const k of [-1, 1]) { full(ctx, snap, e * W + k * 70 * blur, 0.22 * blur); full(ctx, cur, -(1 - e) * W + k * 70 * blur, 0.22 * blur); }
        } else {
          full(ctx, snap, e * W * 0.3);
          ctx.save(); ctx.fillStyle = `rgba(0,0,0,${0.4 * e})`; ctx.fillRect(0, 0, W, H); ctx.restore();
          full(ctx, cur, -(1 - e) * W);
        }
        break;
      }
      case 'split': {
        // before on the left, after revealed from the right; the divider pauses in the middle, then finishes
        const prog = q < 0.42 ? 0.5 * smooth(q / 0.42) : q < 0.72 ? 0.5 : 0.5 + 0.5 * smooth((q - 0.72) / 0.28);
        const x = W * (1 - prog);
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, x, H); ctx.clip(); full(ctx, snap); ctx.restore();
        if (prog > 0 && prog < 1) {
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 24;
          ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 4, 0, 8, H);
          ctx.beginPath(); ctx.arc(x, H * 0.5, 46, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0; ctx.fillStyle = look.colors.primary;
          ctx.beginPath(); ctx.moveTo(x - 26, H * 0.5); ctx.lineTo(x - 8, H * 0.5 - 14); ctx.lineTo(x - 8, H * 0.5 + 14); ctx.fill();
          ctx.beginPath(); ctx.moveTo(x + 26, H * 0.5); ctx.lineTo(x + 8, H * 0.5 - 14); ctx.lineTo(x + 8, H * 0.5 + 14); ctx.fill();
          ctx.restore();
        }
        break;
      }
      default: break;
    }
  }

  function paint(el, frame) {
    const i = sceneAt(el), s = plan.scenes[i];
    const inMs = el - s.startMs, p = clamp01(inMs / s.ms);
    if (i !== shown) { if (shown >= 0) { sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.clearRect(0, 0, snap.width, snap.height); sctx.drawImage(canvas, 0, 0); } shown = i; }
    ctx.save();
    ctx.setTransform(sc, 0, 0, sc, 0, 0);
    if (s.kind === 'end') {
      drawEnd(ctx, look, inMs, plan.beatMs);
      if (i > 0 && inMs < s.transMs) full(ctx, snap, 0, 1 - smooth(inMs / s.transMs));
    } else {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      const src = s.kind === 'video' ? frame : photos[s.slot];
      const beatPhase = (el % plan.beatMs) / plan.beatMs;
      if (src) cover(ctx, src, zoomAt(s.effect, p, inMs, beatPhase), driftAt(s.effect, p, s.slot));
      applyLook(ctx, lookId, el);
      accent(ctx, s.accent, p, el);
      if (i > 0 && inMs < s.transMs) transition(s, inMs);
      for (const t of s.texts) if (inMs >= t.startMs) drawWords(ctx, t, inMs - t.startMs, textStyle, look);
      chrome(ctx, look);
    }
    ctx.restore();
  }
  return { paint, sceneAt, reset() { shown = -1; } };
}

// ── Music ──────────────────────────────────────────────────────────────────

/** The generated music for a plan, as a WAV blob URL (revoke it when done). */
export function musicFor(moodId, plan, { sampleRate = 48000, seed = 1 } = {}) {
  const { channels, sampleRate: sr } = renderMood(moodId, { durationMs: plan.totalMs, endStartMs: plan.endStartMs, sampleRate, seed, hits: transitionHits(plan) });
  return URL.createObjectURL(new Blob([encodeWav(channels, sr)], { type: 'audio/wav' }));
}

// ── Real time: the preview, and the MediaRecorder take ─────────────────────

/**
 * Play the reel on `canvas` in real time. Clips play in <video> elements at the slot's speed (kept in step with the
 * plan); music, when given, plays through `audioCtx` and is the clock. Returns { done, stop, stream? }.
 * @param {{ canvas: HTMLCanvasElement, painter: ReturnType<typeof createPainter>, plan: any, items: any[],
 *   audioCtx?: AudioContext|null, musicUrl?: string|null, toSpeakers?: boolean, record?: boolean, placeholders?: boolean,
 *   onProgress?: (p: number) => void, shouldStop?: () => boolean, loop?: boolean }} o
 */
export async function playRealtime({ canvas, painter, plan, items, audioCtx = null, musicUrl = null, toSpeakers = true, record = false, onProgress, shouldStop, loop = false }) {
  const players = new Map();
  for (const s of plan.scenes) {
    if (s.kind !== 'video') continue;
    const it = items[s.item];
    if (it?.placeholder) players.set(s.item, { placeholder: it.placeholder, group: it.group });
    else if (it?.url) { const c = await seekClip(it.url); await c.frameAt(0); players.set(s.item, c); }
  }
  let source = null, dest = null;
  if (audioCtx && musicUrl) {
    try {
      const buf = await audioCtx.decodeAudioData(await (await fetch(musicUrl)).arrayBuffer());
      source = audioCtx.createBufferSource(); source.buffer = buf;
      if (record) { dest = audioCtx.createMediaStreamDestination(); source.connect(dest); }
      if (toSpeakers) source.connect(audioCtx.destination);
    } catch { source = null; }
  }
  let stream = null, recorder = null, chunks = [], finished = null, mime = '';
  painter.reset();
  painter.paint(0, players.get(plan.scenes[0].item)?.video || null);
  if (record) {
    mime = pickRecorderMime();
    const tracks = [...canvas.captureStream(30).getVideoTracks(), ...(dest ? dest.stream.getAudioTracks() : [])];
    stream = new MediaStream(tracks);
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 });
    recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
    finished = new Promise((resolve) => { recorder.onstop = resolve; });
    recorder.start();
  }
  try { await audioCtx?.resume?.(); } catch { /* ignore */ }
  const startAudio = audioCtx ? audioCtx.currentTime + 0.05 : 0;
  if (source) source.start(startAudio);
  const t0 = performance.now() + 50;
  const clock = () => (source ? (audioCtx.currentTime - startAudio) * 1000 : performance.now() - t0);
  let stopped = false, playing = -1, raf = 0;
  const done = new Promise((resolve) => {
    const tick = () => {
      if (stopped || shouldStop?.()) { resolve(); return; }
      let el = Math.max(0, clock());
      if (loop && el >= plan.totalMs) el = el % plan.totalMs;
      el = Math.min(el, plan.totalMs);
      const i = painter.sceneAt(el), s = plan.scenes[i];
      let frame = null;
      if (s.kind === 'video') {
        const pl = players.get(s.item);
        const inMs = el - s.startMs, want = sourceMsAt(s.effect, inMs, s.ms, s.clip.k) / 1000;
        if (pl?.placeholder) frame = drawPlaceholder(pl.placeholder, pl.group || 'lashes', s.slot, want);
        else if (pl) {
          const v = pl.video;
          if (playing !== i) { for (const o of players.values()) o.video?.pause(); v.currentTime = want; v.play().catch(() => {}); playing = i; }
          const rate = Math.max(0.25, Math.min(4, rateAt(s.effect, inMs / s.ms) * s.clip.k));
          if (Math.abs(v.playbackRate - rate) > 0.05) v.playbackRate = rate;
          if (Math.abs(v.currentTime - want) > 0.35) v.currentTime = want;
          frame = v;
        }
      }
      painter.paint(el, frame);
      onProgress?.(el / plan.totalMs);
      if (el < plan.totalMs || loop) raf = requestAnimationFrame(tick); else resolve();
    };
    raf = requestAnimationFrame(tick);
  });
  const cleanup = async () => {
    cancelAnimationFrame(raf);
    try { source?.stop(); } catch { /* ignore */ }
    for (const p of players.values()) p.close?.();
  };
  return {
    done: done.then(async () => {
      if (recorder) { recorder.stop(); await finished; }
      await cleanup();
      if (recorder) { const actual = recorder.mimeType || mime; return { blob: new Blob(chunks, { type: actual }), ext: fileExtFor(actual) }; }
      return null;
    }),
    stop() { stopped = true; },
  };
}

// ── Export ──────────────────────────────────────────────────────────────────

/**
 * Render the finished reel. Returns { blob, ext }.
 * @param {{ canvas: HTMLCanvasElement, plan: any, items: any[], photos: any[], look: any, lookId: string, textStyle: string,
 *   musicUrl?: string|null, onProgress?: (p: number) => void, onStatus?: (s: string) => void, shouldStop?: () => boolean }} o
 */
export async function renderTemplateReel({ canvas, plan, items, photos, look, lookId, textStyle, musicUrl = null, onProgress, onStatus, shouldStop }) {
  canvas.width = W; canvas.height = H;
  const painter = createPainter({ canvas, plan, look, lookId, textStyle, photos });
  const clips = new Map();
  const clipFor = async (i) => {
    if (!clips.has(i)) {
      for (const [k, c] of clips) if (k !== i) { c.close(); clips.delete(k); }
      const s = plan.scenes[i];
      clips.set(i, await openClip(items[s.item], Math.ceil(s.clip.needMs * s.clip.k) + 200));
    }
    return clips.get(i);
  };
  let frame = null;
  const prepareAt = async (el) => {
    const i = painter.sceneAt(el), s = plan.scenes[i];
    frame = s.kind === 'video' ? await (await clipFor(i)).frameAt(sourceMsAt(s.effect, el - s.startMs, s.ms, s.clip.k) / 1000) : null;
  };
  try {
    const presets = !musicUrl || (await canEncodeMusic()) ? await encodePresets(W, H) : [];
    for (const preset of presets) {
      onStatus?.('מכינה את הרילס'); painter.reset();
      try {
        const blob = await encodeReelMp4({ canvas, drawAt: (_c, el) => painter.paint(el, frame), prepareAt, totalMs: plan.totalMs, preset, musicUrl, onProgress, shouldStop });
        return { blob, ext: 'mp4' };
      } catch (e) {
        if (shouldStop?.()) throw e;
        console.warn('[reel-templates] encoder preset failed, trying the next:', preset.label, e?.message || e);
        for (const c of clips.values()) c.close();
        clips.clear();
      }
    }
    if (typeof MediaRecorder === 'undefined') throw new Error('הדפדפן לא תומך ביצירת וידאו. נסי בכרום או בספארי מעודכן.');
    if (document.hidden) throw new Error('הטאב לא פעיל. חזרי למסך הזה ונסי שוב.');
    onStatus?.('מקליטה את הרילס');
    let audioCtx = null;
    if (musicUrl) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { audioCtx = null; } }
    const run = await playRealtime({ canvas, painter, plan, items, audioCtx, musicUrl, toSpeakers: false, record: true, onProgress, shouldStop });
    const out = await run.done;
    if (audioCtx) { try { await audioCtx.close(); } catch { /* ignore */ } }
    if (shouldStop?.()) throw new Error('ההקלטה הופסקה כי עזבת את הטאב באמצע. השאירי את המסך הזה פתוח עד שהרילס מוכן, ונסי שוב.');
    return out;
  } finally {
    for (const c of clips.values()) c.close();
  }
}
