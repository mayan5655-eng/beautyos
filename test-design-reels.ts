// Reel templates: a wrapper of story frames, valid, immutable, filled through the same pipeline.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { REELS, getReel, latestReels } from './lib/design/reels/index.ts';
import { validateReel, reelId, fillReel, reelSurface, isReel } from './lib/design/reel.ts';
import { TEMPLATES } from './lib/design/templates/index.ts';
import { sanitizeValues, sanitizeImages, sanitizeCopy } from './lib/design/design.ts';

assert.equal(REELS.length, 16, 'the cosmetics launch set (8) plus a comparable nails set (8) — see lib/design/reels/nails.ts');
const keys = REELS.map((r) => r.key);
assert.deepEqual(keys, [
  'reveal-reel', 'steps-reel', 'countdown-reel', 'holiday-reel', 'testimonial-reel', 'product-reel', 'day-reel', 'tip-reel',
  'nail-reveal-reel', 'nail-process-reel', 'nail-menu-scroll-reel', 'nail-before-after-wipe-reel', 'nail-colour-swatch-reel', 'nail-closeup-reel', 'nail-testimonial-reel', 'nail-countdown-reel',
]);
for (const r of REELS) {
  assert.deepEqual(validateReel(r), [], `${reelId(r)} is valid`);
  assert.deepEqual(JSON.parse(JSON.stringify(r)), r, `${reelId(r)} is plain JSON`);
  // 2 to 6: validateReel's own real constraint. The original 8-reel launch
  // set happened to land in 3-5 (nothing shorter or longer was needed yet);
  // nail-closeup-reel is a deliberate 2 — wide, then close, nothing more —
  // which is a real, valid reel, not an edge case to special-case around.
  assert.ok(r.scenes.length >= 2 && r.scenes.length <= 6, '2 to 6 scenes');
  assert.ok(r.scenes.reduce((n, s) => n + s.seconds, 0) <= 30, 'at most thirty seconds (validateReel\'s own cap)');
  for (const s of r.scenes) {
    assert.equal(s.frame.format, 'story');
    assert.ok(s.frame.layers.some((l) => l.id === 'strip') && s.frame.layers.some((l) => l.id === 'logo'), 'every scene carries her strip');
    assert.ok(!TEMPLATES.some((t) => t.key === s.frame.key), 'frames are private to the reel, not in the static gallery');
  }
  assert.ok(r.variables.every((v) => /^s\d+_/.test(v.key)) && r.slots.every((s) => /^s\d+_/.test(s.key)), 'namespaced surface');
}
assert.ok(new Set(REELS.flatMap((r) => r.scenes.map((s) => JSON.stringify(s.frame.layers.map((l) => l.id))))).size >= 8, 'scenes are not one layout');
assert.equal(isReel(getReel('tip-reel')), true);
assert.equal(getReel('tip-reel', 99), null);
assert.equal(latestReels('tip').length, 2, 'cosmetics tip-reel + nails colour-swatch-reel, both category tip');
assert.equal(latestReels(null, 'evergreen').length, 12, 'cosmetics 5 + nails 7 (only nail-countdown-reel is a closer)');

// ── business_fields: every reel is tagged, latestReels filters by it ───────
assert.deepEqual(getReel('reveal-reel')!.fields, ['cosmetics'], 'untouched: makeReel\'s default for a def with no fields set');
assert.deepEqual(getReel('nail-reveal-reel')!.fields, ['nails']);
assert.equal(latestReels(null, null, ['nails']).length, 8);
assert.equal(latestReels(null, null, ['cosmetics']).length, 8);
assert.equal(latestReels(null, null, ['cosmetics', 'nails']).length, 16, 'both fields: everything, same as no filter at all');
assert.equal(latestReels(null, null).length, 16, 'omitted: every field, same as before this parameter existed');

// Immutability: the same lock file as the statics.
const deep = (v: unknown): unknown => (Array.isArray(v) ? v.map(deep) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, deep((v as Record<string, unknown>)[k])])) : v);
const hash = (t: unknown) => createHash('sha256').update(JSON.stringify(deep(t))).digest('hex').slice(0, 16);
const lock = JSON.parse(fs.readFileSync('lib/design/templates/templates.lock.json', 'utf8')) as Record<string, string>;
for (const r of REELS) assert.equal(lock[reelId(r)], hash(r), `${reelId(r)} unchanged since it was locked`);

// The fill: one map in, one Fill per scene out, through fillTemplate.
const reveal = getReel('reveal-reel')!;
assert.deepEqual(reelSurface(reveal.scenes).slots.map((s) => s.key), ['s1_photo', 's2_photo']);
assert.ok(reveal.slots.every((s) => s.consent), 'client photos need consent, like the static pair');
const settings = { business_name: 'הקליניקה של מאיה', business_phone: '052-1234567', primary_color: '#C9A24B', branding: { instagram: 'maya.skin', logo_url: 'https://cdn/logo.png' } };
const f = fillReel(reveal, { settings, inputs: { s2_headline: 'אחרי טיפול אחד', s3_headline: 'x' }, images: { s1_photo: 'private:8d4c2b3a-1111-4222-8333-444455556666/clients/abc/b.jpg' }, brand: { logo: false } });
assert.equal(f.scenes.length, 3);
assert.equal(f.scenes[1].values.headline, 'אחרי טיפול אחד');
assert.equal(f.scenes[2].values.headline, 'x');
assert.equal(f.scenes[0].images.photo, 'private:8d4c2b3a-1111-4222-8333-444455556666/clients/abc/b.jpg');
assert.equal(f.scenes[1].images.photo, null, 'the after photo is still missing');
assert.deepEqual(f.missing, ['slot:s2_photo'], 'missing is reported in reel namespace');
assert.equal(f.scenes[0].logoUrl, null, 'brand toggles apply to every scene');
assert.equal(f.scenes[0].values.contact, '052-1234567   ·   @maya.skin');
assert.equal(f.totalSeconds, 8.5);

// The sanitisers take a reel as they take a template.
assert.deepEqual(sanitizeValues(reveal, { s1_headline: ' ככה ', headline: 'no', s9_x: 'no' }), { s1_headline: 'ככה' });
assert.deepEqual(sanitizeImages(reveal, { s1_photo: 'https://cdn/a.jpg', photo: 'https://cdn/b.jpg' }), { s1_photo: 'https://cdn/a.jpg' });
assert.deepEqual(sanitizeCopy({ text: '  פוסט ', hashtags: ['#עור', 'bad', '#עור', 3] }), { text: 'פוסט', hashtags: ['#עור'] });
assert.deepEqual(sanitizeCopy('junk'), {});

console.log('design reels: ok');
