// scripts/verify-reel-codec.mjs
//
// Records a few seconds (video + audio) in a REAL Chrome using the mime type lib/design/recorderMime.js picks, then
// decodes the file with ffmpeg and checks it is what Instagram takes: H.264 video, AAC audio. Run by hand after
// touching the recorder or after a Chrome major release; it needs the playwright and ffmpeg-static that live in
// marketing/node_modules (so it is not part of the test suite, which runs on a build machine with no browser).
//
//   node --experimental-strip-types --no-warnings scripts/verify-reel-codec.mjs
//   (set CHROME_CHANNEL=chrome to use an installed Chrome instead of Playwright's Chromium)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const req = createRequire(new URL('../marketing/package.json', import.meta.url));
const { chromium } = req('playwright-core');
const ffmpeg = req('ffmpeg-static');
const { pickRecorderMime, fileExtFor, CANDIDATES } = await import('../lib/design/recorderMime.js');

const browser = await chromium.launch(process.env.CHROME_CHANNEL ? { channel: process.env.CHROME_CHANNEL } : {});
const page = await browser.newPage();
await page.goto('about:blank');
const support = await page.evaluate((list) => Object.fromEntries(list.map((c) => [c, MediaRecorder.isTypeSupported(c)])), CANDIDATES);
const mime = pickRecorderMime({ isTypeSupported: (t) => !!support[t] }); // the real chooser, fed this browser's real answers
const { actual, b64 } = await page.evaluate(async (mimeType) => {
  const c = document.createElement('canvas'); c.width = 540; c.height = 960; const x = c.getContext('2d');
  const ac = new AudioContext(); const osc = ac.createOscillator(); const d = ac.createMediaStreamDestination(); osc.connect(d); osc.start();
  const s = new MediaStream([...c.captureStream(30).getVideoTracks(), ...d.stream.getAudioTracks()]);
  const r = new MediaRecorder(s, { mimeType, videoBitsPerSecond: 6000000 }); const ch = []; r.ondataavailable = (e) => ch.push(e.data);
  r.start(); let t = 0; const iv = setInterval(() => { x.fillStyle = `hsl(${t * 9},60%,50%)`; x.fillRect(0, 0, 540, 960); t++; }, 33);
  await new Promise((res) => setTimeout(res, 2500)); clearInterval(iv); await new Promise((res) => { r.onstop = res; r.stop(); });
  const buf = new Uint8Array(await new Blob(ch).arrayBuffer()); let bin = ''; for (const v of buf) bin += String.fromCharCode(v);
  return { actual: r.mimeType, b64: btoa(bin) };
}, mime);
await browser.close();

const file = path.join(os.tmpdir(), `reel-codec-${Date.now()}.${fileExtFor(actual)}`);
fs.writeFileSync(file, Buffer.from(b64, 'base64'));
const info = (spawnSync(ffmpeg, ['-i', file], { encoding: 'utf8' }).stderr || '').split('\n').filter((l) => /Stream #/.test(l)).join('\n');
console.log(`asked for : ${mime}\nrecorder  : ${actual}\nfile name : ${path.basename(file)}\n${info}`);
const h264 = /Video: h264/.test(info), aac = /Audio: aac/.test(info);
if (fileExtFor(actual) === 'mp4' && !(h264 && aac)) { console.error('\nFAIL: the file is named .mp4 but is not H.264 + AAC - Instagram would reject it.'); process.exit(1); }
if (fileExtFor(actual) === 'mp4') console.log('\nOK: H.264 + AAC in an .mp4 - the combination Instagram takes.');
else console.log('\nNOTE: this browser cannot record H.264; the file is honestly named .webm and the app tells her so.');
fs.rmSync(file, { force: true });
