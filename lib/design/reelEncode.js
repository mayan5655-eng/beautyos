// lib/design/reelEncode.js
//
// How the reel recorder encodes a reel, as data: the presets it tries, how many frames a reel has and where each
// one falls. Pure, so the suite can pin it; app/design/reelEncoder.js does the browser work with these numbers.
//
// Why there is a second path next to MediaRecorder (2026-10-21, "the best quality reels"): the recorder captured a
// canvas in REAL TIME while requestAnimationFrame drew it. Whatever the tab could not draw in time was a dropped or
// doubled frame, the clip had to play out at 1x (a 14 s reel took 14 s plus), it asked for H.264 Baseline at
// 6 Mbps, and every frame's timestamp was whenever the browser got round to it. WebCodecs encodes frame by frame
// instead: frame n is drawn at exactly n / fps, nothing can be dropped, it runs as fast as the encoder (usually
// faster than real time) and the encoder is told exactly what to make - H.264 High profile at Instagram's top
// frame rate, AAC audio, in an MP4 whose index sits at the front (what the Instagram API asks for).

/**
 * Tried in order; the first one this browser can encode wins. Instagram takes 23-60 fps and up to 25 Mbps VBR
 * (Graph API ig-user/media reference). 60 fps makes the slow Ken Burns zoom and the slides glide instead of step;
 * 16 Mbps keeps a 1080x1920 frame of photo + type clean after Instagram re-encodes it. Level 4.2 (2a) is the
 * smallest H.264 level that allows 1080x1920 at 60 fps; 4.0 (28) covers 30 fps.
 */
//
// 2026-10-24, a customer on iPhone: "This specific encoder configuration (avc1.64002a, quantizer 0 / Infinity bps,
// ...) is not supported". The bitrate below was handed to mediabunny as `new Quality(16_000_000)`, which is a
// QUALITY LEVEL, not a bitrate: sixteen million on a 0-1 scale became quantizer 0 (near lossless) with an infinite
// bitrate estimate. Chrome accepted it (and made huge files); Safari's encoder refuses quantizer mode outright.
// reelEncoder now passes { bitrate }, and the Main and Baseline presets are there for phones whose hardware encoder
// says no to High - each preset that fails while encoding hands over to the next, then to MediaRecorder.
export const ENCODE_PRESETS = [
  { fps: 60, bitrate: 16_000_000, codec: 'avc1.64002a', label: 'H.264 High 1080x1920 60fps' },
  { fps: 30, bitrate: 12_000_000, codec: 'avc1.640028', label: 'H.264 High 1080x1920 30fps' },
  { fps: 30, bitrate: 10_000_000, codec: 'avc1.4d0028', label: 'H.264 Main 1080x1920 30fps' },
  { fps: 30, bitrate: 8_000_000, codec: 'avc1.420028', label: 'H.264 Baseline 1080x1920 30fps' },
];

/** Music: AAC-LC stereo at 48 kHz (Instagram's ceiling), 192 kbps. */
export const AUDIO = { codec: 'aac', sampleRate: 48_000, channels: 2, bitrate: 192_000, fadeOutSec: 0.8 };

/** Key frame every second: a closed GOP every second, so Instagram's own cutter and the preview scrub cleanly. */
export const KEYFRAME_SEC = 1;

/** Number of frames in a reel of `totalMs` at `fps` (at least one). */
export const frameCount = (totalMs, fps) => Math.max(1, Math.round((totalMs / 1000) * fps));

/** Milliseconds into the reel at which frame `n` is drawn. Exact: never wall-clock. */
export const frameTimeMs = (n, fps) => (n * 1000) / fps;

/** Start of each scene in ms, plus the total. */
export function sceneStarts(scenes) {
  const starts = [];
  let acc = 0;
  for (const s of scenes) { starts.push(acc); acc += s.ms; }
  return { starts, total: acc };
}

/** Which scene is on screen `el` ms into the reel. */
export function sceneIndexAt(starts, el) {
  let i = 0;
  while (i < starts.length - 1 && el >= starts[i + 1]) i++;
  return i;
}
