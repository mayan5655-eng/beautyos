// The Kalmea palette lives in ONE place: the --k-* block at the top of app/globals.css. Everything else derives from it, and the text
// colours on the cream page and white cards stay above WCAG AA (4.5:1).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { contrastRatio } from './lib/theme.ts';

const css = fs.readFileSync('app/globals.css', 'utf8').replace(/\r\n/g, '\n');
const tok = (name: string) => (css.match(new RegExp(`--${name}:\s*(#[0-9A-Fa-f]{6})`)) || [])[1];

assert.equal(tok('k-green'), '#1F3A30');
assert.equal(tok('k-pink'), '#E9A9A1');
assert.equal(tok('k-cream'), '#FBF8F1');
assert.equal(tok('k-petal'), '#FBEDE9');
assert.equal(tok('k-sage'), '#DCE4D5');

for (const [name, want] of [['bg', 'k-cream'], ['ink', 'k-green'], ['dark', 'k-green'], ['brand-accent', 'k-green'], ['brand-cream', 'k-cream'], ['brand-rose', 'k-pink']]) {
  assert.ok(new RegExp(`--${name}:\s*var\(--${want}\)`).test(css), `--${name} derives from --${want}`);
}

const cream = tok('k-cream'), white = '#FFFFFF', green = tok('k-green');
const text = { '--ink': green, '--ink-2': tok('ink-2'), '--ink-3': tok('ink-3') };
for (const [n, c] of Object.entries(text)) {
  for (const bg of [cream, white, tok('surface-2')]) assert.ok(contrastRatio(c, bg) >= 4.5, `${n} ${c} on ${bg}: ${contrastRatio(c, bg).toFixed(2)}`);
}
assert.ok(contrastRatio(cream, green) >= 4.5, 'cream text on a green button');
assert.ok(contrastRatio(tok('k-green-deep'), tok('k-pink')) >= 4.5, 'green text on a pink accent');

console.log('palette: ok');
