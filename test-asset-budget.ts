// test-asset-budget.ts
//
// Fails if any file in brand/ or public/ is over 200 KB, or if a brand mark is
// rendered through a bare <img> instead of app/BrandImage.tsx.
//
// Why: on 2026-10-04 a cold load of /dashboard on throttled mobile (Slow 4G,
// 4x CPU, 430px) took ~12 s to become usable and ~18 s to go quiet. 2 MB of the
// 3.4 MB page was images: two 1.3 MB flower PNGs behind marks drawn at 22-260
// px, 120-170 KB PNGs behind 19-60 px icons, a 350 KB wordmark drawn at
// 116-196 px. It was the first thing a new cosmetician experienced, and
// nothing in the build noticed - every one of those files was "just a PNG".
// Fonts hit the same trap (785 KB on first load); they live in fonts/, not
// public/, and were cut by scripts/subset-fonts.mjs.
//
// If this fails on a file you genuinely need:
//   1. Resize it to ~2x the largest size it is drawn at - see
//      scripts/optimize-brand-images.mjs for the recipe (palette PNG for
//      artwork with alpha, mozjpeg for opaque).
//   2. A true full-resolution master does not belong in the repo's brand/ or
//      public/ at all. Keep it outside the repo.
// Do NOT raise the limit to make this pass.

import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const LIMIT = 200 * 1024;
const VIDEO_LIMIT = 2 * 1024 * 1024;
const TUTORIAL_LIMIT = 8 * 1024 * 1024;
const ROOTS = ['brand', 'public'];

let passed = 0, failed = 0;
function ok(cond: unknown, label: string) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

let count = 0;
for (const root of ROOTS) {
  for (const file of walk(root)) {
    count++;
    const size = statSync(file).size;
    const norm = file.split('\\').join('/');
    // The one exception: demo clips under public/media/ are lazy-loaded (nothing fetches them before she presses
    // play), so they get their own 2 MB limit instead of the first-load image budget.
    if (/^public\/media\/[^/]+\.(mp4|webm)$/.test(norm)) {
      ok(size <= VIDEO_LIMIT, `${norm} is ${Math.round(size / 1024)} KB - over the ${VIDEO_LIMIT / 1024} KB video limit`);
      continue;
    }
    // The tutorial videos on /tutorials (the WhatsApp welcome link) are the same kind of lazy clip (preload="none"), but
    // a minute and a half each at phone size: 8 MB each, still well under WhatsApp's 16 MB if one is sent as a file.
    if (/^public\/tutorials\/[^/]+\.mp4$/.test(norm)) {
      ok(size <= TUTORIAL_LIMIT, `${norm} is ${Math.round(size / 1024)} KB - over the ${TUTORIAL_LIMIT / 1024} KB tutorial video limit`);
      continue;
    }
    ok(size <= LIMIT, `${file.replace(/\\/g, '/')} is ${Math.round(size / 1024)} KB - over the ${LIMIT / 1024} KB budget (see the header of test-asset-budget.ts)`);
  }
}
ok(count > 50, `walked brand/ and public/ and found files (${count}) - the walk itself is working`);

// Brand marks go through BrandImage so they are served as WebP at the width
// they are drawn at. A bare <img src={ICON_...}> serves the source file as-is.
const BRAND_SRC = /<img\b[^>]*\bsrc=\{(ICON_[A-Z]+|FLOWER_[A-Z0-9_]+|BANNER_[A-Z]+|LOGO_[A-Z]+)\}/;
function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) sources(p, out);
    else if (/\.(tsx|jsx)$/.test(name)) out.push(p);
  }
  return out;
}
for (const file of sources('app')) {
  const src = readFileSync(file, 'utf8');
  // multi-line tags: collapse whitespace inside each <img ...> before matching
  const tags = src.match(/<img\b[\s\S]*?\/>/g) ?? [];
  for (const tag of tags) {
    ok(!BRAND_SRC.test(tag.replace(/\s+/g, ' ')), `${file.replace(/\\/g, '/')}: brand mark rendered with a bare <img> - use app/BrandImage.tsx (${tag.replace(/\s+/g, ' ').slice(0, 90)}...)`);
  }
}

console.log(`asset budget: passed ${passed} failed ${failed}`);
if (failed > 0) process.exit(1);
