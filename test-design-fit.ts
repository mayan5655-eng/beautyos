// Text fitting: a caption that wraps keeps its size when it fits, shrinks when it must, never clips.
import assert from 'node:assert/strict';
import { fitText, lineCount } from './lib/design/fitText.ts';

// A model of a wrapping text block: glyphs are 0.5em wide on average, lines
// are px * lineHeight tall, the block is as wide as the box when it wraps.
const model = (chars: number, boxWidth: number, lineHeight: number) => (px: number) => {
  const perLine = Math.max(1, Math.floor(boxWidth / (px * 0.5)));
  const lines = Math.ceil(chars / perLine);
  return { width: lines > 1 ? boxWidth : chars * px * 0.5, height: lines * px * lineHeight };
};

// The story headline: 92px, lineHeight 1.06, three lines allowed, box 952x298 (three full lines plus slack).
const box = { boxWidth: 952, boxHeight: 298, lineHeight: 1.06, maxLines: 3, basePx: 92 };

// A caption that wraps to exactly two lines fits at full size. This was the regression: it used to shrink to the floor.
const two = fitText({ ...box, measure: model(36, 952, 1.06) });
assert.equal(two.px, 92, 'two lines keep the template size');
assert.equal(two.lines, 2);
assert.ok(two.fits);

// Three lines still fit the box at full size.
const three = fitText({ ...box, measure: model(58, 952, 1.06) });
assert.equal(three.px, 92);
assert.equal(three.lines, 3);
assert.ok(three.fits);

// Four lines' worth of text shrinks until it fits three lines, and stays above the floor.
const four = fitText({ ...box, measure: model(76, 952, 1.06) });
assert.ok(four.px < 92 && four.px >= 46, `shrunk to ${four.px}`);
assert.ok(four.lines <= 3 && four.fits, 'never more lines than allowed');
assert.ok(model(76, 952, 1.06)(four.px).height <= 299, 'never taller than the box');

// A one-line box: a long line shrinks instead of wrapping past the box.
const one = fitText({ basePx: 32, lineHeight: 1.2, maxLines: 1, boxWidth: 952, boxHeight: 46, measure: (px) => ({ width: 80 * px * 0.5, height: px * 1.2 }) });
assert.equal(one.lines, 1);
assert.ok(one.px <= 23.8 && one.fits, 'shrunk to the width');

// Something that cannot fit even at the floor reports so, and stops at the floor.
const hopeless = fitText({ ...box, measure: model(400, 952, 1.06) });
assert.equal(hopeless.fits, false);
assert.ok(hopeless.px >= 46);

// Sub-pixel line boxes are not overflow.
assert.ok(fitText({ ...box, measure: () => ({ width: 952.4, height: 298.6 }) }).fits, 'a pixel of slack');
assert.equal(lineCount(195, 92, 1.06), 2);

console.log('design fit: ok');
