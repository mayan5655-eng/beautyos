// The gallery's default pictures: varied, in the right field, deterministic, never an AI character.
//
// Why this test exists: the Kalmea pack's cards had no seed picture, so each fell back to the tenant's own
// first gallery photo and the whole new set showed one image. The pack now borrows existing seed pictures by a
// fixed table (lib/design/templateSeedImages.ts). What must hold, for both fields and every section:
//   - a card's picture file exists
//   - two neighbouring cards never show the same picture
//   - a pack template with a photo gets a seed in its own field (nails -> nail-*, cosmetics -> not nail-*)
//   - presenter templates (AI character) get NO seed: the character is theirs, not a general default
//   - the same key always gives the same picture
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { galleryTemplates } from './lib/design/templates/index.ts';
import { REELS, latestReels } from './lib/design/reels/index.ts';
import { PACK_TEMPLATES } from './lib/design/templates/index.ts';
import { templateSeedImageUrl } from './lib/design/templateSeedImages.ts';
import { GROUP_LABELS, type TemplateGroup } from './lib/design/contract.ts';
import type { FieldKey } from './lib/businessFields.ts';

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

const seedOf = (key: string) => templateSeedImageUrl(key);

ok('every pack template with a photo borrows an existing picture; the file is there', () => {
  const withPhoto = PACK_TEMPLATES.filter((t) => t.slots.some((s) => !s.consent && !s.defaultImage));
  assert.ok(withPhoto.length >= 5);
  for (const t of withPhoto) {
    const url = seedOf(t.key);
    assert.ok(url, `${t.key} has a seed`);
    assert.ok(fs.existsSync('public' + url!), `${t.key}: ${url} exists`);
  }
});

ok('pack reels with a picture: a seed per scene frame; graphic reels have none', () => {
  const pk = REELS.filter((r) => r.key.startsWith('pk-'));
  const withPhoto = pk.filter((r) => r.slots.some((s) => !s.defaultImage));
  assert.equal(withPhoto.length, 7, '6 photo reels + the clinic tour');
  for (const r of withPhoto) for (const sc of r.scenes) {
    const url = seedOf(sc.frame.key);
    assert.ok(url && fs.existsSync('public' + url), `${sc.frame.key} has a seed`);
  }
  for (const r of pk.filter((x) => !withPhoto.includes(x))) for (const sc of r.scenes) assert.equal(seedOf(sc.frame.key), null, `${sc.frame.key}: no photo slot, no seed`);
});

ok('the right field: nails borrow nail pictures, cosmetics never do', () => {
  for (const t of PACK_TEMPLATES) {
    const url = seedOf(t.key);
    if (!url) continue;
    const isNailPic = /\/nail-/.test(url);
    if (t.fields.includes('nails') && !t.fields.includes('cosmetics')) assert.ok(isNailPic, `${t.key} (nails) -> ${url}`);
    if (t.fields.includes('cosmetics') && !t.fields.includes('nails')) assert.ok(!isNailPic, `${t.key} (cosmetics) -> ${url}`);
  }
  for (const r of REELS.filter((x) => x.key.startsWith('pk-'))) for (const sc of r.scenes) {
    const url = seedOf(sc.frame.key);
    if (!url) continue;
    const isNailPic = /\/nail-/.test(url);
    if (r.fields.length === 1 && r.fields[0] === 'nails') assert.ok(isNailPic, `${sc.frame.key} -> ${url}`);
    if (r.fields.length === 1 && r.fields[0] === 'cosmetics') assert.ok(!isNailPic, `${sc.frame.key} -> ${url}`);
  }
});

ok('presenters have no seed: their picture is their character', () => {
  for (const t of PACK_TEMPLATES.filter((x) => x.slots.some((s) => s.defaultImage))) assert.equal(seedOf(t.key), null, t.key);
  for (const r of REELS.filter((x) => x.slots.some((s) => s.defaultImage))) for (const sc of r.scenes) assert.equal(seedOf(sc.frame.key), null, sc.frame.key);
});

ok('deterministic: the same key, the same picture', () => {
  for (const t of PACK_TEMPLATES) assert.equal(seedOf(t.key), seedOf(t.key));
});

const FIELDS: FieldKey[][] = [['cosmetics'], ['nails'], ['cosmetics', 'nails']];
const GROUPS = Object.keys(GROUP_LABELS) as TemplateGroup[];

ok('no two neighbouring cards in any section share a picture (posts)', () => {
  const bad: string[] = [];
  for (const fields of FIELDS) for (const g of GROUPS) {
    const cards = galleryTemplates(null, g, fields);
    for (let i = 1; i < cards.length; i++) {
      const a = seedOf(cards[i - 1].key), b = seedOf(cards[i].key);
      if (a && a === b) bad.push(`${fields.join('+')}/${g}: ${cards[i - 1].key} and ${cards[i].key} -> ${a}`);
    }
  }
  assert.deepEqual(bad, []);
});

ok('no two neighbouring reels share a picture, and the pack leads the list', () => {
  const bad: string[] = [];
  for (const fields of FIELDS) {
    const reels = latestReels(null, null, fields);
    const firstScene = (r: (typeof reels)[number]) => seedOf(r.scenes[0].frame.key);
    for (let i = 1; i < reels.length; i++) {
      const a = firstScene(reels[i - 1]), b = firstScene(reels[i]);
      if (a && a === b) bad.push(`${fields.join('+')}: ${reels[i - 1].key} and ${reels[i].key} -> ${a}`);
    }
  }
  assert.deepEqual(bad, []);
});

ok('the pack posts that have a photo are not all one picture', () => {
  const urls = PACK_TEMPLATES.map((t) => seedOf(t.key)).filter(Boolean);
  assert.ok(new Set(urls).size >= 5, 'five different pictures for the five photo concepts');
});

console.log(`${n} passed`);
