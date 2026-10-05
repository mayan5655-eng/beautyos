// Her accent as text, the robots file, and the one-<main> rule.
//
// --pc is a fill. The default petal pink is 1.97:1 against white, so any
// heading, price or step label that drew words in it on her booking page failed
// WCAG AA (Lighthouse flagged it; a client with tired eyes could not read it).
// --pc-text is the same hue pushed dark enough to read, and these assertions are
// what keep every accent she can pick - not only the default - above the line.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildAccentTokens, contrastRatio, readableAccentText, DEFAULT_ACCENT } from './lib/theme.ts';

const WHITE = '#FFFFFF';
const CREAM = '#F0EADE';

// The default, the swatches she is offered, and the worst cases: very light,
// very saturated, near-white, mid-grey.
for (const accent of [DEFAULT_ACCENT, '#C9A24B', '#7DA3A0', '#FF69B4', '#FFFF00', '#FFFFFF', '#888888', '#5B3E67', '#183024']) {
  const text = readableAccentText(accent);
  assert.ok(contrastRatio(text, WHITE) >= 4.5, `${accent} -> ${text} on white: ${contrastRatio(text, WHITE).toFixed(2)}`);
  assert.ok(contrastRatio(text, CREAM) >= 4.5, `${accent} -> ${text} on cream: ${contrastRatio(text, CREAM).toFixed(2)}`);
  assert.equal(buildAccentTokens(accent)['--pc-text'], text, 'the token is the function, not a copy of it');
}

// An accent that was already dark enough keeps exactly what --pc-deep gave it.
const plum = '#5B3E67';
assert.equal(readableAccentText(plum), buildAccentTokens(plum)['--pc-deep']);

// globals.css declares the default family for the first paint; --pc-text there
// must be what the function says, or an unthemed paint differs from a themed one.
const css = fs.readFileSync(new URL('./app/globals.css', import.meta.url), 'utf8');
const declared = /--pc-text:\s*(#[0-9a-f]{6})/i.exec(css)?.[1];
assert.ok(declared, 'globals.css declares a default --pc-text');
assert.equal(declared.toLowerCase(), readableAccentText(DEFAULT_ACCENT).toLowerCase(), 'default --pc-text in globals.css is stale');

// The booking page draws her colour as text only through --pc-text.
const booking = fs.readFileSync(new URL('./app/BookingPage.jsx', import.meta.url), 'utf8');
assert.ok(!/color: pc[,} ]/.test(booking), 'BookingPage must not draw text in the raw accent (use pcText)');
assert.ok(!/color: "var\(--pc, #E9A9A1\)"/.test(fs.readFileSync(new URL('./app/landing/PhoneMock.jsx', import.meta.url), 'utf8')), 'landing mock must not draw text in the pink fallback');

// ── robots.txt ───────────────────────────────────────────────────────────────
// It used to be answered by app/[slug]/page.tsx as HTML. A file-convention
// route must exist, and must keep the signed-in app out of search.
const robots = (await import('./app/robots.ts')).default();
const rules = Array.isArray(robots.rules) ? robots.rules : [robots.rules];
assert.equal(rules[0].userAgent, '*');
assert.ok([rules[0].disallow].flat().includes('/dashboard'));
assert.ok([rules[0].disallow].flat().includes('/api/'));

// ── exactly one <main>: the root layout owns it ──────────────────────────────
const mains: string[] = [];
const walk = (dir: string) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx|jsx)$/.test(e.name) && /<main\s+(className|style|dir|id)=|<main>\s*$/m.test(fs.readFileSync(p, 'utf8'))) mains.push(p);
  }
};
walk('app');
// Comments that merely mention the tag do not match: a real element is <main
// followed by an attribute, or <main> ending its line.
assert.deepEqual(mains, ['app/layout.tsx'], 'only app/layout.tsx may render <main>');

console.log('accent text, robots, main landmark: ok');
