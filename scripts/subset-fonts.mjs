// scripts/subset-fonts.mjs
//
// One-shot: cut the self-hosted fonts in fonts/ down to the glyphs and weights
// the product actually uses. Measured 2026-10-04, a cold /dashboard load on
// throttled mobile pulled 785 KB of font files (Inter 343 KB, Cormorant
// 205 KB, ...) - the full multi-script variable fonts - before a word of
// Hebrew could be painted.
//
//   Inter       Latin only (digits, prices, Latin copy). Hebrew falls through
//               to Assistant in --sans. wght 400-800 (nothing uses 300).
//   Cormorant   Latin only - it never had Hebrew; --display falls through to
//               Frank Ruhl for that. wght 500-700.
//   Frank Ruhl  Hebrew + Latin. wght 500-900 (600/700/900 are the used ones).
//   Assistant   Hebrew + Latin. wght 400-800.
//   Heebo       Hebrew + Latin. wght 400-700. Kept (privacy/terms/design
//               studio name it) but no longer preloaded on every page.
//
// Axis limits and glyph ranges mirror what the CSS can ask for; a weight
// outside the range clamps to the nearest instead of failing. The layout.tsx
// `weight:` ranges were updated to match.
//
// Needs the subsetter, which is deliberately not a project dependency (same
// reason as wawoff2 - see the comment in app/layout.tsx):
//   npm install --no-save subset-font
//   node scripts/subset-fonts.mjs
// The originals are in git history; re-running on already-subset files is a
// no-op in effect.

import subsetFont from "subset-font";
import { readFileSync, writeFileSync } from "node:fs";

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String.fromCodePoint(a + i)).join("");
const LATIN =
  range(0x20, 0x7e) + range(0xa0, 0xff) + "ıŒœʻʼˆ˚˜" +
  range(0x2000, 0x206f) + "⁴€₪™←↑→↓−∕✓✔×•…★☆";
const HEBREW = range(0x0590, 0x05ff) + range(0xfb1d, 0xfb4f) + "‌‍‎‏◌";

// Latin-only faces also drop OpenType features nothing asks for (Inter's
// stylistic sets and the like) - globals.css turns on cv02/cv03/cv04/ss01 for
// Inter, so those stay. Hebrew faces keep every feature: shaping marks and
// ligatures are the whole point of them.
const LATIN_FEATURES = ["kern", "liga", "calt", "ccmp", "locl", "mark", "mkmk", "case", "tnum", "lnum", "onum", "pnum"];
const JOBS = [
  { file: "Inter", text: LATIN, wght: [400, 800], keepFeatures: [...LATIN_FEATURES, "cv02", "cv03", "cv04", "ss01"] },
  { file: "CormorantGaramond", text: LATIN, wght: [500, 700], keepFeatures: LATIN_FEATURES },
  { file: "FrankRuhlLibre", text: LATIN + HEBREW, wght: [500, 900] },
  { file: "Assistant", text: LATIN + HEBREW, wght: [400, 800] },
  { file: "Heebo", text: LATIN + HEBREW, wght: [400, 700] },
];

for (const j of JOBS) {
  const path = `fonts/${j.file}.woff2`;
  const before = readFileSync(path);
  const out = await subsetFont(before, j.text, {
    targetFormat: "woff2",
    keepFeatures: j.keepFeatures,
    variationAxes: { wght: { min: j.wght[0], max: j.wght[1] }, ...(j.pin || {}) },
  });
  writeFileSync(path, out);
  console.log(`${j.file}: ${Math.round(before.length / 1024)} KB -> ${Math.round(out.length / 1024)} KB  (wght ${j.wght.join("-")})`);
}
