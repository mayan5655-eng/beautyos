// The template library: every template is valid, JSON-shaped, immutable at
// its version, and renders a full fill from a bare profile.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { CANVAS, CATEGORY_LABELS, templateId, validateTemplate } from './lib/design/contract.ts';
import { TEMPLATES, getTemplate, latestTemplates } from './lib/design/templates/index.ts';
import { fillTemplate, colorsFor } from './lib/design/mapBranding.ts';
import { applyOverrides, sanitizeOverrides, sanitizeValues, sanitizeImages } from './lib/design/design.ts';

// ── Library shape ────────────────────────────────────────────────────────────
assert.equal(TEMPLATES.length, 6, 'six launch templates');
const cats = new Set(TEMPLATES.map((t) => t.category));
for (const c of Object.keys(CATEGORY_LABELS)) assert.ok(cats.has(c as never), `a template for ${c}`);
for (const t of TEMPLATES) {
  assert.deepEqual(validateTemplate(t), [], `${templateId(t)} is valid`);
  assert.deepEqual(JSON.parse(JSON.stringify(t)), t, `${templateId(t)} is plain JSON`);
  assert.ok(CANVAS[t.format], 'known format');
  assert.ok(t.layers.some((l) => l.type === 'logo'), `${t.key} has a logo layer`);
  assert.ok(t.layers.some((l) => l.type === 'text' && /cta/.test(l.bind)), `${t.key} has a CTA`);
}
assert.equal(getTemplate('offer-feed')?.version, 1);
assert.equal(getTemplate('offer-feed', 99), null);
assert.equal(latestTemplates('offer').length, 1);

// ── Immutability: hashes match the lock file ────────────────────────────────
const deep = (v: unknown): unknown => (Array.isArray(v) ? v.map(deep) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, deep((v as Record<string, unknown>)[k])])) : v);
const hash = (t: unknown) => createHash('sha256').update(JSON.stringify(deep(t))).digest('hex').slice(0, 16);
const lock = JSON.parse(fs.readFileSync('lib/design/templates/templates.lock.json', 'utf8')) as Record<string, string>;
for (const t of TEMPLATES) {
  assert.equal(lock[templateId(t)], hash(t), `${templateId(t)} unchanged since it was locked (bump the version, then run scripts/design-templates-lock.mjs)`);
}

// ── Branding onto roles ─────────────────────────────────────────────────────
const gold = colorsFor('#C9A24B');
assert.equal(gold.primary, '#C9A24B');
assert.equal(gold.contrast, '#2A2233', 'dark text on gold');
assert.equal(colorsFor('#4A2E5A').contrast, '#FFFFFF', 'white text on plum');
assert.equal(colorsFor('not a colour').primary, '#5B3E67', 'malformed -> default');

const bare = fillTemplate(getTemplate('offer-feed')!, { settings: { business_name: 'הקליניקה של מאיה', primary_color: '#C9A24B', branding: {} } });
assert.equal(bare.values.business_name, 'הקליניקה של מאיה');
assert.equal(bare.values.headline, 'טיפול פנים קלאסי', 'default headline when nothing typed');
assert.equal(bare.images.photo, null, 'no picture -> null, the renderer draws a plate');
assert.deepEqual(bare.missing, ['slot:photo'], 'the required picture is reported missing');
assert.equal(bare.logoUrl, null);

const full = fillTemplate(getTemplate('offer-feed')!, {
  settings: { business_name: 'x', primary_color: '#C9A24B', branding: { logo_url: 'https://cdn/logo.png', gallery: ['https://cdn/g1.jpg', 'https://cdn/g2.jpg'] } },
  inputs: { headline: '  טיפול פנים קלאסי  ', price: '₪249' },
});
assert.equal(full.images.photo, 'https://cdn/g1.jpg', 'first gallery photo fills the slot');
assert.equal(full.logoUrl, 'https://cdn/logo.png');
assert.deepEqual(full.missing, []);
assert.equal(full.values.headline, 'טיפול פנים קלאסי', 'typed values are trimmed');

const longName = fillTemplate(getTemplate('offer-feed')!, { settings: { business_name: 'א'.repeat(80), primary_color: null, branding: {} } });
assert.equal(longName.values.business_name.length, 40, 'capped at the template maxLength');

// Client photos never auto-fill, even when something is in the gallery.
const ba = fillTemplate(getTemplate('before-after-feed')!, { settings: { branding: { gallery: ['https://cdn/g1.jpg'] } } });
assert.equal(ba.images.before, null);
assert.deepEqual(ba.missing, ['slot:before', 'slot:after']);

// A review flows from her saved reviews.
const rv = fillTemplate(getTemplate('review-feed')!, { settings: { business_name: 'x', branding: { reviews: [{ name: 'דנה', rating: 4, text: 'מדהים' }] } } });
assert.equal(rv.values.review_text, 'מדהים');
assert.equal(rv.values.stars, '★★★★☆');
assert.equal(rv.values.review_name, 'דנה');

// The tip needs nothing at all.
const tip = fillTemplate(getTemplate('tip-feed')!, { settings: { therapist_name: 'מאיה', branding: {} } });
assert.deepEqual(tip.missing, []);
assert.equal(tip.values.therapist_title, 'קוסמטיקאית', 'default title');

// ── Her edits: sanitised and merged over the template ───────────────────────
const ov = sanitizeOverrides({
  layers: { headline: { box: { x: 5, y: 60, w: 90, h: 10 }, size: 90, color: 'primary', hidden: false, junk: 1 }, nope: { size: 5000 }, 'bad id!': { size: 40 } },
  colors: { primary: '#112233', ink: 'red', bogus: '#000000' },
  order: ['cta', 'headline', 'cta', 42],
});
assert.deepEqual(ov, { layers: { headline: { box: { x: 5, y: 60, w: 90, h: 10 }, size: 90, color: 'primary', hidden: false } }, colors: { primary: '#112233' }, order: ['cta', 'headline'] });
const layers = applyOverrides(getTemplate('offer-feed')!, sanitizeOverrides({ ...ov, layers: { ...ov.layers, subline: { hidden: true } } }));
assert.ok(!layers.some((l) => l.id === 'subline'), 'hidden layer is gone');
assert.equal(layers[0].id, 'cta', 'her order wins');
const h = layers.find((l) => l.id === 'headline');
assert.ok(h && h.type === 'text' && h.size === 90 && h.box.y === 60);
assert.equal(getTemplate('offer-feed')!.layers.find((l) => l.id === 'headline')!.box.y, 62, 'the template itself is untouched');

assert.deepEqual(sanitizeValues(getTemplate('offer-feed')!, { headline: ' x\u0000y ', unknown: 'z', price: 1 }), { headline: 'xy' });
assert.deepEqual(sanitizeImages(getTemplate('offer-feed')!, { photo: 'https://cdn/a.jpg', other: 'https://x' }), { photo: 'https://cdn/a.jpg' });
assert.deepEqual(sanitizeImages(getTemplate('offer-feed')!, { photo: 'javascript:alert(1)' }), {});
assert.deepEqual(sanitizeImages(getTemplate('offer-feed')!, { photo: null }), { photo: null });

console.log('design templates: ok');
