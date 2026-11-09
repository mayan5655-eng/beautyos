// The promo video's original music (marketing/promo-music.mjs, built from lib/design/reelMusic.js `voices`), and the promo's copy.
// The music: the exact length, never clipping, the same samples for the same inputs, a real drop where the story turns, the drums
// gone on the closing card. The copy: no em or en dashes, no claim of automatic WhatsApp messages (owner rule, 2026-11-09).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as promo from './marketing/promo-music.mjs';
import * as reelMusic from './lib/design/reelMusic.js';
const { renderPromoTrack, BPM, BEAT, BAR }: any = promo;
const { audioStats, PEAK_MAX, voices, renderMood }: any = reelMusic;

assert.equal(BPM, 120);
assert.equal(BEAT, 0.5);
assert.equal(BAR, 2);
assert.equal(typeof voices.kick, 'function', 'the reel music exports its instruments');

const SR = 16000; // quick in the test; the same code renders at 48 kHz for the video
const sections = [{ kind: 'hook', bars: 1 }, { kind: 'pain', bars: 2 }, { kind: 'build', bars: 1 }, { kind: 'main', bars: 3 }, { kind: 'outro', bars: 2 }];
const opts = { seconds: 18, sections, hits: [{ s: 8, kind: 'impact' }, { s: 10, kind: 'whoosh' }], sampleRate: SR };
const a = renderPromoTrack(opts), b = renderPromoTrack(opts);
assert.equal(a.channels.length, 2);
assert.equal(a.channels[0].length, 18 * SR, 'exact length');
let same = true;
for (let i = 0; i < a.channels[0].length; i += 97) if (a.channels[0][i] !== b.channels[0][i]) { same = false; break; }
assert.ok(same, 'deterministic');
const st = audioStats(a.channels);
assert.ok(st.peak <= PEAK_MAX + 1e-6 && st.clipped === 0, `peak ${st.peakDb}`);
assert.ok(st.rmsDb > -24 && st.rmsDb < -10, `loudness ${st.rmsDb}`);

const rms = (s0: number, s1: number) => { let x = 0, n = 0; for (const c of a.channels) for (let i = s0 * SR; i < s1 * SR; i++) { x += c[i] * c[i]; n++; } return Math.sqrt(x / n); };
assert.ok(rms(8.2, 13.8) > rms(0.2, 1.8) * 1.5, 'the drop (main) is clearly fuller than the hook');
assert.ok(rms(15, 17) < rms(8.2, 13.8), 'the closing card is quieter than the main section');

// renderMood is unchanged by the new export
const m = renderMood('pop', { durationMs: 2000, sampleRate: SR });
assert.equal(m.channels[0].length, 2 * SR);

// the promo copy
const src = fs.readFileSync('marketing/promo-motion.mjs', 'utf8');
const quoted = (src.match(/'[^'\n]*[֐-׿][^'\n]*'/g) || []).join('\n');
assert.ok(!/[–—]/.test(quoted), 'no em or en dashes in the promo copy');
assert.ok(!/אוטומטי/.test(quoted), 'the promo never calls a message automatic');
console.log('promo music and copy: ok');
