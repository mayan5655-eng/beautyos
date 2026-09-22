// Her colour is hers. The resolver used to replace a "not safe for white
// text" primary with the BloomOS default, which erased a gold brand
// (#C9A24B) on every public page. Text on the accent is chosen by contrast
// instead; the colour itself is never swapped.
import assert from 'node:assert/strict';
import { resolveBranding, publicAccent, readableTextOn, DEFAULT_PRIMARY } from './lib/branding.js';
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

// The CSS-variable side agrees with the resolver.
assert.equal(contrastOn('#C9A24B'), '#2A2233');
assert.equal(buildAccentTokens('#C9A24B')['--pc'], '#C9A24B');
assert.equal(buildAccentTokens('#C9A24B')['--pc-contrast'], '#2A2233');

console.log('branding: ok');
