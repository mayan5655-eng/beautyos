// app/design/reelEncoder.js
//
// Frame-exact MP4 encoding of a reel in her browser: WebCodecs (through mediabunny, which writes the MP4 box) draws
// frame n at n / fps and hands it to the H.264 encoder, then mixes her music in as AAC. The numbers live in
// lib/design/reelEncode.js; ReelRender falls back to the MediaRecorder take when this browser cannot do it.

import { Output, Mp4OutputFormat, BufferTarget, CanvasSource, AudioBufferSource, Quality, canEncodeVideo, canEncodeAudio } from 'mediabunny';
import { ENCODE_PRESETS, AUDIO, KEYFRAME_SEC, frameCount, frameTimeMs } from '@/lib/design/reelEncode';

/** Every preset this browser says it can encode at W x H, best first; empty with no WebCodecs / no H.264 encoder. */
export async function encodePresets(W, H) {
  if (typeof window === 'undefined' || typeof window.VideoEncoder === 'undefined') return [];
  const ok = [];
  for (const p of ENCODE_PRESETS) {
    try {
      if (await canEncodeVideo('avc', { width: W, height: H, bitrate: p.bitrate, frameRate: p.fps, fullCodecString: p.codec })) ok.push(p);
    } catch { /* not this one */ }
  }
  return ok;
}

/** True when the browser can encode the music track (AAC). */
export async function canEncodeMusic() {
  if (typeof window === 'undefined' || typeof window.AudioEncoder === 'undefined') return false;
  try { return await canEncodeAudio('aac', { numberOfChannels: AUDIO.channels, sampleRate: AUDIO.sampleRate, bitrate: AUDIO.bitrate }); } catch { return false; }
}

/** Her music, decoded and laid out to exactly the reel's length: looped if short, faded out at the end. */
async function musicBuffer(url, seconds) {
  const bytes = await (await fetch(url)).arrayBuffer();
  const length = Math.max(1, Math.round(seconds * AUDIO.sampleRate));
  const off = new OfflineAudioContext(AUDIO.channels, length, AUDIO.sampleRate);
  const decoded = await off.decodeAudioData(bytes);
  const src = off.createBufferSource();
  src.buffer = decoded; src.loop = true;
  const gain = off.createGain();
  const fadeAt = Math.max(0, seconds - AUDIO.fadeOutSec);
  gain.gain.setValueAtTime(1, 0);
  gain.gain.setValueAtTime(1, fadeAt);
  gain.gain.linearRampToValueAtTime(0, seconds);
  src.connect(gain); gain.connect(off.destination);
  src.start(0);
  return off.startRendering();
}

/**
 * Encode a reel. `drawAt(ctx, ms)` paints the frame `ms` into the reel onto `canvas`. Returns an MP4 Blob.
 * @param {{ canvas: HTMLCanvasElement, drawAt: (ctx: CanvasRenderingContext2D, ms: number) => void, totalMs: number,
 *   preset: { fps: number, bitrate: number, codec: string }, musicUrl?: string | null, onProgress?: (p: number) => void,
 *   shouldStop?: () => boolean }} opts
 */
export async function encodeReelMp4({ canvas, drawAt, totalMs, preset, musicUrl = null, onProgress, shouldStop }) {
  const ctx = canvas.getContext('2d');
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const video = new CanvasSource(canvas, {
    codec: 'avc',
    // A bitrate, explicitly: a bare number given to Quality is a quality LEVEL (see lib/design/reelEncode.js, 2026-10-24).
    bitrate: new Quality({ bitrate: preset.bitrate }),
    fullCodecString: preset.codec,
    keyFrameInterval: KEYFRAME_SEC,
    latencyMode: 'quality',
  });
  output.addVideoTrack(video, { frameRate: preset.fps });
  let audio = null;
  if (musicUrl) {
    audio = new AudioBufferSource({ codec: 'aac', bitrate: new Quality({ bitrate: AUDIO.bitrate }) });
    output.addAudioTrack(audio);
  }
  await output.start();
  try {
    const n = frameCount(totalMs, preset.fps);
    const dt = 1 / preset.fps;
    for (let i = 0; i < n; i++) {
      if (shouldStop?.()) throw new Error('stopped');
      drawAt(ctx, Math.min(frameTimeMs(i, preset.fps), totalMs));
      await video.add(i * dt, dt);
      if (i % 6 === 0) onProgress?.(i / n);
    }
    video.close();
    if (audio) {
      await audio.add(await musicBuffer(musicUrl, n * dt));
      audio.close();
    }
    await output.finalize();
  } catch (e) {
    try { await output.cancel(); } catch { /* ignore */ }
    throw e;
  }
  onProgress?.(1);
  return new Blob([output.target.buffer], { type: `video/mp4;codecs=${preset.codec}${audio ? ',mp4a.40.2' : ''}` });
}
