// A template's seed image is either a file that exists, or nothing - never a URL that 404s.
//
// 2026-10-06: opening the templates gallery fired 15 requests for /defaults/seed/*.jpg that returned 404
// and showed broken-image icons on the reel cards. templateSeedImageUrl() built a URL for every template;
// the generator only ever made images for feed templates, so every reel scene and one story-only template
// pointed at a file nobody had made. The old test checked only the feed templates, which is how it
// stayed green. This one walks EVERYTHING the app can ask a seed for.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TEMPLATES } from './lib/design/templates/index.ts';
import { REELS } from './lib/design/reels/index.ts';
import { templateSeedImageUrl } from './lib/design/templateSeedImages.ts';
import { SEED_STEMS } from './lib/design/templateSeedManifest.ts';
import { fillTemplate } from './lib/design/mapBranding.ts';

const dir = 'public/defaults/seed';
const onDisk = fs.readdirSync(dir).filter((f) => f.endsWith('.jpg')).map((f) => f.replace(/\.jpg$/, '')).sort();

// ── the manifest is the truth about the directory ─────────────────────────────────────────
assert.deepEqual([...SEED_STEMS].sort(), onDisk, 'lib/design/templateSeedManifest.ts matches public/defaults/seed - run `node scripts/seed-manifest.mjs` after adding or removing an image');

// ── every template and every reel scene the app can render ────────────────────────────────
const reelFrames = REELS.flatMap((r) => r.scenes.map((s) => s.frame));
const everything = [...TEMPLATES, ...reelFrames];
assert.ok(everything.length > 150, `walked ${everything.length} templates and reel scenes`);

let withFile = 0, without = 0;
for (const t of everything) {
  const url = templateSeedImageUrl(t.key);
  if (url === null) { without++; continue; }
  withFile++;
  assert.ok(fs.existsSync(`public${url}`), `${t.key}: seed URL ${url} must point at a file that exists (it 404'd for 15 templates on 2026-10-06)`);
}
assert.ok(withFile > 80, `most templates do have a seed (${withFile})`);
assert.ok(without > 0, `and the ones that do not get null, not a URL (${without} today)`);

// ── specific cases from the day it broke ──────────────────────────────────────────────────
assert.equal(templateSeedImageUrl('offer-feed'), '/defaults/seed/offer.jpg', 'a template with a seed gets its URL');
assert.equal(templateSeedImageUrl('offer-story'), '/defaults/seed/offer.jpg', 'feed and story share one file');
assert.equal(templateSeedImageUrl('steps-reel-s1'), null, 'a reel scene with no generated image gets null');
assert.equal(templateSeedImageUrl('no-such-template-feed'), null);

// ── and it reaches the screen as nothing, not as a broken <img> ───────────────────────────
const scene = reelFrames.find((f) => templateSeedImageUrl(f.key) === null && f.slots.some((s) => !s.consent));
assert.ok(scene, 'there is a reel scene without a seed to test against');
const filled = fillTemplate(scene!, { settings: { business_name: 'סטודיו' } });
for (const slot of scene!.slots.filter((s) => !s.consent)) {
  assert.equal(filled.seedImages[slot.key], null, `${scene!.key}/${slot.key}: no seed -> null in the fill, so the preview draws its placeholder`);
}

// ── the generator now covers what it used to skip (it is not run here: it spends money) ───
const gen = fs.readFileSync('scripts/generate-template-seed-images.ts', 'utf8');
assert.ok(gen.includes('reelFrames') && gen.includes('storyOnly'), 'the generator includes reel scene frames and story-only templates');
assert.ok(gen.includes('writeSeedManifest()'), 'and refreshes the manifest when it finishes');

console.log('seed manifest: ok');
