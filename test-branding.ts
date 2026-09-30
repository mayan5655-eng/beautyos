// Her colour is hers. The resolver used to replace a "not safe for white
// text" primary with the BloomOS default, which erased a gold brand
// (#C9A24B) on every public page. Text on the accent is chosen by contrast
// instead; the colour itself is never swapped.
import assert from 'node:assert/strict';
import { resolveBranding, publicAccent, readableTextOn, DEFAULT_PRIMARY, defaultHeroHeadline, defaultAboutText, defaultHowIWork } from './lib/branding.js';
import { contrastOn, buildAccentTokens } from './lib/theme.ts';

const gold = resolveBranding({ primary_color: '#C9A24B' });
assert.equal(gold.primary, '#C9A24B', 'a gold accent is kept, not replaced');
assert.equal(gold.onPrimary, '#2A2233', 'white does not read on gold; ink does');
assert.equal(publicAccent({ primary_color: '#C9A24B' }), '#C9A24B');

const pale = resolveBranding({ primary_color: '#F4C2C2' });
assert.equal(pale.primary, '#F4C2C2', 'even a pale accent is kept');
assert.equal(pale.onPrimary, '#2A2233');

const plum = resolveBranding({ primary_color: '#4A2E5A' });
assert.equal(plum.onPrimary, '#FFFFFF', 'white still wins on a dark accent');

assert.equal(resolveBranding({ primary_color: 'gold' }).primary, DEFAULT_PRIMARY, 'only a malformed value falls back');
assert.equal(resolveBranding(null).primary, DEFAULT_PRIMARY, 'only a missing row falls back');
assert.equal(readableTextOn('#C9A24B'), '#2A2233');

// business_fields passthrough (lib/businessFields.ts's businessFieldsOf) —
// the public page needs this to pick the right hero/about default photo.
assert.deepEqual(resolveBranding({ business_fields: ['nails'] }).fields, ['nails']);
assert.deepEqual(resolveBranding({ business_fields: ['cosmetics', 'nails'] }).fields, ['cosmetics', 'nails']);
assert.deepEqual(resolveBranding(null).fields, ['cosmetics'], 'missing row: the same safe default as everywhere else');
assert.deepEqual(resolveBranding({}).fields, ['cosmetics'], 'no business_fields column back yet: cosmetics, not an empty/broken page');

// The CSS-variable side agrees with the resolver.
assert.equal(contrastOn('#C9A24B'), '#2A2233');
assert.equal(buildAccentTokens('#C9A24B')['--pc'], '#C9A24B');
assert.equal(buildAccentTokens('#C9A24B')['--pc-contrast'], '#2A2233');

// ── business_fields: the default public-page COPY must not be field-blind ──
// A nails-only tenant who never wrote her own headline/about/how-I-work
// used to get the cosmetics wording verbatim ("your skin") on her live
// booking page — the exact bug this guards against. "עור" (skin) is the
// tell: it must never appear in a nails-only default, in any of the three.
for (const text of [defaultHeroHeadline(['nails']), defaultAboutText(['nails']), defaultHowIWork(['nails']).join(' ')]) {
  assert.ok(!/עור/.test(text), `a nails-only default must not mention skin: "${text}"`);
}
// Each field's copy must actually differ from the others — not the same
// string reused under three names, which would silently reintroduce the bug.
assert.notEqual(defaultHeroHeadline(['nails']), defaultHeroHeadline(['cosmetics']));
assert.notEqual(defaultAboutText(['nails']), defaultAboutText(['cosmetics']));
assert.notEqual(defaultHowIWork(['nails'])[0], defaultHowIWork(['cosmetics'])[0]);
// A dual-field tenant gets its own copy, not a silent reuse of either side.
assert.notEqual(defaultHeroHeadline(['cosmetics', 'nails']), defaultHeroHeadline(['cosmetics']));
assert.notEqual(defaultHeroHeadline(['cosmetics', 'nails']), defaultHeroHeadline(['nails']));
assert.notEqual(defaultAboutText(['cosmetics', 'nails']), defaultAboutText(['cosmetics']));
assert.notEqual(defaultAboutText(['cosmetics', 'nails']), defaultAboutText(['nails']));
// No fields passed, or a missing/empty array: cosmetics, unchanged from
// before this existed — same fallback as businessFieldsOf itself.
assert.equal(defaultHeroHeadline([]), defaultHeroHeadline(['cosmetics']));
assert.equal(defaultHeroHeadline(undefined), defaultHeroHeadline(['cosmetics']));

console.log('branding: ok');
