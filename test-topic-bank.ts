// lib/ai/topicBank.ts: the generated topic bank stays sane, and
// buildTopicBrief() actually composes a real brief for every (topic, shape)
// pair — 73 x 5 = 365 combinations, none of them the source sheet's frozen
// sentence.
import assert from 'node:assert/strict';
import { TOPIC_BANK, SHAPE_META, topicsForField, findTopic, buildTopicBrief, type ShapeKey } from './lib/ai/topicBank.ts';

// ── Shape ────────────────────────────────────────────────────────────────
const cosmetics = TOPIC_BANK.filter((t) => t.field === 'cosmetics');
const nails = TOPIC_BANK.filter((t) => t.field === 'nails');
assert.equal(cosmetics.length, 37);
assert.equal(nails.length, 36);
assert.equal(TOPIC_BANK.length, 73, '37 cosmetics + 36 nails, exactly what the source sheet (365 rows / 5 shapes) held');

// Every topic: a real id, a non-empty name, a non-empty visual seed — and
// crucially none of the source sheet's own boilerplate columns leaked in
// (כותרת was literally "{topic} | {shape}"; that pattern must not appear
// in a name or a seed).
const idPattern = /^(cosmetics|nails)-\d{2}$/;
for (const t of TOPIC_BANK) {
  assert.ok(idPattern.test(t.id), `${t.id} is field-prefixed and two-digit`);
  assert.ok(t.name.trim().length > 0);
  assert.ok(t.visualSeed.trim().length > 0);
  assert.ok(!/\|/.test(t.name), `${t.name}: no "topic | shape" label leaked into the name`);
}
assert.equal(new Set(TOPIC_BANK.map((t) => t.id)).size, TOPIC_BANK.length, 'no duplicate ids');
assert.equal(new Set(cosmetics.map((t) => t.name)).size, cosmetics.length, 'no duplicate names within a field');
assert.equal(new Set(nails.map((t) => t.name)).size, nails.length, 'no duplicate names within a field');

// ── SHAPE_META: fixed goal/channel per shape, all five present ─────────────
const SHAPES: ShapeKey[] = ['tip', 'audience_question', 'myth_vs_reality', 'behind_the_treatment', 'booking_invitation'];
assert.deepEqual(Object.keys(SHAPE_META).sort(), [...SHAPES].sort());
for (const s of SHAPES) {
  assert.ok(SHAPE_META[s].label);
  assert.ok(SHAPE_META[s].goal);
  assert.ok(['post_story', 'carousel', 'reel_post'].includes(SHAPE_META[s].channel));
}
assert.equal(SHAPE_META.myth_vs_reality.channel, 'carousel', 'the one shape with no real mechanism yet — see WORK_PLAN.md');
assert.equal(SHAPE_META.behind_the_treatment.channel, 'reel_post');

// ── topicsForField / findTopic ──────────────────────────────────────────────
assert.equal(topicsForField(['cosmetics']).length, 37);
assert.equal(topicsForField(['nails']).length, 36);
assert.equal(topicsForField(['cosmetics', 'nails']).length, 73);
assert.equal(topicsForField([]).length, 0);
assert.equal(findTopic('nails-01')?.field, 'nails');
assert.equal(findTopic('does-not-exist'), null);

// ── buildTopicBrief: a real, non-formulaic brief for every combination ─────
// Not the source sheet's frozen sentence: no row's literal טקסט מוכן ever
// reaches this function at all (it was never imported), so there is nothing
// to accidentally match — the real assertion is that a brief is produced,
// names the topic, carries the visual seed as INSPIRATION (labelled as
// such, not final text) and differs meaningfully by shape.
for (const t of TOPIC_BANK) {
  const briefs = new Map();
  for (const s of SHAPES) {
    const b = buildTopicBrief(t, s);
    assert.ok(b.includes(t.name), `${t.id}/${s}: names the topic`);
    assert.ok(b.includes(t.visualSeed), `${t.id}/${s}: carries the visual seed`);
    assert.match(b, /לא טקסט סופי/, 'the seed is explicitly labelled as inspiration, not final copy');
    briefs.set(s, b);
  }
  assert.equal(new Set(briefs.values()).size, SHAPES.length, `${t.id}: all five shapes produce a genuinely different brief`);
}

// A concrete example: the myth_vs_reality brief for a real topic names the
// carousel-approximation honestly rather than pretending it is one.
const acne = findTopic('cosmetics-02')!;
assert.equal(acne.name, 'אקנה בגיל ההתבגרות');
const mythBrief = buildTopicBrief(acne, 'myth_vs_reality');
assert.match(mythBrief, /מיתוס/);
assert.match(mythBrief, /קרוסלה/, 'the brief itself is honest that a real carousel does not exist yet');

console.log('topic bank: ok');
