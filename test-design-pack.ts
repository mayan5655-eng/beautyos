// The Kalmea pack (lib/design/templates/pack, lib/design/reels/pack): six presenter posts and eighteen reels.
//
// What must hold for every one of them, so a new brand colour, an empty tenant or a long business name cannot
// turn them into something unreadable or untruthful:
//   - they are valid, JSON-shaped, immutable (locked) and registered where the gallery and the fill look
//   - reels keep words and contact inside the safe zone
//   - text sits on a ground its colour role reads on, whatever her brand colour is
//   - the AI character label is a fixed layer inside the safe zone, visible only while the character shows,
//     and the character images exist
//   - the defaults carry no placeholder brackets, no English filler, no symbol that can jump in Hebrew
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { validateTemplate, layerVisible, type Layer, type Template, type ColorRole } from './lib/design/contract.ts';
import { PACK_TEMPLATES, getTemplate, galleryTemplates } from './lib/design/templates/index.ts';
import { REELS, getReel, latestReels } from './lib/design/reels/index.ts';
import { PACK_REELS as SET2_REELS } from './lib/design/reels/pack.ts';
import { PACK_CONCEPT_REELS } from './lib/design/reels/pack-concepts.ts';
import { validateReel, fillReel, reelId } from './lib/design/reel.ts';
import { fillTemplate } from './lib/design/mapBranding.ts';
import { reelSafeZoneViolations, safeZoneViolations } from './lib/design/safeZone.ts';
import { PRESENTERS } from './lib/design/templates/pack/presenters.ts';

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

const PACK_REELS = [...SET2_REELS, ...PACK_CONCEPT_REELS];

const deep = (v: unknown): unknown => (Array.isArray(v) ? v.map(deep) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, deep((v as Record<string, unknown>)[k])])) : v);
const hash = (t: unknown) => createHash('sha256').update(JSON.stringify(deep(t))).digest('hex').slice(0, 16);
const lock = JSON.parse(fs.readFileSync('lib/design/templates/templates.lock.json', 'utf8')) as Record<string, string>;

ok('the pack is 6 presenter posts + 8 concepts in two formats, and 18 + 8 reels; all pk-, version 1, unique', () => {
  assert.equal(PACK_TEMPLATES.length, 6 + 8 * 2);
  assert.equal(PACK_REELS.length, 18 + 8);
  const keys = [...PACK_TEMPLATES.map((t) => t.key), ...PACK_REELS.map((r) => r.key)];
  assert.equal(new Set(keys).size, 22 + 26);
  for (const k of keys) assert.match(k, /^pk-[a-z0-9-]+$/);
  assert.ok([...PACK_TEMPLATES, ...PACK_REELS].every((t) => t.version === 1));
});

ok('registered: lookups, the gallery and the reel list see them; the cream library is untouched', () => {
  for (const t of PACK_TEMPLATES) assert.equal(getTemplate(t.key)?.key, t.key);
  for (const r of PACK_REELS) assert.equal(getReel(r.key)?.key, r.key);
  // a story is folded into its feed sibling's card, as for every other template
  assert.ok(PACK_TEMPLATES.filter((t) => !/-story$/.test(t.key)).every((t) => galleryTemplates().some((g) => g.key === t.key)), 'a group puts them in the gallery');
  assert.ok(PACK_REELS.every((r) => REELS.includes(r)));
  const mine = (field: 'nails' | 'cosmetics') => latestReels(null, null, [field]).filter((r) => r.key.startsWith('pk-')).length;
  assert.equal(mine('nails'), 15 + 3, '6 photo + 4 nails graphic + 2 dual + 3 nails presenters; 3 nails concepts');
  assert.equal(mine('cosmetics'), 5 + 5, '2 dual + 3 cosmetics presenters; 5 cosmetics concepts');
});

ok('every template and reel validates, and survives JSON', () => {
  for (const t of PACK_TEMPLATES) {
    assert.deepEqual(validateTemplate(t), [], t.key);
    assert.deepEqual(JSON.parse(JSON.stringify(t)), t, `${t.key} is plain data`);
  }
  for (const r of PACK_REELS) {
    assert.deepEqual(validateReel(r), [], r.key);
    assert.deepEqual(JSON.parse(JSON.stringify(r)), r, `${r.key} is plain data`);
  }
});

ok('locked: every hash equals the lock file', () => {
  for (const t of PACK_TEMPLATES) assert.equal(lock[`${t.key}@${t.version}`], hash(t), `${t.key} unchanged since it was locked`);
  for (const r of PACK_REELS) assert.equal(lock[reelId(r)], hash(r), `${reelId(r)} unchanged since it was locked`);
});

