// scripts/crop-brand-icons.mjs
//
// One-time (re-runnable) crop of brand/icons-set.png - a 3x2 grid of six
// line icons (flower, calendar, microphone / play, question, heart), each a
// deep-green outline with a small pink cosmos attached, on a flat cream
// background with no alpha channel - into six separate transparent PNGs in
// brand/icons/ (and from there, manually copied into public/brand-icons/
// for serving; see lib/brand.ts's ICON_* exports).
//
// The background is chroma-keyed out rather than kept, since these icons
// land on all sorts of card backgrounds (white cards, tinted accent cards),
// not just this one cream. The threshold is feathered over a small band so
// the edge doesn't get a hard cream halo.
import sharp from "sharp";

const CELLS = [
  { name: "flower", col: 0, row: 0 },
  { name: "calendar", col: 1, row: 0 },
  { name: "microphone", col: 2, row: 0 },
  { name: "play", col: 0, row: 1 },
  { name: "question", col: 1, row: 1 },
  { name: "heart", col: 2, row: 1 },
];
const CW = 448, CH = 448;
const BG = { r: 247, g: 243, b: 235 };
const THRESH = 18;

async function run() {
  for (const cell of CELLS) {
    const { data, info } = await sharp("brand/icons-set.png")
      .extract({ left: cell.col * CW, top: cell.row * CH, width: CW, height: CH })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    const out = Buffer.from(data);
    for (let i = 0; i < out.length; i += channels) {
      const r = out[i], g = out[i + 1], b = out[i + 2];
      const dist = Math.sqrt((r - BG.r) ** 2 + (g - BG.g) ** 2 + (b - BG.b) ** 2);
      if (dist < THRESH) {
        out[i + 3] = 0;
      } else if (dist < THRESH * 2.2) {
        const t = (dist - THRESH) / (THRESH * 1.2);
        out[i + 3] = Math.max(0, Math.min(255, Math.round(255 * t)));
      }
    }
    await sharp(out, { raw: { width, height, channels } })
      .png()
      .trim({ threshold: 10 })
      .toFile(`brand/icons/icon-${cell.name}.png`);
    console.log("wrote", cell.name);
  }
}
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
