// "תבניות רילס" (lib/design/reelTemplates.js): every template is valid data, the cuts land on the beat grid at every
// tempo, the reel stays inside "רילס מהצילומים שלי"'s budgets, the words obey the Hebrew rules, the templates are
// really different from each other, her field comes first, and the clip speeds are what the effects say.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// The template module is plain JS with inferred types; the test reads it untyped.
import * as reelTemplates from './lib/design/reelTemplates.js';
const {
  REEL_TEMPLATES, GROUPS, FIELD_OF_GROUP, MOODS, LOOKS, TEXT_STYLES, TRANSITIONS, EFFECTS, LINE_MAX,
  templateProblems, planTemplateReel, resolveTexts, groupsFor, templatesFor, templatesIn, getReelTemplate, seasonWord,
  hebrewFirst, tidyLine, rateAt, clipPlan, sourceMsAt, filmSeconds, zoomAt, transitionMs, transitionHits, textBlock, beatMsOf,
}: any = reelTemplates;
import { MAX_ITEMS, MEDIA_BUDGET_MS, END_MS } from './lib/design/ownReel.js';
import { reelTemplatesVisible } from './lib/featureFlags.ts';
import { REEL_SAFE } from './lib/design/safeZone.ts';

// ── every template is valid ─────────────────────────────────────────────────
for (const t of REEL_TEMPLATES) assert.deepEqual(templateProblems(t), [], `${t.id} is valid`);
assert.equal(new Set(REEL_TEMPLATES.map((t: any) => t.id)).size, REEL_TEMPLATES.length, 'template ids are unique');
assert.ok(templatesIn('lashes').length >= 5, 'lashes first and best: at least the five asked for');
assert.ok(templatesIn('nails').length >= 5, 'nails at the same level');
assert.ok(templatesIn('facial').length >= 2, 'a few for facial');
for (const id of ['lash_reveal', 'lash_before_after', 'lash_bts', 'lash_lift3', 'lash_client']) assert.ok(getReelTemplate(id), `${id} exists`);
for (const id of ['nail_reveal', 'nail_before_after', 'nail_process', 'nail_color', 'nail_season']) assert.ok(getReelTemplate(id), `${id} exists`);
assert.ok(GROUPS.every((g: any) => FIELD_OF_GROUP[g] === 'cosmetics' || FIELD_OF_GROUP[g] === 'nails'));
assert.ok(MOODS.length >= 6, 'six moods or so');
{
  const bpms = MOODS.map((m: any) => m.bpm);
  assert.ok(bpms.some((b: any) => b >= 70 && b <= 78), 'a calm one near 75');
  assert.ok(bpms.some((b: any) => b >= 92 && b <= 100), 'a groove near 95');
  assert.ok(bpms.some((b: any) => b >= 118 && b <= 122), 'pop near 120');
  assert.ok(bpms.some((b: any) => b >= 126 && b <= 130), 'energetic near 128');
}

// the validator really catches things (it is the net the data above passed through)
{
  const bad = JSON.parse(JSON.stringify(getReelTemplate('lash_reveal')));
  bad.slots[0].shot.what = '';
  bad.slots[1].beats = 1.5;
  bad.slots[2].texts[0].lines = ['3 טיפים'];
  bad.slots[3].transition = 'spin';
  bad.blurb = 'איטי – ואלגנטי';
  bad.slots[0].transition = 'flash';
  const p = templateProblems(bad).join('\n');
  for (const want of ['shot instruction', 'beats must be', 'start in Hebrew', 'transition spin', 'a dash', 'opens on a cut']) assert.ok(p.includes(want), `validator flags: ${want}`);
}
// no dashes anywhere in the source of the templates, the music or the screen (em, en, figure dash, bar)
for (const f of ['lib/design/reelTemplates.js', 'lib/design/reelMusic.js', 'app/design/ReelTemplates.jsx', 'app/design/reelTemplateDraw.js']) {
  const src = readFileSync(f, 'utf8');
  const hebrewLines = src.split('\n').filter((l: any) => /[֐-׿]/.test(l));
  for (const l of hebrewLines) assert.ok(!/[‒-―]/.test(l), `${f}: no dash in Hebrew copy: ${l.trim().slice(0, 80)}`);
}

