// scripts/clean-wordmark-alpha.mjs
//
// The Kalmea wordmark PNGs had been cut out of a white page, and the cut stopped at the
// letters' outline: the ENCLOSED areas - the counters of the a, e, a - stayed opaque white.
// On a white page nobody sees that; on the cream the app and the public pages sit on, they
// are white fragments inside the lettering (2,207 px in kalmea-wordmark.png, 2,894 in the
// text-only one, counted on 2026-10-06).
//
//   node scripts/clean-wordmark-alpha.mjs public/kalmea-wordmark.png [--from-x=260]
//
// What it does: finds the connected regions of opaque near-white pixels and makes them
// transparent, then softens the 2px ring around them (un-blending the white out of the edge
// pixels) so there is no light halo on any background. --from-x limits it to the lettering:
// the flower's own pale highlights to its left are art, not leftovers, and stay.
// Idempotent: a clean file has no such regions and is written back unchanged.

import sharp from 'sharp';
import fs from 'node:fs';

const file = process.argv[2];
const fromX = +(process.argv.find((a) => a.startsWith('--from-x='))?.split('=')[1] ?? 0);
if (!file) { console.error('usage: node scripts/clean-wordmark-alpha.mjs <png> [--from-x=N]'); process.exit(1); }

const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, N = W * H;
const minC = (i) => Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
const near = (i) => data[i * 4 + 3] >= 128 && minC(i) >= 225 && Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) - minC(i) <= 22;

const mask = new Uint8Array(N);
const seen = new Uint8Array(N);
let regions = 0, cleared = 0;
for (let s = 0; s < N; s++) {
  if (seen[s] || !near(s)) continue;
  const stack = [s]; seen[s] = 1; const members = []; let x0 = W;
  while (stack.length) {
    const p = stack.pop(); members.push(p); const x = p % W; x0 = Math.min(x0, x);
    const nb = [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W];
    for (const q of nb) if (q >= 0 && q < N && !seen[q] && near(q)) { seen[q] = 1; stack.push(q); }
  }
  if (x0 < fromX) continue; // the flower's highlights
  regions++; cleared += members.length;
  for (const p of members) mask[p] = 1;
}

// soften the ring: opaque pixels within 2px of a cleared one lose the white they were blended with
const ring = new Uint8Array(N);
for (let p = 0; p < N; p++) {
  if (!mask[p]) continue;
  const x = p % W, y = (p / W) | 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const xx = x + dx, yy = y + dy;
    if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
    const q = yy * W + xx; if (!mask[q]) ring[q] = 1;
  }
}
for (let p = 0; p < N; p++) {
  if (mask[p]) { data[p * 4 + 3] = 0; continue; }
  if (!ring[p] || data[p * 4 + 3] === 0) continue;
  const m = minC(p);
  if (m <= 150) continue; // solid ink: untouched
  const t = Math.max(0, 1 - (m - 150) / 105); // how much of the pixel is ink rather than white
  if (t < 0.12) { data[p * 4 + 3] = 0; continue; }
  for (let c = 0; c < 3; c++) data[p * 4 + c] = Math.max(0, Math.min(255, Math.round((data[p * 4 + c] - 255 * (1 - t)) / t)));
  data[p * 4 + 3] = Math.round(data[p * 4 + 3] * t);
}

await sharp(data, { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9 }).toFile(file + '.tmp');
fs.renameSync(file + '.tmp', file);
console.log(`${file}: ${regions} enclosed region(s), ${cleared} px made transparent`);
