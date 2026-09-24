// The template library: every template is valid, JSON-shaped, immutable at
// its version, and renders a full fill from a bare profile.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { CANVAS, CATEGORY_LABELS, templateId, validateTemplate } from './lib/design/contract.ts';
import { TEMPLATES, CREAM_DEFS, getTemplate, latestTemplates, galleryTemplates, storySibling } from './lib/design/templates/index.ts';
import { creamTemplate } from './lib/design/templates/cream.ts';
import { HOLIDAYS } from './lib/design/holidays.ts';
import { fillTemplate, colorsFor } from './lib/design/mapBranding.ts';
import { applyOverrides, sanitizeOverrides, sanitizeValues, sanitizeImages } from './lib/design/design.ts';

// ── Library shape ────────────────────────────────────────────────────────────
assert.equal(CREAM_DEFS.length, 50, 'the launch library: 20 evergreen, 15 holidays and seasons, 15 closers');
assert.deepEqual(CREAM_DEFS.reduce((acc, d) => ({ ...acc, [d.group]: (acc[d.group] || 0) + 1 }), {} as Record<string, number>), { evergreen: 20, seasonal: 15, closer: 15 });
const built = CREAM_DEFS.reduce((n, d) => n + (d.formats || ['feed45', 'story']).length, 0);
assert.equal(TEMPLATES.length, built, 'every format of every studio definition, nothing else');
assert.equal(new Set(TEMPLATES.map(templateId)).size, TEMPLATES.length, 'no two templates share key@version');
assert.equal(CREAM_DEFS.filter((d) => d.holiday).length, 14, 'every holiday and season has a window; birthday has none');
for (const d of CREAM_DEFS) if (d.holiday) assert.ok(HOLIDAYS.some((h) => h.key === d.holiday), `${d.slug}: known occasion ${d.holiday}`);
assert.ok(CREAM_DEFS.filter((d) => d.deco).length >= 20 && CREAM_DEFS.filter((d) => !d.deco).length >= 20, 'decoration only where the theme asks: many with, many without');
assert.ok(new Set(CREAM_DEFS.map((d) => d.layout.family)).size >= 7, 'real variety: at least seven layout families in use');

