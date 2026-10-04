// scripts/generate-og-image.mjs
//
// Regenerates public/og-1200x630.png from the full banner (brand/banner-wide.png)
// instead of whatever narrower mark it used before - the banner is the
// strongest brand asset and a share preview is exactly the kind of "say what
// this is, once, boldly" moment it's for.
//
// OG's fixed 1200x630 (1.905:1) isn't the banner's own 1568x580 (2.704:1), so
// this resizes to the full 1200 width and pads top/bottom with the banner's
// own near-white edge tone (sampled, not guessed) rather than cropping into
// the flowers or the wordmark.
import sharp from "sharp";

const SRC = "brand/banner-wide.png";
const OUT = "public/og-1200x630.png";
const W = 1200, H = 630;
const PAD_COLOR = { r: 254, g: 253, b: 249 };

const resized = await sharp(SRC).resize({ width: W }).toBuffer();
const meta = await sharp(resized).metadata();
const padTotal = Math.max(0, H - meta.height);
const padTop = Math.floor(padTotal / 2);
const padBottom = padTotal - padTop;

await sharp(resized)
  .extend({ top: padTop, bottom: padBottom, left: 0, right: 0, background: PAD_COLOR })
  .resize(W, H) // guards against off-by-one rounding
  .png()
  .toFile(OUT);

console.log(`wrote ${OUT} (${W}x${H})`);
