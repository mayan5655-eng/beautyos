// The colours she can pick for her brand are colours.
//
// 2026-10-06: onboarding's preset list had been run through the design-token sweep and offered
// "var(--pc-tint)", "var(--success)", "rgba(242,184,75,0.16)" as swatches. They DRAW (a CSS variable is a valid
// background), so nothing looked wrong - but tapping one saved that string as primary_color, and her booking page
// quietly kept the default accent. This runs every offered swatch through the colour handling her public page
// really uses (resolveBranding), and shows what the old values did.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ONBOARDING_SWATCHES, SETTINGS_SWATCHES, SWATCH_NAMES, isSwatchHex, swatchLabel } from './lib/brandSwatches.js';
import { resolveBranding, DEFAULT_PRIMARY } from './lib/branding.js';

// ── every offered colour is a real, distinct hex, and her page accepts it as chosen ───────────────
for (const [where, list] of [['onboarding', ONBOARDING_SWATCHES], ['settings', SETTINGS_SWATCHES]] as const) {
  assert.equal(new Set(list.map((c) => c.toLowerCase())).size, list.length, `${where}: no duplicate swatches (the broken list offered "var(--pc-tint)" twice)`);
  for (const c of list) {
    assert.ok(isSwatchHex(c), `${where}: ${c} is a hex colour`);
    assert.equal(resolveBranding({ primary_color: c }).primary.toLowerCase(), c.toLowerCase(), `${where}: choosing ${c} gives her page exactly ${c}, not the default`);
    assert.ok((SWATCH_NAMES as Record<string, string>)[c.toUpperCase()], `${where}: ${c} has a name for a screen reader`);
  }
}
assert.ok(ONBOARDING_SWATCHES.includes('#E9A9A1'), 'the product default can be chosen back in onboarding');

// ── what the old values did: the page quietly used the default ──────────────────────────────────────
for (const old of ['var(--pc-tint)', 'var(--success)', 'rgba(242,184,75,0.16)', 'var(--pc)', 'var(--ink)']) {
  assert.equal(isSwatchHex(old), false, `${old} is not a swatch`);
  assert.equal(resolveBranding({ primary_color: old }).primary, DEFAULT_PRIMARY, `${old} saved as her colour is silently replaced by the default - the bug`);
}

// ── labels ───────────────────────────────────────────────────────────────────────────────────────────
assert.equal(swatchLabel('#5B3E67'), 'צבע שזיף');
assert.equal(swatchLabel('#5b3e67'), 'צבע שזיף', 'case does not matter');
assert.equal(swatchLabel('#123456'), 'צבע #123456', 'an unnamed colour falls back to its hex, never "undefined"');

// ── the screens use the lists (the behaviour above is the point; this is only the connection) ────────
const onb = fs.readFileSync('app/onboarding/page.tsx', 'utf8');
assert.ok(onb.includes('const PRESET_COLORS = ONBOARDING_SWATCHES'), 'onboarding offers the shared hex palette, not a list of its own');
assert.ok(!/PRESET_COLORS\s*=\s*\[/.test(onb), 'and has no literal list that a token sweep could corrupt again');
assert.ok(onb.includes('aria-label={swatchLabel(c)}'), 'each onboarding swatch has a name');
const app = fs.readFileSync('app/beautyos.jsx', 'utf8');
assert.equal((app.match(/aria-label=\{swatchLabel\(/g) || []).length, 2, 'both settings swatch groups name their buttons');
assert.ok(!/\[\s*"#5B3E67"\s*,\s*"#7A5A88"/.test(app), 'settings uses the shared list too');

console.log('brand swatches: ok');