// ── The studio look, as the builder guarantees it ───────────────────────────
for (const def of CREAM_DEFS) {
  for (const t of (def.formats || ['feed45', 'story']).map((f) => creamTemplate(def, f))) {
    const ids = new Set(t.layers.map((l) => l.id));
    for (const id of ['strip', 'logo', 'contact', 'grain']) assert.ok(ids.has(id), `${templateId(t)} has the ${id} layer`);
    assert.ok(t.variables.some((v) => v.source === 'contact'), 'her phone and handle in the strip');
    const headline = t.layers.find((l) => l.id === 'headline' || l.id === 'review_text');
    assert.ok(headline && headline.type === 'text' && headline.font === 'display', 'a display headline');
    if (headline && headline.type === 'text' && headline.id === 'headline' && (headline.maxLines || 0) > 1) {
      const boxPx = (headline.box.h / 100) * CANVAS[t.format].h;
      assert.ok(boxPx + 1 >= (headline.maxLines || 1) * headline.size * (headline.lineHeight || 1.2), `${templateId(t)}: the headline box holds every line it allows`);
    }
    const fam = def.layout.family;
    const stacked = (fam === 'top' && def.layout.textPos !== 'above') || fam === 'frame' || fam === 'collage' || fam === 'pair';
    const photos = t.layers.filter((l) => l.type === 'image');
    if (stacked) for (const p of photos) for (const l of t.layers) if (l.type === 'text' && !/^label_/.test(l.id)) assert.ok(l.box.y >= p.box.y + p.box.h - 0.01, `${templateId(t)}: text ${l.id} never crowds the photo`);
    if (fam === 'overlay' || fam === 'magazine') assert.ok(photos.some((p) => p.box.w === 100 && p.box.h === 100), 'a full-bleed photo');
    if (fam === 'split') assert.ok(t.layers.some((l) => l.id === 'block' && l.type === 'shape'), 'a colour block');
    if (fam === 'collage') assert.equal(photos.length, def.layout.count || 3, 'a grid of photos');
    if (fam === 'frame') assert.ok(t.layers.some((l) => l.id === 'frame'), 'a border around the photo');
    if (fam === 'text') assert.ok(t.layers.find((l) => l.id === 'headline' && l.type === 'text' && l.size >= 100), 'a big statement');
    if (def.price) { const price = t.layers.find((l) => l.id === 'price'); assert.ok(price && price.type === 'text' && price.size >= 120 && price.weight === 900, 'a large price'); }
    if (!def.deco) assert.ok(!t.layers.some((l) => l.type === 'deco'), 'no decoration unless the theme asks');
    else if (t.layers.some((l) => l.type === 'deco')) assert.ok(t.layers.some((l) => l.type === 'deco' && l.asset === def.deco!.asset), 'the decoration the theme asks for');
  }
}
assert.equal(getTemplate('offer-feed')!.version, 2);
assert.equal(getTemplate('offer-story')!.format, 'story');
assert.equal(getTemplate('rosh-hashana-feed')!.holiday, 'rosh_hashana');
assert.equal(getTemplate('gift-card-story')!.layers.find((l) => l.id === 'photo')!.type, 'image');
assert.ok(getTemplate('review-feed', 2)!.layers.some((l) => l.type === 'rating'), 'stars are shapes, not glyphs');
assert.equal(storySibling('offer-feed')!.key, 'offer-story');
assert.equal(storySibling('glow-story-story'), null, 'a story-only key has no story sibling of its own');
assert.ok(!galleryTemplates().some((t) => /-story$/.test(t.key) && t.key !== 'glow-story-story'), 'the gallery folds stories into their feed card; the story-only one stands alone');
assert.equal(galleryTemplates().length, 50, 'one card per definition');
assert.ok(galleryTemplates().every((t) => t.group), 'the v1 generation is not offered any more');
assert.equal(galleryTemplates(null, 'seasonal').length, 15);
assert.equal(galleryTemplates('offer', 'closer').length, 3, 'duo, gift card, referral');
for (const t of TEMPLATES) {
  assert.deepEqual(validateTemplate(t), [], `${templateId(t)} is valid`);
  assert.deepEqual(JSON.parse(JSON.stringify(t)), t, `${templateId(t)} is plain JSON`);
  assert.ok(CANVAS[t.format], 'known format');
  assert.ok(t.layers.some((l) => l.type === 'logo'), `${t.key} has a logo layer`);
  assert.ok(t.layers.some((l) => l.type === 'text' && /cta/.test(l.bind)), `${t.key} has a CTA`);
}
assert.equal(getTemplate('offer-feed')?.version, 2, 'latest wins when no version is asked for');
assert.equal(getTemplate('offer-feed', 1), null, 'the first generation is gone');
assert.equal(getTemplate('offer-feed', 99), null);
assert.equal(galleryTemplates('offer').length, 6, 'offer, package, new client, duo, gift card, referral');

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
assert.notEqual(gold.surface.toUpperCase(), '#FFFFFF', 'never white');
assert.match(gold.blush, /^#[0-9A-Fa-f]{6}$/); assert.match(gold.sand, /^#[0-9A-Fa-f]{6}$/);
assert.notEqual(colorsFor('#4A2E5A').blush, gold.blush, 'the blush takes her hue');
// The strip's contact line: phone and handle, whichever she has, from any way she typed the handle.
const strip = (settings: Record<string, unknown>) => fillTemplate(getTemplate('offer-feed')!, { settings }).values.contact;
assert.equal(strip({ business_phone: '052-1234567', branding: { instagram: 'https://www.instagram.com/maya.skin/' } }), '052-1234567   ·   @maya.skin');
assert.equal(strip({ business_phone: '052-1234567', branding: {} }), '052-1234567');
assert.equal(strip({ branding: { instagram: '@maya.skin' } }), '@maya.skin');
assert.equal(strip({ branding: { instagram: 'not a handle!' } }), '', 'garbage is not a handle');
// Per-design brand toggles: hide the phone, the handle or the logo on this design only.
const both = { business_phone: '052-1234567', branding: { instagram: 'maya.skin', logo_url: 'https://cdn/logo.png' } };
const withBrand = (brand: Record<string, boolean>) => fillTemplate(getTemplate('offer-feed')!, { settings: both, brand });
assert.equal(withBrand({ phone: false }).values.contact, '@maya.skin');
assert.equal(withBrand({ instagram: false }).values.contact, '052-1234567');
assert.equal(withBrand({ phone: false, instagram: false }).values.contact, '');
assert.equal(withBrand({ logo: false }).logoUrl, null, 'logo off -> the layer falls back to her name');
assert.equal(withBrand({}).logoUrl, 'https://cdn/logo.png', 'absent = on');
assert.deepEqual(sanitizeOverrides({ brand: { logo: false, phone: 'no', instagram: true, other: false } }), { brand: { logo: false, instagram: true } });
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
const quiet = fillTemplate(getTemplate('yom-kippur-feed')!, { settings: { therapist_name: 'מאיה', branding: {} } });
assert.deepEqual(quiet.missing, [], 'a text-first template with no photo needs nothing');

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
assert.notEqual(getTemplate('offer-feed')!.layers.find((l) => l.id === 'headline')!.box.y, 60, 'the template itself is untouched');

assert.deepEqual(sanitizeValues(getTemplate('offer-feed')!, { headline: ' x\u0000y ', unknown: 'z', price: 1 }), { headline: 'xy' });
assert.deepEqual(sanitizeImages(getTemplate('offer-feed')!, { photo: 'https://cdn/a.jpg', other: 'https://x' }), { photo: 'https://cdn/a.jpg' });
assert.deepEqual(sanitizeImages(getTemplate('offer-feed')!, { photo: 'javascript:alert(1)' }), {});
assert.deepEqual(sanitizeImages(getTemplate('offer-feed')!, { photo: null }), { photo: null });
// Client photos travel as private references, resolved to signed URLs only at view time.
const ref = 'private:8d4c2b3a-1111-4222-8333-444455556666/clients/abc/before_1.jpg';
assert.deepEqual(sanitizeImages(getTemplate('before-after-feed')!, { before: ref, after: 'private:../etc/passwd' }), { before: ref });
assert.deepEqual(sanitizeOverrides({ consent: { before: true, after: 'yes', 'bad id!': true } }), { consent: { before: true } });

console.log('design templates: ok');
