// Verifies, by code (not by eye), that the 87 template seed images
// (scripts/generate-template-seed-images.ts) never crossed fields.
//
// First attempt at this test checked for the literal CLINIC_LIGHT /
// STUDIO_LIGHT constant substrings - wrong, and caught immediately: several
// cosmetics hints (review, self-care, summer, autumn, winter, spring,
// bridal, night, gift-card) are hand-authored standalone text that never
// interpolates either shared constant at all. Exact-substring matching
// against a constant is not a valid proxy for "which field's style was
// used" here. What IS checkable by code: does the hint's own VOCABULARY
// ever cross into the other field's exclusive terms.
//
//   1. no cosmetics template's prompt contains a nails-exclusive word
//      (manicure, nail(s), cuticle, polish, chrome/ombre nail finish,
//      pedicure) and no nails template's prompt contains a
//      cosmetics-exclusive word (facial, skincare, clinic, serum, peel,
//      pigment, anti-aging, dermapen, microneedling, cleansing,
//      moisturiser) - reading the SAME aiHint the generation script read
//   2. no two DIFFERENT stems produced the byte-identical file
//
// What this does NOT and CANNOT prove: that the picture's actual PIXELS
// show the right subject - an image model can drift from its prompt, and
// that needs eye review (the gallery: https://claude.ai/artifact/TTb4aKMPgSEihJvC1r51hL),
// not code. This checks the input side of the pipeline exhaustively.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { TEMPLATES } from './lib/design/templates/index.ts';

const NAILS_WORDS = /\b(manicures?|nails?|cuticle|polish|pedicure|chrome[- ]?(or|nail)|ombre)\b/i;
const COSMETICS_WORDS = /\b(facials?|skincare|clinic(al)?|serums?|peels?|pigment(ation)?|anti-?aging|dermapen|microneedling|cleansing|moisturis|mask\b)\b/i;

const feed = TEMPLATES.filter((t) => t.format !== 'story');
const withPhoto = feed.filter((t) => t.slots.some((s) => !s.consent));
assert.equal(withPhoto.length, 87, 'same 87 the generation script and test-design-templates.ts already pin');

const stem = (k: string) => k.replace(/-(feed|story)$/, '');
const rows = withPhoto.map((t) => ({
  stem: stem(t.key),
  field: t.fields.join('+'),
  hint: t.slots.find((s) => !s.consent)!.aiHint!,
}));

let cosmeticsChecked = 0, nailsChecked = 0, dualChecked = 0;
for (const r of rows) {
  if (r.field === 'cosmetics') {
    assert.ok(!NAILS_WORDS.test(r.hint), `${r.stem}: CROSSOVER - a cosmetics template's prompt uses nails vocabulary: "${r.hint}"`);
    cosmeticsChecked++;
  } else if (r.field === 'nails') {
    assert.ok(!COSMETICS_WORDS.test(r.hint), `${r.stem}: CROSSOVER - a nails template's prompt uses cosmetics vocabulary: "${r.hint}"`);
    nailsChecked++;
  } else if (r.field === 'cosmetics+nails') {
    assert.ok(!NAILS_WORDS.test(r.hint) && !COSMETICS_WORDS.test(r.hint), `${r.stem}: a dual-field template's prompt must use neither field's exclusive vocabulary - got: "${r.hint}"`);
    dualChecked++;
  } else {
    assert.fail(`${r.stem}: unrecognised field combination "${r.field}"`);
  }
}
assert.equal(cosmeticsChecked, 45, 'cosmetics rows checked');
assert.equal(nailsChecked, 40, 'nails rows checked');
assert.equal(dualChecked, 2, 'dual-field rows checked');

// ── The shared STYLE prefix every generation gets (scripts/imageStyle.ts):
// applied identically to every field (deliberately - the user asked to keep
// the two sets visually consistent), so checked once, not per-row. This IS
// a real finding, distinct from a per-template crossover: every one of the
// 40 nails prompts opens with the literal word "clinic", from a shared
// prefix, not from its own aiHint. Not a bug in the sense of "the wrong
// subject was generated" - the per-template aiHint after it always says
// "a clean manicure table", never a clinic - but it is the actual opening
// line the report should surface, not silently pass over.
const styleText = fs.readFileSync('scripts/imageStyle.ts', 'utf8');
const clinicInStyle = /\bclinic\b/i.test(styleText);
console.log(clinicInStyle
  ? '⚠ scripts/imageStyle.ts\'s shared STYLE prefix contains "clinic" - the literal opening words of all 87 prompts, all 40 nails ones included. Each nails aiHint still correctly says "a clean manicure table" right after it, so this is a wording choice, not a proven crossover - but it is real and worth a second look.'
  : 'shared STYLE prefix: no cosmetics-leaning wording found');

// ── No two stems produced the byte-identical file ───────────────────────────
const hashes = new Map<string, string[]>();
for (const r of rows) {
  const file = `public/defaults/seed/${r.stem}.jpg`;
  assert.ok(fs.existsSync(file), `${file} exists`);
  const hash = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const list = hashes.get(hash) || [];
  list.push(r.stem);
  hashes.set(hash, list);
}
for (const [hash, stems] of hashes) {
  assert.equal(stems.length, 1, `hash ${hash.slice(0, 12)} is shared by more than one stem: ${stems.join(', ')} - two templates produced the identical file`);
}
assert.equal(hashes.size, rows.length, 'every one of the 87 files is byte-distinct from every other');

console.log(`seed image field separation: ok - ${cosmeticsChecked} cosmetics, ${nailsChecked} nails, ${dualChecked} dual, no vocabulary crossover, all ${hashes.size} files distinct`);