ok('audience: dual-field only for the two neutral reels', () => {
  const dual = PACK_REELS.filter((r) => r.fields.length === 2).map((r) => r.key).sort();
  assert.deepEqual(dual, ['pk-offer-reel', 'pk-open-diary-reel']);
  for (const r of PACK_REELS) assert.ok(r.fields.length >= 1);
  assert.ok(PACK_TEMPLATES.every((t) => t.fields.length === 1), 'no static is dual-tagged: each says which trade it is');
  assert.equal(PACK_TEMPLATES.filter((t) => t.fields.includes('cosmetics')).length, 3 + 3 * 2);
  assert.equal(PACK_REELS.filter((r) => r.fields.includes('cosmetics') && !r.fields.includes('nails')).length, 3 + 5);
});

ok('reels: words and contact inside the safe zone', () => {
  const v = PACK_REELS.flatMap((r) => reelSafeZoneViolations(r));
  assert.deepEqual(v, []);
});

// ── text sits on a ground its role reads on ────────────────────────────────────────────────────────────────
const READS_ON: Record<string, ColorRole[]> = {
  ink: ['surface', 'blush', 'sand', 'tint'],
  contrast: ['primary'],
  surface: ['ink'],
};
const contains = (b: Layer['box'], px: number, py: number) => px >= b.x - 0.01 && px <= b.x + b.w + 0.01 && py >= b.y - 0.01 && py <= b.y + b.h + 0.01;

/** What is under the middle of text layer `i`: a role (shape, wave), a photo with its wash, or the page. */
function ground(frame: Template, i: number): { role: ColorRole } | { photo: { overlay?: ColorRole } } {
  const t = frame.layers[i];
  const cx = t.box.x + t.box.w / 2, cy = t.box.y + t.box.h / 2;
  for (let k = i - 1; k >= 0; k--) {
    const l = frame.layers[k];
    if (l.type === 'shape' && !l.rotate && l.opacity === undefined && contains(l.box, cx, cy)) return { role: l.color };
    // a wave is a ground only below its crest (box top + 1.5 amplitudes of base + 1.4 of swing); above it the
    // layers underneath show, and the crest moves while the reel plays
    if (l.type === 'graphic' && l.kind === 'wave') {
      const crest = ((l.params?.amp ?? 70) * 2.9 / 1920) * 100;
      if (contains(l.box, cx, cy) && cy > l.box.y + crest) return { role: l.color };
      continue;
    }
    if (l.type === 'image' && !l.rotate && contains(l.box, cx, cy)) return { photo: { overlay: l.overlay?.color } };
  }
  return { role: 'surface' };
}

ok('every text layer reads on its ground, for any brand colour', () => {
  const problems: string[] = [];
  const frames: Template[] = [...PACK_TEMPLATES, ...PACK_REELS.flatMap((r) => r.scenes.map((s) => s.frame))];
  for (const f of frames) {
    f.layers.forEach((l, i) => {
      if (l.type !== 'text') return;
      if (l.id.startsWith('wall-')) return; // the faint wall of her own name: decoration, meant to be quiet
      const where = `${f.key}/${l.id}`;
      if (l.background) {
        // the pill is the ground: its role must read for the text colour
        if (!(READS_ON[l.color] || []).includes(l.background.color)) problems.push(`${where}: ${l.color} on its own ${l.background.color} pill`);
        return;
      }
      const g = ground(f, i);
      if ('photo' in g) {
        const wash = g.photo.overlay;
        const good = (l.color === 'surface' && wash === 'ink') || (l.color === 'ink' && (wash === 'surface' || wash === 'blush'));
        if (!good) problems.push(`${where}: ${l.color} text on a photo with ${wash ? `a ${wash} wash` : 'no wash'}`);
      } else if (!(READS_ON[l.color] || []).includes(g.role)) {
        problems.push(`${where}: ${l.color} on ${g.role}`);
      }
    });
  }
  assert.deepEqual(problems, []);
});

