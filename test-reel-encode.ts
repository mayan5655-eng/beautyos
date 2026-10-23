// The reel encoder's numbers (lib/design/reelEncode.js) and the ₪ rule the canvas text follows.
// The browser half (WebCodecs + MP4 box) is checked by scripts/verify-reel-quality.mjs in a real Chrome.
import assert from 'node:assert/strict';
import { ENCODE_PRESETS, AUDIO, KEYFRAME_SEC, frameCount, frameTimeMs, sceneStarts, sceneIndexAt } from './lib/design/reelEncode.js';
import { glueShekel } from './lib/design/canvasText.ts';

// Presets: H.264 High, best first, all inside Instagram's limits (23-60 fps, <= 25 Mbps).
assert.ok(ENCODE_PRESETS.length >= 2);
assert.equal(ENCODE_PRESETS[0].fps, 60, '60 fps first');
for (const p of ENCODE_PRESETS) {
  assert.match(p.codec, /^avc1\.64/, `${p.label}: High profile, not Baseline (42)`);
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
