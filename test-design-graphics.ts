// graphic layers (lib/design/graphics.ts): one geometry for the DOM preview, the PNG export and the recorder.
//
// What has to hold: every kind produces drawable data inside its box, deterministically; motion changes the
// picture only for the kinds that animate and never for the still pose; colours are roles; and a template
// carrying them passes validateTemplate - including the rule that a layer tied to the AI character needs a
// slot that has one.
import assert from 'node:assert/strict';
import { graphicDrawing, STILL_T, resolvePaint, WARM_WHITE, type Prim } from './lib/design/graphics.ts';
import { GRAPHIC_KINDS, COLOR_ROLES, validateTemplate, layerVisible, type GraphicLayer, type Template } from './lib/design/contract.ts';
import { colorsFor } from './lib/design/mapBranding.ts';

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

const base = (kind: GraphicLayer['kind'], extra: Partial<GraphicLayer> = {}): GraphicLayer => ({
  id: `g-${kind}`, type: 'graphic', kind, box: { x: 10, y: 10, w: 80, h: 30 }, color: 'primary', ...extra,
});
const W = 864, H = 576;

ok('every kind draws something, as path/text data with a role or white', () => {
  for (const kind of GRAPHIC_KINDS) {
    const l = kind === 'swatches' ? base(kind, { colors: ['surface', 'primary', 'deep', 'tint'] }) : base(kind);
    const d = graphicDrawing(l, W, H);
    assert.ok(d.prims.length > 0, kind);
    for (const p of d.prims) {
      const paints = p.t === 'text' ? [p.fill] : [p.fill, p.stroke].filter(Boolean) as string[];
      for (const c of paints) assert.ok(c === 'white' || (COLOR_ROLES as string[]).includes(c), `${kind}: ${c}`);
      if (p.t === 'path') assert.match(p.d, /^M[-\d. ]/, `${kind} path starts with a move`);
    }
  }
});

ok('geometry is deterministic', () => {
  for (const kind of GRAPHIC_KINDS) {
    const l = kind === 'swatches' ? base(kind, { colors: ['primary', 'deep'], motion: 'float' }) : base(kind, { motion: 'wave' });
    assert.deepEqual(graphicDrawing(l, W, H, 3.7), graphicDrawing(l, W, H, 3.7), kind);
  }
});

ok('the still pose ignores motion; a moving layer changes with time', () => {
  const still = graphicDrawing(base('wave'), W, H, 0);
  const stillLater = graphicDrawing(base('wave'), W, H, 9);
  assert.deepEqual(still, stillLater, 'no motion: time does nothing');
  const moving = base('wave', { motion: 'wave' });
  assert.notDeepEqual(graphicDrawing(moving, W, H, 0), graphicDrawing(moving, W, H, 2));
  const spin = base('burst', { motion: 'spin' });
  assert.notDeepEqual(graphicDrawing(spin, W, H, 0), graphicDrawing(spin, W, H, 2));
  const tilt = graphicDrawing(base('calendar', { motion: 'tilt' }), W, H, 1.3);
  assert.ok(tilt.rotate && Math.abs(tilt.rotate.deg) > 0);
  assert.equal(graphicDrawing(base('calendar'), W, H, 1.3).rotate, undefined);
});

ok('a calendar highlights exactly one day and writes 20 numbers', () => {
  const d = graphicDrawing(base('calendar', { color2: 'deep' }), W, H);
  const texts = d.prims.filter((p): p is Extract<Prim, { t: 'text' }> => p.t === 'text');
  assert.equal(texts.length, 20);
  assert.deepEqual(texts.map((t) => t.str).slice(0, 5), ['1', '2', '3', '4', '5']);
  assert.equal(d.prims.filter((p) => p.t === 'path' && p.fill === 'deep').length, 1);
});

ok('swatches draw one dot per colour', () => {
  const d = graphicDrawing(base('swatches', { colors: ['surface', 'primary', 'deep'] }), W, H);
  assert.equal(d.prims.filter((p) => p.t === 'path' && p.fill).length, 3);
});

ok('paint resolves to her colours, and white is warm, never #FFFFFF', () => {
  const colors = colorsFor('#2E5BFF');
  assert.equal(resolvePaint('primary', colors), colors.primary);
  assert.equal(resolvePaint('white', colors), WARM_WHITE);
  assert.notEqual(WARM_WHITE.toUpperCase(), '#FFFFFF');
  assert.equal(STILL_T, 2.2);
});

const slot = (defaultImage?: Template['slots'][number]['defaultImage']): Template['slots'][number] => ({ key: 'presenter', label: 'x', sources: ['gallery', 'upload'], ...(defaultImage ? { defaultImage } : {}) });
const tpl = (layers: Template['layers'], slots: Template['slots']): Template => ({
  key: 'x-story', version: 1, category: 'announce', format: 'story', name: 'x', description: 'x', variables: [{ key: 'label', label: 'x', kind: 'text', source: 'static', default: 'x' }],
  slots, layers, needs: [], fields: ['nails'],
});

ok('validation: graphics bleed like shapes, bad kinds and roles are named', () => {
  const bleed = base('wave', { box: { x: -10, y: 60, w: 120, h: 50 } });
  assert.deepEqual(validateTemplate(tpl([bleed], [])), []);
  const bad = { ...base('wave'), kind: 'sparkly' } as unknown as GraphicLayer;
  assert.ok(validateTemplate(tpl([bad], [])).some((e) => /unknown kind/.test(e)));
  const badRole = { ...base('burst'), color: 'neon' } as unknown as GraphicLayer;
  assert.ok(validateTemplate(tpl([badRole], [])).some((e) => /unknown colour role/.test(e)));
  assert.ok(validateTemplate(tpl([base('swatches', { colors: ['primary'] })], [])).some((e) => /2 to 4 colours/.test(e)));
});

ok('validation: a layer tied to the character needs a slot that has one', () => {
  const label = { id: 'ai-label', type: 'text', bind: 'label', box: { x: 6, y: 14, w: 40, h: 4 }, font: 'accent', size: 28, color: 'ink', align: 'right', visibleWhen: { slot: 'presenter', origin: 'ai_character' } } as const;
  assert.deepEqual(validateTemplate(tpl([label], [slot({ src: '/defaults/presenters/a.jpg', kind: 'ai_character' })])), []);
  assert.ok(validateTemplate(tpl([label], [slot()])).some((e) => /no defaultImage/.test(e)));
  assert.ok(validateTemplate(tpl([label], [])).some((e) => /unknown slot/.test(e)));
});

ok('layerVisible: the label shows only while the character is what is showing', () => {
  const label = { id: 'l', type: 'text', bind: 'label', box: { x: 0, y: 0, w: 1, h: 1 }, font: 'accent', size: 20, color: 'ink', align: 'right', visibleWhen: { slot: 'presenter', origin: 'ai_character' } } as const;
  assert.equal(layerVisible(label, { imageOrigin: { presenter: 'ai_character' } }), true);
  assert.equal(layerVisible(label, { imageOrigin: { presenter: 'own' } }), false);
  assert.equal(layerVisible(label, { imageOrigin: { presenter: 'none' } }), false);
  assert.equal(layerVisible(label, null), false);
  assert.equal(layerVisible({ ...label, visibleWhen: undefined }, null), true, 'a normal layer is always drawn');
});

console.log(`${n} passed`);