// ── distinct templates, and distinct variants inside each ──────────────────
for (const g of GROUPS) {
  const list = templatesIn(g);
  const sig = (t: any) => `${t.variants[0].look}|${t.variants[0].textStyle}|${t.variants[0].mood}`;
  const shape = (t: any) => t.slots.map((s: any) => `${s.beats}${s.effect}${s.transition}`).join(',');
  assert.equal(new Set(list.map(shape)).size, list.length, `${g}: no two templates share a structure`);
  const sigs = list.map(sig);
  assert.equal(new Set(sigs).size, sigs.length, `${g}: no two templates share look + text style + mood by default`);
}
for (const t of REEL_TEMPLATES) {
  const vs = t.variants.map((v: any) => `${v.look}|${v.textStyle}|${v.mood}`);
  assert.equal(new Set(vs).size, vs.length, `${t.id}: its variants are different reels`);
  assert.ok(new Set(t.variants.map((v: any) => v.mood)).size >= 2, `${t.id}: variants offer more than one mood`);
}
// pacing really differs: the quick-cut reels cut at least twice as often as the calm ones
{
  const cutsPerSec = (id: any) => { const p = planTemplateReel(getReelTemplate(id)); return (p.scenes.length - 1) / (p.mediaMs / 1000); };
  assert.ok(cutsPerSec('nail_trend') > 2 * cutsPerSec('nail_reveal'), 'trend cuts faster than the reveal');
  assert.ok(cutsPerSec('lash_promo') > 2 * cutsPerSec('lash_client'), 'promo cuts faster than the client quote');
}
// across all templates the palette of looks, text styles and transitions is used
assert.deepEqual(new Set(REEL_TEMPLATES.flatMap((t: any) => t.variants.map((v: any) => v.look))), new Set(LOOKS));
assert.deepEqual(new Set(REEL_TEMPLATES.flatMap((t: any) => t.variants.map((v: any) => v.textStyle))), new Set(TEXT_STYLES));
assert.deepEqual(new Set(REEL_TEMPLATES.flatMap((t: any) => t.slots.map((s: any) => s.transition))), new Set(TRANSITIONS));
assert.deepEqual(new Set(REEL_TEMPLATES.flatMap((t: any) => t.slots.map((s: any) => s.effect))), new Set(EFFECTS));
assert.deepEqual(new Set(REEL_TEMPLATES.flatMap((t: any) => t.variants.map((v: any) => v.mood))), new Set(MOODS.map((m: any) => m.id)));

// ── the beat grid, the budgets, at every tempo ──────────────────────────────
for (const t of REEL_TEMPLATES) for (const m of MOODS) {
  const p = planTemplateReel(t, { bpm: m.bpm });
  const beat = beatMsOf(m.bpm);
  assert.equal(p.beatMs, beat);
  let beatsSoFar = 0;
  for (const s of p.scenes) {
    // every cut is on the grid: the start is a whole number of beats from 0 (to the millisecond)
    assert.ok(Math.abs(s.startMs - Math.round(beatsSoFar * beat)) < 1, `${t.id}@${m.bpm}: scene on the beat`);
    assert.ok(Number.isInteger(s.beats) && s.beats >= 1);
    beatsSoFar += s.beats;
  }
  for (let i = 1; i < p.scenes.length; i++) assert.equal(p.scenes[i].startMs, p.scenes[i - 1].startMs + p.scenes[i - 1].ms, 'no gaps');
  assert.equal(p.scenes.at(-1).kind, 'end');
  assert.ok(p.scenes.length - 1 <= MAX_ITEMS, 'no more shots than OwnReel allows');
  assert.ok(p.mediaMs <= MEDIA_BUDGET_MS, `${t.id}@${m.bpm}: media ${p.mediaMs} within ${MEDIA_BUDGET_MS}`);
  assert.ok(p.scenes.at(-1).ms <= END_MS, 'the closing card is at most END_MS');
  assert.ok(p.scenes.at(-1).ms >= 2 * beat - 1, 'and at least two beats');
  assert.ok(p.totalMs <= MEDIA_BUDGET_MS + END_MS && p.totalMs <= 30000, `${t.id}@${m.bpm}: ${p.totalMs} ms at most 30 s`);
  assert.ok(p.totalMs >= 8000, `${t.id}@${m.bpm}: long enough to be a reel`);
  // the pace is kept: re-counted in another tempo's beats, the reel is within 25% of its own length
  const own = planTemplateReel(t).totalMs;
  assert.ok(Math.abs(p.totalMs - own) / own < 0.25, `${t.id}@${m.bpm}: ${p.totalMs} vs ${own}`);
  for (const s of p.scenes) for (const tx of s.texts) assert.ok(tx.startMs >= 0 && tx.startMs < s.ms, 'words start inside their scene');
  for (const s of p.scenes) assert.ok(s.transMs <= s.ms, 'a transition never outlasts its scene');
}
// the budget squeeze: a template with too many beats loses beats from its longest slots, and stays on the grid
{
  const long = JSON.parse(JSON.stringify(getReelTemplate('lash_lift3')));
  long.slots.forEach((s: any) => { s.beats = 20; });
  const p = planTemplateReel(long, { bpm: 96 });
  assert.ok(p.mediaMs <= MEDIA_BUDGET_MS);
  assert.ok(p.scenes.every((s: any) => Number.isInteger(s.beats)));
}
// the first slot opens on a cut whatever the data says; the closing card dissolves in
for (const t of REEL_TEMPLATES) { const p = planTemplateReel(t); assert.equal(p.scenes[0].transition, 'cut'); assert.equal(p.scenes[0].transMs, 0); }
assert.equal(transitionMs('cut', 500), 0);
assert.ok(transitionMs('split', 500) === 1000 && transitionMs('flash', 500) <= 260);

