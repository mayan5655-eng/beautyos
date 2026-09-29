// scripts/generate-template-seed-images.ts
//
// One real photo per template, from the SAME aiHint already written into
// its own photo slot (lib/design/templates/cream/*.ts - see the compiler's
// `photoSlot()` helper) for the paid on-demand AI fill. This is the first
// time that hint drives a pre-generated, committed, FREE static image -
// used by lib/design/templateSeedImages.ts as fillTemplate's last resort
// when a design (or the gallery preview, before she has any content of her
// own) has nothing else to put in a photo slot. See that file's own header
// for the "never satisfies a required slot" guarantee.
//
//   node --experimental-strip-types --env-file=.env.local scripts/generate-template-seed-images.ts
//   ... generate-template-seed-images.ts offer nail-french   # only these
//   ... generate-template-seed-images.ts --force             # regenerate existing
//
// Needs OPENAI_API_KEY. One image each, 'high' quality, 'square' format -
// same as most of lib/defaultImages.js's set, since these fill a photo SLOT
// within a template, not a full-canvas background like hero/about.
//
// One file per CONCEPT, not per template row: 'offer-feed' and 'offer-story'
// share one file (see templateSeedImageUrl), and a multi-slot template
// (a collage) reuses its own one file across its own slots - every slot on a
// given template already carries the IDENTICAL aiHint in the source, so
// three separately-generated photos from the same three-word-identical
// prompt would not have been three more DISTINCT images, only three more
// dollars. Cross-template variety is the actual ask; within-one-template
// slot variety was never really available from this source data.
//
// Consent-gated slots (before/after, a real client photo) are never in this
// list - a seed image there would be exactly the "invented result" this
// project has already refused once (see generate-default-images.ts's own
// note on why before/after has no default).

import fs from 'node:fs';
import path from 'node:path';
import { generateImage } from '../lib/ai/openaiImages.ts';
import { HARD_CONSTRAINTS } from '../lib/ai/imagePrompt.ts';
import { STYLE } from './imageStyle.ts';
import { TEMPLATES } from '../lib/design/templates/index.ts';

const stem = (templateKey: string) => templateKey.replace(/-(feed|story)$/, '');

type Spec = { stem: string; hint: string };

const feed = TEMPLATES.filter((t) => t.format !== 'story');
const withPhoto = feed.filter((t) => t.slots.some((s) => !s.consent));

const missingHint = withPhoto.filter((t) => !t.slots.find((s) => !s.consent)?.aiHint);
if (missingHint.length) {
  console.error(`ABORT: ${missingHint.length} template(s) have a photo slot but no aiHint - add one in its CreamDef before generating:`);
  for (const t of missingHint) console.error(`  ${t.key}`);
  process.exit(1);
}

const SPECS: Spec[] = withPhoto.map((t) => ({
  stem: stem(t.key),
  hint: t.slots.find((s) => !s.consent)!.aiHint!,
}));

// One row per template, but the SAME stem can appear twice if a future
// template deliberately shares a concept - de-duplicate by stem so the
// count below (and the spend) reflects real distinct files, not rows.
const byStem = new Map<string, string>();
for (const s of SPECS) if (!byStem.has(s.stem)) byStem.set(s.stem, s.hint);

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));
const outDir = path.resolve(process.cwd(), 'public', 'defaults', 'seed');
fs.mkdirSync(outDir, { recursive: true });

console.log(`${byStem.size} distinct template seed images (${withPhoto.length} template rows, feed+story share one file, some concepts collapse to the same stem).`);

const sharp = (await import('sharp')).default;

let failed = 0;
for (const [key, hint] of byStem) {
  if (only.length && !only.includes(key)) continue;
  const file = path.join(outDir, `${key}.jpg`);
  if (fs.existsSync(file) && !force) { console.log(`skip ${key} (exists)`); continue; }
  try {
    const img = await generateImage({
      prompt: `${STYLE}${hint} ${HARD_CONSTRAINTS}`,
      format: 'square',
      tenantId: null,
      callSite: 'design/template-seed-images',
    });
    await sharp(img.png).resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toFile(file);
    console.log(`ok   ${key}  ${(fs.statSync(file).size / 1024).toFixed(0)} KB  ${img.ms} ms`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${key}: ${(e as Error).message}`);
  }
}
process.exit(failed ? 1 : 0);
