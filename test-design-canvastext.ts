// Text on a canvas: wrapping, fitting and placing, checked against a model context.
import assert from 'node:assert/strict';
import { drawText, wrapWords, textDirection, type CanvasLike, type TextSpec } from './lib/design/canvasText.ts';

// A context that measures like a monospace font (0.4em a character, about Frank Ruhl Libre) and records what it is asked to draw.
function mockCtx() {
  const calls: { s: string; x: number; y: number; font: string; align: string; dir: string | undefined }[] = [];
  const ctx: CanvasLike = {
    font: '10px x', fillStyle: '', textAlign: 'left', textBaseline: 'alphabetic', direction: 'ltr', letterSpacing: '0px',
    measureText(s: string) { const px = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] || 10); return { width: s.length * px * 0.4, fontBoundingBoxAscent: px * 0.8, fontBoundingBoxDescent: px * 0.2 }; },
    fillText(s, x, y) { calls.push({ s, x, y, font: this.font, align: this.textAlign, dir: this.direction }); },
    save() {}, restore() {}, beginPath() {}, fill() {}, moveTo() {}, lineTo() {}, arcTo() {}, closePath() {},
  };
  return { ctx, calls };
}

// The story headline of a full-bleed template: 92px, lineHeight 1.06, three lines, box 952 x 298 at (64, 1176).
const base: TextSpec = { text: '', x: 64, y: 1176, w: 952, h: 298, family: 'Frank Ruhl Libre', weight: 700, sizePx: 92, lineHeight: 1.06, maxLines: 3, align: 'right', valign: 'bottom', color: '#2A2233' };
const bottom = 1176 + 298;

// ── wrapWords ───────────────────────────────────────────────────────────────
const w10 = (s: string) => s.length * 10;
assert.deepEqual(wrapWords('אבג דהו זחט', 100, w10), ['אבג דהו', 'זחט'], 'breaks at a space');
assert.deepEqual(wrapWords('abcdefghijklmn', 50, w10), ['abcde', 'fghij', 'klmn'], 'a word wider than the line breaks by characters');
assert.deepEqual(wrapWords('   ', 100, w10), []);

// ── A caption that wraps to two lines: both lines drawn, full size, inside the box ──
{
  const { ctx, calls } = mockCtx();
  const r = drawText(ctx, { ...base, text: 'העור עובד בזמן שאת ישנה, סרום לילה ומסכה מזי' }); // 44 chars, ~1000px at 92px
  assert.equal(r.lines.length, 2, 'two lines');
  assert.equal(r.px, 92, 'the template size is kept');
  assert.equal(calls.length, 2, 'both lines are drawn');
  assert.ok(r.fits);
  for (const c of calls) assert.ok(c.y <= bottom && c.y >= 1176, `baseline ${c.y} inside the box`);
  assert.ok(r.tops[1] + 92 * 1.06 <= bottom + 0.5, 'the second line ends inside the box, not below it');
  assert.equal(calls[0].align, 'right');
  assert.equal(calls[0].x, 64 + 952, 'right-aligned at the right edge of the box');
  assert.equal(calls[0].dir, 'rtl');
}

// ── Three lines ─────────────────────────────────────────────────────────────
{
  const { ctx, calls } = mockCtx();
  const r = drawText(ctx, { ...base, text: 'העור עובד בזמן שאת ישנה, סרום לילה ומסכה מזינה לכל סוג עור' }); // 58 chars, three lines at full size
  assert.equal(r.lines.length, 3);
  assert.equal(calls.length, 3, 'all three lines drawn');
  assert.equal(r.px, 92, 'three lines fit at the template size');
  assert.ok(r.tops[2] + r.px * 1.06 <= bottom + 0.5, 'the third line ends inside the box');
  assert.ok(r.tops[0] >= 1176 - 0.5, 'the first line starts inside the box');
}

// ── More text than three lines: shrinks until it fits three, never draws a fourth ──
{
  const { ctx, calls } = mockCtx();
  const r = drawText(ctx, { ...base, text: Array.from({ length: 8 }, (_, i) => 'אבגדהוזחטי'.replace(/./g, (c) => String.fromCharCode(c.charCodeAt(0) + (i % 2)))).join(' ') }); // eight ten-letter words: four lines at 92px
  assert.ok(r.lines.length <= 3 && calls.length <= 3, 'at most three lines');
  assert.ok(r.px < 92 && r.px >= 46, 'shrunk, above the floor');
  assert.ok(r.fits);
}

// ── Vertical alignment ──────────────────────────────────────────────────────
{
  const t = 'העור עובד בזמן שאת ישנה, סרום לילה ומסכה מזי';
  const top = drawText(mockCtx().ctx, { ...base, text: t, valign: 'top' });
  const mid = drawText(mockCtx().ctx, { ...base, text: t, valign: 'center' });
  const bot = drawText(mockCtx().ctx, { ...base, text: t, valign: 'bottom' });
  assert.equal(top.tops[0], 1176);
  assert.ok(Math.abs(mid.tops[0] - (1176 + (298 - 2 * 92 * 1.06) / 2)) < 0.01);
  assert.ok(Math.abs(bot.tops[1] + 92 * 1.06 - bottom) < 0.01, 'bottom-aligned text ends at the box bottom');
}

// ── One line, long: shrinks to the width instead of wrapping ──
{
  const { ctx, calls } = mockCtx();
  const r = drawText(ctx, { ...base, text: 'x'.repeat(80), maxLines: 1, sizePx: 32, h: 46, valign: 'center' });
  assert.equal(r.lines.length, 1);
  assert.equal(calls.length, 1);
  assert.ok(r.px <= 29.8 && r.fits, `shrunk to ${r.px}`);
}

// ── Direction: a phone and a handle read left to right, Hebrew right to left ──
assert.equal(textDirection('052-1234567   ·   @maya.skin'), 'ltr');
assert.equal(textDirection('₪249'), 'ltr');
assert.equal(textDirection('הקליניקה של מאיה'), 'rtl');
assert.equal(textDirection('SPF 30 כל בוקר'), 'rtl');
{
  const { ctx, calls } = mockCtx();
  drawText(ctx, { ...base, text: '052-1234567   ·   @maya.skin', align: 'left', maxLines: 1, sizePx: 24, h: 40, valign: 'center' });
  assert.equal(calls[0].dir, 'ltr');
  assert.equal(calls[0].s, '052-1234567 · @maya.skin');
}

// ── A pill hugs its text and sits at the aligned edge ──
{
  const { ctx, calls } = mockCtx();
  const r = drawText(ctx, { ...base, text: 'לקביעת תור', maxLines: 1, sizePx: 28, x: 576, w: 440, y: 1656, h: 64, valign: 'center', align: 'right', pill: { color: '#C9A24B', radius: 28, padX: 18, padY: 10 } });
  assert.equal(r.lines.length, 1);
  assert.equal(calls[0].x, 1016 - 18, 'text ends one padding inside the right edge');
}

console.log('design canvas text: ok');
