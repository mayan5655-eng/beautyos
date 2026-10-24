// The reel encoder's numbers (lib/design/reelEncode.js) and the ₪ rule the canvas text follows.
// The browser half (WebCodecs + MP4 box) is checked by scripts/verify-reel-quality.mjs in a real Chrome.
import assert from 'node:assert/strict';
import { ENCODE_PRESETS, AUDIO, KEYFRAME_SEC, frameCount, frameTimeMs, sceneStarts, sceneIndexAt } from './lib/design/reelEncode.js';
import { glueShekel } from './lib/design/canvasText.ts';
import { readFileSync } from 'node:fs';
import { Quality } from 'mediabunny';

// Presets: H.264 High first, then Main and Baseline for phones whose encoder refuses High (iPhone, 2026-10-24),
// best first, all inside Instagram's limits (23-60 fps, <= 25 Mbps).
assert.ok(ENCODE_PRESETS.length >= 2);
assert.equal(ENCODE_PRESETS[0].fps, 60, '60 fps first');
assert.match(ENCODE_PRESETS[0].codec, /^avc1\.64/, 'High profile first');
assert.match(ENCODE_PRESETS[1].codec, /^avc1\.64/, 'High profile second');
const RANK: Record<string, number> = { '64': 3, '4d': 2, '42': 1 };
for (let i = 1; i < ENCODE_PRESETS.length; i++) {
  assert.ok(RANK[ENCODE_PRESETS[i].codec.slice(5, 7).toLowerCase()] <= RANK[ENCODE_PRESETS[i - 1].codec.slice(5, 7).toLowerCase()], 'never a better profile after a worse one');
}
for (const p of ENCODE_PRESETS) {
  assert.match(p.codec, /^avc1\.(64|4d|42)00(28|2a)$/i, `${p.label}: H.264 High/Main/Baseline at level 4.0 or 4.2`);
  assert.ok(p.fps >= 23 && p.fps <= 60, `${p.label}: fps Instagram takes`);
  assert.ok(p.bitrate > 6_000_000 && p.bitrate <= 25_000_000, `${p.label}: above the old 6 Mbps, within Instagram's 25`);
}
// level 4.2 (0x2a) is needed for 1080x1920 at 60 fps: 8160 macroblocks x 60 = 489,600 MB/s, above 4.0/4.1's 245,760
assert.equal(ENCODE_PRESETS.find((p) => p.fps === 60)?.codec.slice(-2).toLowerCase(), '2a');
assert.equal(AUDIO.codec, 'aac');
assert.ok(AUDIO.sampleRate <= 48_000, 'Instagram: 48 kHz max');
assert.ok(KEYFRAME_SEC > 0 && KEYFRAME_SEC <= 2);

// Frames: exact count, exact times - never wall clock.
assert.equal(frameCount(14_000, 60), 840);
assert.equal(frameCount(8_500, 30), 255);
assert.equal(frameCount(0, 60), 1);
assert.equal(frameTimeMs(0, 60), 0);
assert.equal(frameTimeMs(60, 60), 1000);
assert.equal(frameTimeMs(45, 30), 1500);

// Scenes: which one is on screen.
const { starts, total } = sceneStarts([{ ms: 2500 }, { ms: 3000 }, { ms: 3000 }]);
assert.deepEqual(starts, [0, 2500, 5500]);
assert.equal(total, 8500);
assert.equal(sceneIndexAt(starts, 0), 0);
assert.equal(sceneIndexAt(starts, 2499), 0);
assert.equal(sceneIndexAt(starts, 2500), 1);
assert.equal(sceneIndexAt(starts, 8500), 2, 'the last frame stays on the last scene');

// ₪ glued to its number, either side, so the wrap can never strand it and bidi cannot move it.
assert.equal(glueShekel('טיפול פנים 249 ₪'), 'טיפול פנים 249₪');
assert.equal(glueShekel('רק ₪ 249 היום'), 'רק ₪249 היום');
assert.equal(glueShekel('₪249 במקום ₪320'), '₪249 במקום ₪320', 'already glued: unchanged');
assert.equal(glueShekel('שורה 249\n₪ אחרי'), 'שורה 249\n₪ אחרי', 'a chosen line break is never removed');

console.log('test-reel-encode: ok');

// The bitrate reaches the encoder as a bitrate (2026-10-24). new Quality(16_000_000) is a quality LEVEL: it became
// quantizer 0 with no bitrate, the exact configuration iPhone Safari refused ("quantizer 0 / Infinity bps").
const rc = (q: any) => q._toVideoRateControl('avc', 1080, 1920);
assert.equal(rc(new Quality(16_000_000)).quantizer, 0, 'the old call: quantizer mode (kept as the proof of the bug)');
for (const p of ENCODE_PRESETS) {
  const r = rc(new Quality({ bitrate: p.bitrate }));
  assert.equal(r.quantizer, null, `${p.label}: no quantizer mode`);
  assert.equal(r.bitrate, p.bitrate, `${p.label}: the preset's bitrate`);
}
const enc = readFileSync('app/design/reelEncoder.js', 'utf8');
assert.doesNotMatch(enc, /new Quality\((?!\{)/, 'every Quality in the encoder is given an options object');
assert.match(enc, /new Quality\(\{ bitrate: preset\.bitrate \}\)/);
assert.match(enc, /new Quality\(\{ bitrate: AUDIO\.bitrate \}\)/);
const rr = readFileSync('app/design/ReelRender.jsx', 'utf8');
assert.match(rr, /for \(const preset of presets\)/, 'a preset that fails hands over to the next');
assert.match(rr, /יצירת הסרטון לא הצליחה בדפדפן הזה/, 'a browser error reaches her in Hebrew');
