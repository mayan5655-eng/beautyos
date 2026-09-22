// The vendor-neutral scene: pixels, hex, font files - and the way back.
import assert from 'node:assert/strict';
import { getTemplate } from './lib/design/templates/index.ts';
import { fillTemplate } from './lib/design/mapBranding.ts';
import { buildSceneSpec, pxBoxToPercent, boxChanged } from './lib/design/sceneSpec.ts';
import { CANVAS } from './lib/design/contract.ts';

const fonts = { display: '/design-fonts/FrankRuhlLibre.ttf', body: '/design-fonts/Assistant.ttf' };
const t = getTemplate('offer-feed')!;
const fill = fillTemplate(t, { settings: { business_name: 'הקליניקה של מאיה', primary_color: '#C9A24B', branding: { gallery: ['https://cdn/g1.jpg'] } }, inputs: { price: '₪249' } });

const spec = buildSceneSpec(t, fill, null, fonts);
assert.equal(spec.width, 1080); assert.equal(spec.height, 1350);
assert.equal(spec.background, '#FFFFFF');
const photo = spec.blocks.find((b) => b.id === 'photo');
assert.ok(photo && photo.kind === 'image' && photo.ref === 'https://cdn/g1.jpg' && photo.w === 1080 && photo.h === 1350, 'full-bleed photo in pixels');
assert.ok(photo && photo.kind === 'image' && photo.overlayColor && photo.overlayDirection === 'bottom');
const price = spec.blocks.find((b) => b.id === 'price');
assert.ok(price && price.kind === 'text' && price.text === '₪249' && price.pillColor === '#C9A24B' && price.color === '#2A2233', 'price pill in her gold with dark text');
assert.ok(price && price.kind === 'text' && price.fontFile === fonts.display && price.sizePx === 70);
assert.ok(price && Math.abs(price.x - 1080 * 0.62) < 0.2 && Math.abs(price.y - 1350 * 0.81) < 0.2, 'percent -> px');
const logo = spec.blocks.find((b) => b.id === 'logo');
assert.ok(logo && logo.kind === 'logo' && logo.ref === null && logo.fallbackText === 'הקליניקה של מאיה', 'no logo file -> her name');
assert.ok(!spec.blocks.some((b) => b.kind === 'text' && b.text === ''), 'empty text is not a block');

// Overrides land in the spec: a moved headline, a hidden subline, a swapped colour.
const spec2 = buildSceneSpec(t, fill, { layers: { headline: { box: { x: 10, y: 50, w: 80, h: 10 }, size: 90 }, subline: { hidden: true } }, colors: { primary: '#112233' } }, fonts);
const h = spec2.blocks.find((b) => b.id === 'headline');
assert.ok(h && h.kind === 'text' && h.sizePx === 90 && Math.abs(h.x - 108) < 0.2 && Math.abs(h.y - 675) < 0.2);
assert.ok(!spec2.blocks.some((b) => b.id === 'subline'));
const price2 = spec2.blocks.find((b) => b.id === 'price');
assert.ok(price2 && price2.kind === 'text' && price2.pillColor === '#112233');

// The way back: pixels to percent, clamped and rounded.
assert.deepEqual(pxBoxToPercent(CANVAS.feed45, { x: 108, y: 675, w: 864, h: 135 }), { x: 10, y: 50, w: 80, h: 10 });
assert.deepEqual(pxBoxToPercent(CANVAS.feed45, { x: -50, y: 1300, w: 2000, h: 200 }), { x: 0, y: 85.19, w: 100, h: 14.81 }, 'dragged off-canvas comes back inside');
assert.equal(boxChanged({ x: 10, y: 50, w: 80, h: 10 }, { x: 10.01, y: 50, w: 80, h: 10 }), false);
assert.equal(boxChanged({ x: 10, y: 50, w: 80, h: 10 }, { x: 12, y: 50, w: 80, h: 10 }), true);

console.log('design scene: ok');
