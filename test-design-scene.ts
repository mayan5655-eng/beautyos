// The vendor-neutral scene: pixels, hex, font files - and the way back.
import assert from 'node:assert/strict';
import { getTemplate } from './lib/design/templates/index.ts';
import { fillTemplate, colorsFor } from './lib/design/mapBranding.ts';
import { buildSceneSpec, pxBoxToPercent, boxChanged } from './lib/design/sceneSpec.ts';
import { CANVAS } from './lib/design/contract.ts';

const fonts = { display: '/design-fonts/FrankRuhlLibre.ttf', body: '/design-fonts/Assistant.ttf', accent: '/design-fonts/Heebo.ttf' };
const t = getTemplate('offer-feed')!;
const fill = fillTemplate(t, { settings: { business_name: 'הקליניקה של מאיה', primary_color: '#C9A24B', branding: { gallery: ['https://cdn/g1.jpg'] } }, inputs: { price: '₪249' } });
const gold = colorsFor('#C9A24B');

const spec = buildSceneSpec(t, fill, null, fonts);
assert.equal(spec.width, 1080); assert.equal(spec.height, 1350);
assert.equal(spec.background, gold.surface, 'the page is her cream');
assert.deepEqual(spec.plate, { from: gold.blush, to: gold.sand }, 'an empty slot shows the same plate in every renderer');
const photoLayer = t.layers.find((l) => l.id === 'photo')!;
const photo = spec.blocks.find((b) => b.id === 'photo');
assert.ok(photo && photo.kind === 'image' && photo.ref === 'https://cdn/g1.jpg', 'her gallery photo, in pixels');
assert.ok(photo && photo.kind === 'image' && Math.abs(photo.x - (photoLayer.box.x / 100) * 1080) < 0.2 && Math.abs(photo.w - (photoLayer.box.w / 100) * 1080) < 0.2, 'percent -> px');
assert.ok(photo && photo.kind === 'image' && photo.radius === 48 && photo.shape === 'rect', 'the rounded top block');
const price = spec.blocks.find((b) => b.id === 'price');
assert.ok(price && price.kind === 'text' && price.text === '₪249' && price.color === '#C9A24B' && price.pillColor === null, 'a large price in her accent, no pill');
assert.ok(price && price.kind === 'text' && price.fontFile === fonts.display && price.weight === 900 && price.sizePx >= 120);
const logo = spec.blocks.find((b) => b.id === 'logo');
assert.ok(logo && logo.kind === 'logo' && logo.ref === null && logo.fallbackText === 'הקליניקה של מאיה', 'no logo file -> her name');
assert.ok(!spec.blocks.some((b) => b.kind === 'text' && b.text === ''), 'empty text is not a block');
assert.ok(spec.blocks.some((b) => b.kind === 'texture'), 'grain over everything');

// Overrides land in the spec: a moved headline, a hidden subline, a swapped colour.
const spec2 = buildSceneSpec(t, fill, { layers: { headline: { box: { x: 10, y: 50, w: 80, h: 10 }, size: 90 }, subline: { hidden: true } }, colors: { primary: '#112233' } }, fonts);
const h = spec2.blocks.find((b) => b.id === 'headline');
assert.ok(h && h.kind === 'text' && h.sizePx === 90 && Math.abs(h.x - 108) < 0.2 && Math.abs(h.y - 675) < 0.2);
assert.ok(!spec2.blocks.some((b) => b.id === 'subline'));
const price2 = spec2.blocks.find((b) => b.id === 'price');
assert.ok(price2 && price2.kind === 'text' && price2.color === '#112233', 'her swapped accent reaches the price');

// The way back: pixels to percent, clamped and rounded.
assert.deepEqual(pxBoxToPercent(CANVAS.feed45, { x: 108, y: 675, w: 864, h: 135 }), { x: 10, y: 50, w: 80, h: 10 });
assert.deepEqual(pxBoxToPercent(CANVAS.feed45, { x: -50, y: 1300, w: 2000, h: 200 }), { x: 0, y: 85.19, w: 100, h: 14.81 }, 'dragged off-canvas comes back inside');
assert.equal(boxChanged({ x: 10, y: 50, w: 80, h: 10 }, { x: 10.01, y: 50, w: 80, h: 10 }), false);
assert.equal(boxChanged({ x: 10, y: 50, w: 80, h: 10 }, { x: 12, y: 50, w: 80, h: 10 }), true);

// The studio layers reach the spec: a decoration as a tinted file, a rating as a count.
const rh = getTemplate('rosh-hashana-feed')!;
const rhSpec = buildSceneSpec(rh, fillTemplate(rh, { settings: { primary_color: '#C9A24B', branding: {} } }), null, fonts);
const deco = rhSpec.blocks.find((b) => b.kind === 'deco');
assert.ok(deco && deco.kind === 'deco' && deco.ref === '/design-deco/pomegranate.svg' && deco.color === '#C9A24B');
const rv = getTemplate('review-feed')!;
const rvSpec = buildSceneSpec(rv, fillTemplate(rv, { settings: { branding: { reviews: [{ name: 'דנה', rating: 4, text: 'מדהים' }] } } }), null, fonts);
const rating = rvSpec.blocks.find((b) => b.kind === 'rating');
assert.ok(rating && rating.kind === 'rating' && rating.count === 4 && rating.total === 5, 'four of five stars');

console.log('design scene: ok');