// a photo where a clip was asked for is drawn as a photo (and the reverse)
{
  const t = getReelTemplate('lash_reveal');
  const p = planTemplateReel(t, { items: [{ kind: 'photo' }, { kind: 'video', durationMs: 3000 }, { kind: 'video', durationMs: 9000 }, null] });
  assert.deepEqual(p.scenes.map((s: any) => s.kind), ['photo', 'video', 'video', 'video', 'end']);
}

// ── clip speed: slow motion, sped up, the ramp ─────────────────────────────
assert.equal(rateAt('slowmo', 0.3), 0.5);
assert.equal(rateAt('fast', 0.1), 3);
assert.ok(rateAt('fast', 0.99) < 1.1, 'a fast slot eases back to normal speed at its end');
assert.ok(rateAt('ramp', 0.1) > 1.5 && rateAt('ramp', 0.9) < 0.4, 'the ramp: fast, then slow motion');
assert.equal(rateAt('pushin', 0.5), 1);
{
  // a 4 s slow-motion slot uses 2 s of her clip; a 4 s fast slot uses about 3x
  assert.ok(Math.abs(clipPlan('slowmo', 4000).needMs - 2000) < 5);
  assert.ok(clipPlan('fast', 4000).needMs > 9000);
  // her clip is shorter than the slot needs: it is slowed to fit, never past a quarter speed
  const { k } = clipPlan('fast', 4000, 3000);
  assert.ok(k < 1 && k >= 0.25);
  assert.ok(sourceMsAt('fast', 4000, 4000, k) <= 3000, 'the slowed clip ends inside her clip');
  assert.equal(clipPlan('slowmo', 4000, 60000).k, 1, 'a long clip plays at the effect speed');
  // source time only goes forward
  let last = -1;
  for (let ms = 0; ms <= 4000; ms += 50) { const v = sourceMsAt('ramp', ms, 4000); assert.ok(v >= last); last = v; }
  assert.ok(filmSeconds({ beats: 6, effect: 'fast' } as any, 120) >= 9, 'the shot list asks for enough footage to speed up');
  assert.ok(filmSeconds({ beats: 6, effect: 'slowmo' } as any, 80) <= 4, 'and little for slow motion');
}
assert.ok(zoomAt('pushin', 1) > zoomAt('pushin', 0), 'push-in goes in');
assert.ok(zoomAt('punch', 0, 0) > zoomAt('punch', 0.5, 1200, 0.9), 'the punch lands on the cut and settles');

// ── words: Hebrew first, one line at a time, in the safe zone, editable ─────
assert.equal(hebrewFirst('שלב ראשון'), true);
assert.equal(hebrewFirst('3 טיפים'), false, 'a digit-first line flips to LTR: never in a template');
assert.equal(hebrewFirst('Glow שלי'), false);
assert.equal(tidyLine('  שורה   אחת  '), 'שורה אחת');
assert.equal(Array.from(tidyLine('א'.repeat(60))).length, LINE_MAX);
for (const t of REEL_TEMPLATES) for (const s of planTemplateReel(t).scenes) for (const tx of s.texts) {
  const b = textBlock(tx);
  assert.ok(b.top >= REEL_SAFE.top && b.bottom <= REEL_SAFE.bottom, `${t.id}: words inside the safe zone`);
  assert.ok(tx.lines.length <= 2 && tx.lines.every((l: any) => !/\n/.test(l)));
}
{
  const t = getReelTemplate('lash_bts');
  const words = resolveTexts(t, { edits: { 'prep.0': ['  מאחורי   הקלעים שלי '] , 'work.0': [''] } });
  assert.deepEqual(words[0][0].lines, ['מאחורי הקלעים שלי'], 'her words, tidied');
  const p = planTemplateReel(t, { texts: words });
  assert.equal(p.scenes[1].texts.length, 0, 'an emptied overlay is off');
}
// the season word, and the nail season template uses it
assert.equal(seasonWord(new Date(2026, 0, 10)), 'החורף');
assert.equal(seasonWord(new Date(2026, 3, 10)), 'האביב');
assert.equal(seasonWord(new Date(2026, 6, 10)), 'הקיץ');
assert.equal(seasonWord(new Date(2026, 9, 10)), 'הסתיו');
assert.deepEqual(resolveTexts(getReelTemplate('nail_season'), { date: new Date(2026, 10, 5) })[0][0].lines, ['הצבעים של', 'הסתיו']);

