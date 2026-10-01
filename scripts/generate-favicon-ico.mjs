// scripts/generate-favicon-ico.mjs
//
// Builds app/favicon.ico from brand/icon-1024.png.
//
// Why this exists: the brand/favicon.ico handed over for the Kalmea rebrand
// embeds a non-RGBA PNG frame, which Turbopack's ICO decoder rejects outright
// ("The PNG is not in RGBA format!") - a hard build failure, not a cosmetic
// issue. Rather than depend on whatever export produced that file, this
// builds a known-good ICO directly: three RGBA PNG frames (16/32/48),
// hand-assembled into the standard ICO container (PNG-compressed frames are
// valid ICO content at any size, not just 256+).
//
// Re-run after the source icon artwork changes: node scripts/generate-favicon-ico.mjs
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';

const SRC = 'brand/icon-1024.png';
const OUT = 'app/favicon.ico';
const SIZES = [16, 32, 48];

async function pngFrame(size) {
  return sharp(SRC).resize(size, size).ensureAlpha().png().toBuffer();
}

const frames = await Promise.all(SIZES.map(pngFrame));

// ICONDIR (6 bytes) + one ICONDIRENTRY (16 bytes) per frame, then the raw PNG
// bytes back to back in the same order as the directory entries.
const dir = Buffer.alloc(6 + 16 * frames.length);
dir.writeUInt16LE(0, 0); // reserved
dir.writeUInt16LE(1, 2); // type: 1 = icon
dir.writeUInt16LE(frames.length, 4);

let offset = dir.length;
frames.forEach((png, i) => {
  const entry = 6 + i * 16;
  const size = SIZES[i];
  dir.writeUInt8(size === 256 ? 0 : size, entry + 0); // width
  dir.writeUInt8(size === 256 ? 0 : size, entry + 1); // height
  dir.writeUInt8(0, entry + 2); // color count (0 = no palette)
  dir.writeUInt8(0, entry + 3); // reserved
  dir.writeUInt16LE(1, entry + 4); // color planes
  dir.writeUInt16LE(32, entry + 6); // bits per pixel
  dir.writeUInt32LE(png.length, entry + 8); // size of this frame's data
  dir.writeUInt32LE(offset, entry + 12); // offset of this frame's data
  offset += png.length;
});

await writeFile(OUT, Buffer.concat([dir, ...frames]));
console.log(`wrote ${OUT} (${SIZES.join('/')} px, ${frames.reduce((n, f) => n + f.length, 0) + dir.length} bytes)`);
