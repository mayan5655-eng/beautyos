// scripts/optimize-brand-images.mjs
//
// One-shot: shrink every brand image to the size it is actually drawn at.
// Why it exists: a cold load of /dashboard on throttled mobile took ~12 s
// because the page pulled 2 MB of images - two 1.3 MB flower PNGs behind marks
// drawn at 22-260 px, 120-170 KB PNGs behind 19-60 px icons, a 350 KB wordmark
// shown at 116-196 px. (Measured 2026-10-04, see test-asset-budget.ts.)
//
// The masters in brand/ and the files in public/ were overwritten in place:
// the full-resolution originals live in git history (commit before this one)
// and nothing in the product needs more than 2x of the display size. If a new
// large master is ever genuinely needed it does NOT belong in brand/ or
// public/ - keep it outside the repo or under 200 KB (test-asset-budget.ts).
//
// Delivery: components render these through app/BrandImage.tsx (next/image),
// which serves WebP at the real display width. The files here are the
// source - small PNG/JPEG, which is also the fallback for anything that
// cannot take WebP (og:image scrapers, the PWA manifest, apple-touch).
//
// Run: node scripts/optimize-brand-images.mjs   (idempotent on its own output
// for the palette PNGs; the JPEG steps expect the original PNG as input and
// skip when the .jpg already exists.)

import sharp from "sharp";
import { existsSync, statSync, unlinkSync, writeFileSync, readFileSync } from "node:fs";

const kb = (p) => Math.round(statSync(p).size / 1024);
const log = [];

// Alpha artwork -> palette PNG (alpha kept), resized to `width`.
async function png(src, outs, width) {
  const buf = await sharp(src)
    .resize({ width, withoutEnlargement: true })
    .png({ palette: true, quality: 82, effort: 10, compressionLevel: 9 })
    .toBuffer();
  for (const o of outs) writeFileSync(o, buf);
  log.push(`${outs.join(" + ")}  ${width}px  ${Math.round(buf.length / 1024)} KB`);
}

// Opaque artwork -> mozjpeg.
async function jpg(src, out, width, quality = 82) {
  const buf = await sharp(src)
    .resize({ width, withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
  writeFileSync(out, buf);
  log.push(`${out}  ${width}px  ${Math.round(buf.length / 1024)} KB`);
}

const both = (name) => [`brand/${name}`, `public/${name}`];

// ---- Flowers ----
// flower-full: PhotoFlowerCorners draws it at clamp(140px, 34vw, 260px).
await png("brand/flower-full.png", both("flower-full.png"), 640);
// flower-watermark was byte-for-byte the same artwork as flower-full at
// 1235px, drawn at 140-220 px. FLOWER_WATERMARK now points at flower-256.
for (const f of ["brand/flower-watermark.png", "public/flower-watermark.png"]) {
  if (existsSync(f)) unlinkSync(f);
}
// 64/128/256 were cut from the 1235px source; re-encode as palette PNG.
for (const w of [64, 128, 256]) {
  await png(`public/flower-${w}.png`, [`public/flower-${w}.png`, ...(existsSync(`brand/flower-${w}.png`) ? [`brand/flower-${w}.png`] : [])], w);
}
// Solid marks are drawn at 11-14 px.
for (const c of ["pink", "green", "white"]) {
  await png(`brand/flower-${c}-solid.png`, both(`flower-${c}-solid.png`), 96);
}

// ---- Line icons: drawn at 19-60 px, so 160 px covers 2.5x ----
for (const n of ["flower", "calendar", "microphone", "question", "heart", "play", "wallet", "person", "envelope", "frame", "sparkle"]) {
  await png(`brand/icons/icon-${n}.png`, [`brand/icons/icon-${n}.png`, `public/brand-icons/icon-${n}.png`], 160);
}

// ---- Wordmark: drawn 116-196 px wide; 600 covers 3x of the widest ----
await png("brand/kalmea-wordmark.png", both("kalmea-wordmark.png"), 600);
await png("public/kalmea-wordmark-text.png", [`public/kalmea-wordmark-text.png`], 480);
if (existsSync("brand/kalmea-wordmark-text.png")) await png("brand/kalmea-wordmark-text.png", ["brand/kalmea-wordmark-text.png"], 480);

// ---- Banners: opaque, so JPEG. Drawn at <= 280 px (wide) / <= ~400 px (header) ----
await jpg("brand/banner-wide.png", "brand/banner-wide.jpg", 1120);
writeFileSync("public/banner-wide.jpg", readFileSync("brand/banner-wide.jpg"));
await jpg("brand/banner-header.png", "brand/banner-header.jpg", 800);
writeFileSync("public/banner-header.jpg", readFileSync("brand/banner-header.jpg"));
for (const f of ["brand/banner-wide.png", "public/banner-wide.png", "brand/banner-header.png", "public/banner-header.png"]) {
  if (existsSync(f)) unlinkSync(f);
}

// ---- Open Graph card: true 1200x630 (the old file was 1200x816 while the
// page metadata declared 630), padded from the wide banner like the old
// generate-og-image.mjs did. JPEG: link scrapers prefer it and it is 10x smaller.
{
  const W = 1200, H = 630, PAD = { r: 254, g: 253, b: 249 };
  const banner = await sharp("brand/banner-wide.jpg").resize({ width: W }).toBuffer();
  const meta = await sharp(banner).metadata();
  const top = Math.floor(Math.max(0, H - meta.height) / 2);
  const buf = await sharp(banner)
    .extend({ top, bottom: Math.max(0, H - meta.height) - top, left: 0, right: 0, background: PAD })
    .resize(W, H)
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer();
  writeFileSync("public/og-1200x630.jpg", buf);
  writeFileSync("brand/og-1200x630.jpg", buf);
  log.push(`og-1200x630.jpg  1200x630  ${Math.round(buf.length / 1024)} KB`);
  for (const f of ["brand/og-1200x630.png", "public/og-1200x630.png"]) if (existsSync(f)) unlinkSync(f);
}

// ---- PWA / favicon source. 1024 is a master for generate-favicon-ico.mjs
// (which downsamples to 16-48 px); 512 is plenty and the manifest only uses
// 192/512/maskable-512.
await png("brand/icon-1024.png", ["brand/icon-1024.png", "public/icons/icon-1024.png"], 512);

// ---- Dead grid the line icons were first cropped from. ----
await png("brand/icons-set.png", ["brand/icons-set.png"], 1008);

// ---- Ads: social creatives, opaque -> JPEG at their own size ----
for (const a of ["ad-checklist", "ad-free-month", "ad-nails"]) {
  await jpg(`brand/ads/${a}.png`, `brand/ads/${a}.jpg`, 1080, 78);
  unlinkSync(`brand/ads/${a}.png`);
}

console.log(log.join("\n"));