// ── her field first, everyone sees everything ──────────────────────────────
assert.deepEqual(groupsFor(['nails']), ['nails', 'lashes', 'facial'], 'a nails business sees nails first');
assert.deepEqual(groupsFor(['cosmetics']), ['lashes', 'facial', 'nails'], 'a lashes/cosmetics business sees lashes first');
assert.deepEqual(groupsFor(['cosmetics', 'nails']), ['lashes', 'nails', 'facial']);
assert.deepEqual(groupsFor(undefined as any), ['lashes', 'facial', 'nails'], 'no field = the cosmetics default');
assert.equal(templatesFor(['nails']).length, REEL_TEMPLATES.length, 'every template can be browsed');
assert.equal(templatesFor(['nails'])[0].group, 'nails');

// ── the music hits land on the transitions ─────────────────────────────────
{
  const p = planTemplateReel(getReelTemplate('nail_trend'));
  const hits = transitionHits(p);
  assert.ok(hits.length >= 4);
  for (const h of hits) assert.ok(p.scenes.some((s: any) => s.startMs === h.ms), 'each hit is on a cut');
}

// ── the feature flag: on by default, off only when she (or we) say so ──────
assert.equal(reelTemplatesVisible(null), true);
assert.equal(reelTemplatesVisible({}), true);
assert.equal(reelTemplatesVisible({ automations: { feature_flags: { reel_templates: false } } }), false);
assert.equal(reelTemplatesVisible({ automations: { screens: { reel_templates: false } } }), false);
assert.equal(reelTemplatesVisible({ automations: { feature_flags: { reel_templates: true } } }), true);

// ── the screen keeps OwnReel's rules (read from the source: it is a client component) ──
{
  const src = readFileSync('app/design/ReelTemplates.jsx', 'utf8');
  assert.ok(src.includes('accept="image/*,video/*"'), 'a plain picker for photos and clips');
  assert.ok(!/capture=/.test(src), 'no `capture`: the phone offers the camera and the library');
  assert.ok(src.includes('ownReelUse('), 'the same consent rule as OwnReel');
  assert.ok(src.includes('אישרה לי') && src.includes('בלי אישור לא מכינים רילס'), 'the same consent words');
  assert.ok(src.includes('באינסטגרם אפשר להוסיף שיר טרנדי בעצמך, זה עוזר לחשיפה'), 'the honest no-music tip');
  assert.ok(src.includes('accept="audio/*"'), 'her own music is still an option');
  assert.ok(src.includes('<SaveShare'), 'saved and shared through SaveShare');
  const studio = readFileSync('app/design/DesignStudio.jsx', 'utf8');
  assert.ok(studio.includes('reelTemplatesVisible(settings)') && studio.includes('תבניות רילס'), 'the entry point, behind the flag');
  const photo = readFileSync('app/design/PhotoToPost.jsx', 'utf8');
  assert.ok(photo.includes('reelTemplatesVisible(settings)'), 'the photo sheet entry, behind the flag');
}

console.log(`reel templates: ok (${REEL_TEMPLATES.length} templates x ${MOODS.length} moods)`);

// Vercel review 2026-11-05: changing music drops a finished reel, and her own shorter song loops instead of going silent.
{
  const fs = await import('node:fs');
  const ui = fs.readFileSync('app/design/ReelTemplates.jsx', 'utf8');
  if (!/useEffect\(\(\) => \{ dropOut\(\); \}, \[music\]\)/.test(ui)) throw new Error('a music change must drop the finished reel');
  const draw = fs.readFileSync('app/design/reelTemplateDraw.js', 'utf8');
  if (!/buf\.duration < plan\.totalMs \/ 1000\) source\.loop = true/.test(draw)) throw new Error('a short own song must loop in preview and real-time recording');
  console.log('ok - music change drops the reel; a short song loops');
}
