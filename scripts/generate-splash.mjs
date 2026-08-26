// scripts/generate-splash.mjs
//
// Generates the iOS launch images for the home-screen install.
//
//   node scripts/generate-splash.mjs
//
// Writes public/splash/*.png and prints the <link> media queries that go with
// them. Re-runnable and idempotent: it overwrites, so re-run it after changing
// the logo or the background.
//
// ── Why these exist ────────────────────────────────────────────────────────
// iOS has no fallback here. Without a matching apple-touch-startup-image it
// shows a BLANK WHITE SCREEN from tap until first paint, then snaps to the app.
// That moment is most of what "doesn't feel native" means, and it is the first
// thing a cosmetician sees every single time she opens her business.
//
// ── Why one image per device ───────────────────────────────────────────────
// iOS does not scale launch images. It matches one exactly, by device width,
// height and pixel ratio in a media query, and if nothing matches it falls back
// to white. So the list below is device sizes, not arbitrary sizes, and each
// entry needs its own file.
//
// Portrait only, deliberately. Landscape would double the count for a case that
// barely happens - the app is used one-handed - and a missing landscape image
// costs exactly what we have today, a white screen, rather than breaking
// anything.

import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const LOGO = 'public/bloomos-logo-full.png';   // 760x394 lockup
const OUT_DIR = 'public/splash';
/** Matches manifest.json background_color, so the launch image and the
 *  install's background are the same colour and there is no flash between. */
const BG = '#F8F5FB';
/** Logo width as a fraction of the device's SHORT edge. Conservative: the
 *  lockup is wide, and a launch image that fills the screen looks like a
 *  billboard rather than an app opening. */
const LOGO_FRACTION = 0.55;

/**
 * One entry per distinct (width, height, ratio) an iPhone can report.
 * Points, not pixels - the media query matches points and the FILE is points x
 * ratio. Devices sharing a geometry share one file (13 mini and 12 mini are the
 * same as 11 Pro / XS / X, for instance).
 */
const DEVICES = [
  { w: 440, h: 956, r: 3, note: 'iPhone 16 Pro Max' },
  { w: 430, h: 932, r: 3, note: 'iPhone 16 Plus, 15 Pro Max, 15 Plus, 14 Pro Max' },
  { w: 428, h: 926, r: 3, note: 'iPhone 14 Plus, 13 Pro Max, 12 Pro Max' },
  { w: 402, h: 874, r: 3, note: 'iPhone 16 Pro' },
  { w: 393, h: 852, r: 3, note: 'iPhone 16, 15 Pro, 15, 14 Pro' },
  { w: 390, h: 844, r: 3, note: 'iPhone 14, 13, 13 Pro, 12, 12 Pro' },
  { w: 375, h: 812, r: 3, note: 'iPhone 13 mini, 12 mini, 11 Pro, XS, X' },
  { w: 414, h: 896, r: 3, note: 'iPhone 11 Pro Max, XS Max' },
  { w: 414, h: 896, r: 2, note: 'iPhone 11, XR' },
  { w: 414, h: 736, r: 3, note: 'iPhone 8 Plus, 7 Plus, 6s Plus' },
  { w: 375, h: 667, r: 2, note: 'iPhone SE (2nd/3rd), 8, 7, 6s' },
];

await mkdir(OUT_DIR, { recursive: true });

const links = [];
let totalBytes = 0;

for (const d of DEVICES) {
  const pxW = d.w * d.r;
  const pxH = d.h * d.r;
  const name = `splash-${pxW}x${pxH}.png`;
  const file = path.join(OUT_DIR, name);

  // Logo sized off the SHORT edge so it is the same visual size in every image
  // rather than growing with the screen.
  const logoW = Math.round(Math.min(pxW, pxH) * LOGO_FRACTION);
  const logo = await sharp(LOGO).resize({ width: logoW }).toBuffer();

  const buf = await sharp({
    create: { width: pxW, height: pxH, channels: 4, background: BG },
  })
    .composite([{ input: logo, gravity: 'centre' }])
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();

  await writeFile(file, buf);
  totalBytes += buf.length;

  links.push({
    url: `/splash/${name}`,
    media:
      `(device-width: ${d.w}px) and (device-height: ${d.h}px) and ` +
      `(-webkit-device-pixel-ratio: ${d.r}) and (orientation: portrait)`,
  });

  console.log(`  ${name.padEnd(22)} ${String(pxW).padStart(4)}x${String(pxH).padStart(4)}  ` +
              `${(buf.length / 1024).toFixed(0).padStart(4)}KB   ${d.note}`);
}

console.log(`\n  ${DEVICES.length} images, ${(totalBytes / 1024).toFixed(0)}KB total\n`);
console.log('Paste into appleWebApp.startupImage in app/layout.tsx:\n');
console.log(JSON.stringify(links, null, 2));
