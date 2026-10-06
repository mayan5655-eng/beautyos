// lib/design/recorderMime.js
//
// Which container and codecs the reel recorder asks the browser for, and what to call the file it gets back.
//
// Found 2026-10-06: the recorder asked for 'video/mp4;codecs=h264'. "h264" is not a codec string a browser
// knows ("avc1" is), so Chrome answered "unsupported" and the next candidate, plain 'video/mp4', was taken. Plain
// 'video/mp4' in Chrome records VP9 video and Opus audio INSIDE an MP4 - measured with ffmpeg on Chrome 153 and
// 154 - and the file was named ".mp4". Instagram takes H.264 video and AAC audio, so the one feature that exists
// to make a postable reel produced a file she could not post, under a name that said she could.
//
// So: H.264 + AAC is asked for explicitly, plain 'video/mp4' is never asked for, and the file is called .mp4 only
// when the recorder reports what it actually recorded and that is not VP9/VP8/AV1/Opus.

export const CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2', // H.264 baseline + AAC-LC: what Instagram, WhatsApp and every phone accept
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4;codecs=avc1',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

/**
 * The first candidate this browser can record, or 'video/webm'. `MR` is MediaRecorder (injected for tests).
 * @param {{ isTypeSupported?: (type: string) => boolean } | undefined} [MR]
 * @returns {string}
 */
export function pickRecorderMime(MR = typeof MediaRecorder !== 'undefined' ? MediaRecorder : undefined) {
  if (!MR || typeof MR.isTypeSupported !== 'function') return 'video/webm';
  for (const c of CANDIDATES) if (MR.isTypeSupported(c)) return c;
  return 'video/webm';
}

/**
 * 'mp4' only for an MP4 that Instagram will take; 'webm' for everything else. Pass the mimeType the RECORDER
 * reports after recording (recorder.mimeType), not the one that was requested.
 */
export function fileExtFor(actualMime) {
  const m = String(actualMime || '').toLowerCase();
  if (!m.startsWith('video/mp4')) return 'webm';
  if (/vp0?9|vp8|av01|av1|opus/.test(m)) return 'webm'; // an MP4 box around codecs Instagram rejects: do not pass it off as .mp4
  return 'mp4';
}

/** True when the file will not post to Instagram as it is (webm, or a codec set it does not take). */
export const needsConversion = (actualMime) => fileExtFor(actualMime) !== 'mp4';
