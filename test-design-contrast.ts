// Contrast of the colour roles the studio look puts text on, across a spread of brand colours.
//
// A template stores roles, never hex, so the only way a template can be unreadable is a role pair that
// fails for SOME brand colour. This walks a spread of primaries - light, dark, saturated, near-white,
// near-black - and holds two lists:
//
//   SAFE   the pairs new templates may rely on. Floor 4.5:1 (WCAG AA body text), except contrast-on-primary
//          at 4.0:1: lib/theme.ts's contrastOn picks black or white for the primary and a few saturated
//          mid-tones sit just under 4.5 (#E91E63 is 4.35 with white); at the sizes the studio sets that text
//          (28px+ at 1080 wide, bold) it is large text, where AA asks 3:1.
//   WEAK   pairs the existing library uses on some brand colours that DO fall below it: `contrast` or
//          `surface` text on the `deep` role. `deep` is "primary, darker", so for a light brand colour it is
//          still light and cream on it is unreadable. They are listed, not asserted: those templates are
//          immutable (their hashes are locked) and new templates are written to avoid them. New templates
//          must not use a WEAK pair - test-design-pack-style tests enforce it for the pack's keys.
import assert from 'node:assert/strict';
import { colorsFor } from './lib/design/mapBranding.ts';
import { contrastRatio } from './lib/theme.ts';

export const SAFE_PAIRS: [string, string][] = [
  ['ink', 'surface'], ['ink', 'blush'], ['ink', 'sand'], ['ink', 'tint'], ['contrast', 'primary'],
];
export const WEAK_PAIRS: [string, string][] = [['contrast', 'deep'], ['surface', 'deep']];

const PRIMARIES = [
  '#E9A9A1', '#1F3A30', '#2E5BFF', '#F2C94C', '#8E44AD', '#FFFFFF', '#111111', '#E91E63', '#00A99D', '#FFB6C1',
  '#6B4F3A', '#C8D5B9', '#FF7A00', '#4B0082', '#A7C7E7', '#7B1E3A',
];

if (process.argv[1] && /test-design-contrast/.test(process.argv[1])) {
  let checked = 0;
  const weakSeen = new Set<string>();
  for (const p of PRIMARIES) {
    const c = colorsFor(p) as Record<string, string>;
    for (const [fg, bg] of SAFE_PAIRS) {
      const floor = fg === 'contrast' && bg === 'primary' ? 4.0 : 4.5;
      const r = contrastRatio(c[fg], c[bg]);
      assert.ok(r >= floor, `${p}: ${fg} on ${bg} (${c[fg]} on ${c[bg]}) is ${r.toFixed(2)}:1, below ${floor}`);
      checked++;
    }
    for (const [fg, bg] of WEAK_PAIRS) if (contrastRatio(c[fg], c[bg]) < 4.5) weakSeen.add(`${fg} on ${bg}`);
  }
  console.log(`ok - ${checked} safe role pairs across ${PRIMARIES.length} brand colours`);
  console.log(`info - pairs that fall below 4.5:1 for some brand colour (avoid in new templates): ${[...weakSeen].join('; ') || 'none'}`);
  assert.ok(weakSeen.size > 0, 'the weak list is still weak: if this fails, the roles were fixed and WEAK_PAIRS can go');
}
