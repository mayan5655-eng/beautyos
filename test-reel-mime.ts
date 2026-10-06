// What the reel recorder asks the browser for, and what it names the file.
//
// 2026-10-06: it asked for 'video/mp4;codecs=h264' (not a real codec string), fell through to plain 'video/mp4',
// which Chrome fills with VP9 + Opus, and named the result ".mp4". Instagram takes H.264 + AAC. This test pins the
// decision logic against browsers modelled on what was measured; scripts/verify-reel-codec.mjs is the other half -
// it records in a real Chrome and decodes the file with ffmpeg (a browser cannot run inside this suite, and a
// check that quietly skips when there is none is the kind this project has stopped trusting).
import assert from 'node:assert/strict';
import { pickRecorderMime, fileExtFor, needsConversion } from './lib/design/recorderMime.js';

const browser = (supported: string[]) => ({ isTypeSupported: (t: string) => supported.includes(t) });

// Chrome 153/154, measured: avc1 variants supported, "h264" not, plain video/mp4 supported (and = VP9/Opus)
const chrome = browser([
  'video/mp4', 'video/mp4;codecs=avc1', 'video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2',
  'video/webm', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8',
]);
assert.equal(pickRecorderMime(chrome), 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'Chrome: H.264 + AAC, asked for by name');

// a Chromium build with no H.264 encoder: plain video/mp4 is still "supported" but would be VP9 - must NOT be taken
const noH264 = browser(['video/mp4', 'video/webm', 'video/webm;codecs=vp9']);
assert.equal(pickRecorderMime(noH264), 'video/webm;codecs=vp9', 'no H.264 here: an honest webm, not a VP9 stream in an mp4 box');

// Firefox: webm only
assert.equal(pickRecorderMime(browser(['video/webm', 'video/webm;codecs=vp8'])), 'video/webm;codecs=vp8');
// nothing at all / no MediaRecorder
assert.equal(pickRecorderMime(browser([])), 'video/webm');
assert.equal(pickRecorderMime(undefined as any), 'video/webm');
assert.equal(pickRecorderMime({} as any), 'video/webm');

// the old string is never requested
const asked: string[] = [];
pickRecorderMime({ isTypeSupported: (t: string) => { asked.push(t); return false; } });
assert.ok(!asked.includes('video/mp4') && !asked.some((t) => /h264/.test(t)), `never asks for plain video/mp4 or "h264" (asked: ${asked.join(' | ')})`);

// ── the name of the file comes from what was RECORDED ─────────────────────────────────────────────────────
assert.equal(fileExtFor('video/mp4;codecs=avc1.420020,mp4a.40.2'), 'mp4', 'what Chrome reports for an H.264 recording (measured)');
assert.equal(fileExtFor('video/mp4;codecs=avc1'), 'mp4');
assert.equal(fileExtFor('video/mp4'), 'mp4', 'Safari reports a bare video/mp4 for its H.264/AAC recordings');
assert.equal(fileExtFor('video/mp4;codecs=vp9,opus'), 'webm', 'what plain video/mp4 gave in Chrome (measured): NOT a postable .mp4');
assert.equal(fileExtFor('video/mp4;codecs=av01.0.05M.08,opus'), 'webm');
assert.equal(fileExtFor('video/webm;codecs=vp9'), 'webm');
assert.equal(fileExtFor(''), 'webm');
assert.equal(fileExtFor(undefined), 'webm');
assert.equal(needsConversion('video/mp4;codecs=vp9,opus'), true);
assert.equal(needsConversion('video/mp4;codecs=avc1.42E01E,mp4a.40.2'), false);

console.log('reel mime: ok');