ok('presenters: a fixed label inside the safe zone, only while the character shows; the images exist', () => {
  for (const c of PRESENTERS) {
    assert.ok(fs.existsSync(`public/defaults/presenters/${c.image}.jpg`), `${c.image}.jpg exists`);
    assert.ok(fs.statSync(`public/defaults/presenters/${c.image}.jpg`).size <= 200 * 1024, 'inside the asset budget');
    const post = getTemplate(`pk-${c.slug}-feed`)!;
    const reel = getReel(`pk-${c.slug}-reel`)!;
    for (const f of [post, ...reel.scenes.map((s) => s.frame)]) {
      const label = f.layers.find((l) => l.id === 'ai-label');
      assert.ok(label && label.type === 'text', `${f.key} has the label layer`);
      assert.deepEqual((label as { visibleWhen?: unknown }).visibleWhen, { slot: f.slots[0].key, origin: 'ai_character' });
      assert.equal(f.slots[0].defaultImage?.kind, 'ai_character');
      assert.equal(f.variables.find((v) => v.key === 'ai_label')?.source, 'fixed', 'she cannot edit the label away');
    }
    assert.deepEqual(safeZoneViolations(reel.scenes[0].frame), []);
    // one character slot for the whole reel
    assert.deepEqual(reel.slots.map((s) => s.key), ['shared_presenter']);
    // the label follows the picture: character -> shown, her own photo -> gone
    const withChar = fillReel(reel, { settings: {} }).scenes[0];
    const mine = fillReel(reel, { settings: {}, images: { shared_presenter: 'https://x.test/me.jpg' } }).scenes[0];
    const lab = reel.scenes[0].frame.layers.find((l) => l.id === 'ai-label')!;
    assert.equal(layerVisible(lab, withChar), true);
    assert.equal(layerVisible(lab, mine), false);
    const postChar = fillTemplate(post, { settings: {} });
    assert.equal(postChar.images.presenter, `/defaults/presenters/${c.image}.jpg`);
    assert.equal(postChar.values.ai_label, 'דמות AI להמחשה', 'the label text is the constant, whatever she typed');
    assert.equal(fillTemplate(post, { settings: {}, inputs: { ai_label: 'x' } }).values.ai_label, 'דמות AI להמחשה');
    assert.ok(post.suggestedCaption && reel.suggestedCaption, 'the voice script survives as a suggested caption');
  }
});

ok('photo reels share one picture across the scenes', () => {
  for (const r of PACK_REELS.filter((x) => /^pk-nail-(french|burgundy|studio|nude|art|chrome)-reel$/.test(x.key))) {
    assert.deepEqual(r.slots.map((s) => s.key), ['shared_photo'], r.key);
    const f = fillReel(r, { settings: {}, images: { shared_photo: 'https://x.test/p.jpg' } });
    assert.deepEqual(f.missing, [], 'one picture satisfies all three scenes');
    assert.deepEqual(f.scenes.map((s) => s.images.shared_photo), ['https://x.test/p.jpg', 'https://x.test/p.jpg', 'https://x.test/p.jpg']);
    assert.deepEqual(fillReel(r, { settings: {} }).missing, ['slot:shared_photo'], 'named once, not three times');
  }
});

ok('copy: no placeholders, no English filler, no symbol that can jump, headlines fit their line budget', () => {
  const frames: Template[] = [...PACK_TEMPLATES, ...PACK_REELS.flatMap((r) => r.scenes.map((s) => s.frame))];
  for (const f of frames) {
    for (const v of f.variables) {
      const d = v.default || '';
      assert.ok(!/[\[\]{}]/.test(d), `${f.key}.${v.key}: no bracket placeholder`);
      assert.ok(!/[A-Za-z]{3,}/.test(d), `${f.key}.${v.key}: no English filler (${d})`);
      assert.ok(!/[•₪%$]/.test(d), `${f.key}.${v.key}: no symbol that can move in Hebrew`);
      assert.ok(!/\s{2,}/.test(d), `${f.key}.${v.key}: no double spaces`);
    }
    const h = f.layers.find((l) => l.id === 'headline');
    if (h && h.type === 'text') {
      const def = f.variables.find((v) => v.key === h.bind)!.default || '';
      assert.ok(def.split('\n').length <= (h.maxLines || 1), `${f.key}: headline lines <= maxLines`);
      // chosen line breaks: each line short; left to wrap: the whole headline within the field's own limit
      if (def.includes('\n')) for (const line of def.split('\n')) assert.ok(line.length <= 28, `${f.key}: a headline line stays short (${line})`);
      else assert.ok(def.length <= (f.variables.find((v) => v.key === h.bind)!.maxLength || 60), `${f.key}: the headline fits its field`);
    }
  }
});

ok('stories keep their words inside the safe zone too (they have the same interface over them)', () => {
  const stories = PACK_TEMPLATES.filter((t) => t.format === 'story');
  assert.equal(stories.length, 8);
  assert.deepEqual(stories.flatMap((t) => safeZoneViolations(t)), []);
});

ok('"meet her" concepts take her own picture, never an invented face', () => {
  for (const key of ['pk-meet-cosmetician-feed', 'pk-meet-cosmetician-story', 'pk-meet-nail-tech-feed', 'pk-meet-nail-tech-story']) {
    const t = getTemplate(key)!;
    assert.ok(!t.slots[0].sources.includes('ai'), key);
    assert.ok(t.slots[0].sources.includes('portrait'), key);
  }
});

ok('the booking button and her contact are on the last scene only', () => {
  for (const r of PACK_REELS) {
    r.scenes.forEach((s, i) => {
      const has = (id: string) => s.frame.layers.some((l) => l.id === id);
      assert.equal(has('cta'), i === 2, `${r.key}:${s.id} cta`);
      assert.equal(has('contact'), i === 2, `${r.key}:${s.id} contact`);
    });
  }
});

console.log(`${n} passed`);
