// The AI-character rule: a presenter slot shows the bundled character until SHE picks a photo, per design.
//
//   - nothing picked          -> the character, origin 'ai_character'   (the label shows)
//   - her photo picked        -> her photo, origin 'own'                (the label is gone)
//   - her portrait / gallery  -> NOT swapped in silently: she chooses, and the character stays until she does
//   - a required slot with a character is never "missing"
//   - the same through a reel (slots namespaced sN_, one Fill per scene)
//   - the safe-zone check names a label that sits under Instagram's interface
import assert from 'node:assert/strict';
import { fillTemplate } from './lib/design/mapBranding.ts';
import { fillReel, makeReel, type ReelScene } from './lib/design/reel.ts';
import { buildSceneSpec } from './lib/design/sceneSpec.ts';
import { safeZoneViolations, reelSafeZoneViolations, REEL_SAFE } from './lib/design/safeZone.ts';
import type { Template, SlotDef, Layer } from './lib/design/contract.ts';

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

const CHAR = '/defaults/presenters/nail-presenter-1.jpg';
const presenter: SlotDef = { key: 'presenter', label: 'תמונה', sources: ['gallery', 'upload', 'portrait'], required: true, defaultImage: { src: CHAR, kind: 'ai_character' } };
const labelLayer: Layer = { id: 'ai-label', type: 'text', bind: 'ai_label', box: { x: 6, y: 14, w: 50, h: 3.5 }, font: 'accent', size: 28, color: 'ink', align: 'right', visibleWhen: { slot: 'presenter', origin: 'ai_character' } };
const frame: Template = {
  key: 'presenter-story', version: 1, category: 'announce', format: 'story', name: 'x', description: 'x',
  variables: [{ key: 'ai_label', label: 'x', kind: 'text', source: 'static', default: 'דמות AI להמחשה' }],
  slots: [presenter],
  layers: [
    { id: 'photo', type: 'image', slot: 'presenter', box: { x: 0, y: 0, w: 100, h: 100 }, fit: 'cover' },
    labelLayer,
  ],
  needs: [], fields: ['nails'],
};

ok('nothing picked: the character, and the label shows', () => {
  const f = fillTemplate(frame, { settings: { business_name: 'x' } });
  assert.equal(f.images.presenter, CHAR);
  assert.equal(f.imageOrigin.presenter, 'ai_character');
  assert.deepEqual(f.missing, []);
  const spec = buildSceneSpec(frame, f, null, { display: 'd', body: 'b', accent: 'a' });
  assert.ok(spec.blocks.some((b) => b.id === 'ai-label'));
});

ok('her own photo: it is used, and the label is gone', () => {
  const f = fillTemplate(frame, { settings: {}, images: { presenter: 'https://x.test/mine.jpg' } });
  assert.equal(f.images.presenter, 'https://x.test/mine.jpg');
  assert.equal(f.imageOrigin.presenter, 'own');
  const spec = buildSceneSpec(frame, f, null, { display: 'd', body: 'b', accent: 'a' });
  assert.ok(!spec.blocks.some((b) => b.id === 'ai-label'), 'label hidden automatically');
});

ok('her portrait and gallery are not silently swapped in over the character', () => {
  const f = fillTemplate(frame, { settings: { branding: { portrait_url: 'https://x.test/p.jpg', gallery: ['https://x.test/g.jpg'] } } });
  assert.equal(f.images.presenter, CHAR);
  assert.equal(f.imageOrigin.presenter, 'ai_character');
});

ok('through a reel: per-scene origin and the namespaced slot', () => {
  const scenes: ReelScene[] = [
    { id: 's1', seconds: 3, transition: 'cut', motion: 'kenburns', label: 'one', frame },
    { id: 's2', seconds: 3, transition: 'fade', motion: 'kenburns', label: 'two', frame: { ...frame, key: 'presenter-two-story' } },
  ];
  const reel = makeReel({ key: 'presenter-reel', version: 1, category: 'announce', group: 'evergreen', name: 'x', description: 'x', scenes, fields: ['nails'] });
  assert.ok(reel.slots.every((s) => s.defaultImage?.src === CHAR), 'the character travels with the slot');
  const none = fillReel(reel, { settings: {} });
  assert.deepEqual(none.scenes.map((s) => s.imageOrigin.presenter), ['ai_character', 'ai_character']);
  const mine = fillReel(reel, { settings: {}, images: { s1_presenter: 'https://x.test/mine.jpg' } });
  assert.deepEqual(mine.scenes.map((s) => s.imageOrigin.presenter), ['own', 'ai_character'], 'per scene, per design');
});

ok('safe zone: a label under the top interface band is named', () => {
  assert.deepEqual(safeZoneViolations(frame), [], 'y 14% of 1920 = 269 is inside');
  const high: Template = { ...frame, layers: [frame.layers[0], { ...labelLayer, box: { x: 6, y: 6, w: 50, h: 3.5 } } as Layer] };
  const v = safeZoneViolations(high);
  assert.equal(v.length, 1);
  assert.match(v[0], /ai-label.*top 115 < 250/);
  const low: Template = { ...frame, layers: [frame.layers[0], { ...labelLayer, box: { x: 6, y: 80, w: 50, h: 6 } } as Layer] };
  assert.match(safeZoneViolations(low)[0], /bottom/);
  assert.equal(REEL_SAFE.top, 250);
  assert.equal(REEL_SAFE.bottom, 1580);
});

ok('safe zone: only words and contacts are held to it; photos may bleed; feed posts are out of scope', () => {
  const bleedPhoto: Template = { ...frame, layers: [{ id: 'p', type: 'image', slot: 'presenter', box: { x: -5, y: -5, w: 110, h: 110 }, fit: 'cover' } as Layer] };
  assert.deepEqual(safeZoneViolations(bleedPhoto), []);
  const feed: Template = { ...frame, format: 'feed45', layers: [{ ...labelLayer, box: { x: 0, y: 0, w: 100, h: 5 } } as Layer] };
  assert.deepEqual(safeZoneViolations(feed), []);
  const reel = { key: 'r', scenes: [{ id: 's1', frame: { ...frame, layers: [{ ...labelLayer, box: { x: 6, y: 1, w: 50, h: 3 } } as Layer] } }] };
  assert.match(reelSafeZoneViolations(reel)[0], /^r:s1:/);
});

console.log(`${n} passed`);
