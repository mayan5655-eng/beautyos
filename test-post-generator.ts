// Free-form generation: which templates may be picked, what Claude's answer must look like, how the cap is read.
import assert from 'node:assert/strict';
import { TEMPLATES, latestTemplates } from './lib/design/templates/index.ts';
import { candidateTemplates, aiSlotOf, buildGeneratePrompt, parseGeneratePlan, generationAllowance, OPTIONS_PER_GENERATION } from './lib/ai/postGenerator.ts';

// ── Candidates ──────────────────────────────────────────────────────────────
const feed = candidateTemplates(latestTemplates(), 'feed45', false);
assert.ok(feed.length >= 3);
assert.ok(feed.every((t) => t.format === 'feed45'));
assert.ok(!feed.some((t) => t.key.startsWith('before-after')), 'client photos with consent are never generated');
assert.ok(!feed.some((t) => t.key.startsWith('review')), 'no reviews saved -> no testimonial template');
assert.ok(candidateTemplates(latestTemplates(), 'feed45', true).some((t) => t.key === 'review-feed'), 'with reviews it is allowed');
assert.ok(candidateTemplates(latestTemplates(), 'story', false).every((t) => t.format === 'story'));
assert.ok(aiSlotOf(TEMPLATES.find((t) => t.key === 'offer-feed' && t.version === 2)!), 'the offer has an AI picture slot');

// ── The prompt carries the catalogue and the brief ──────────────────────────
const prompt = buildGeneratePrompt({ business_name: 'הקליניקה של מאיה' }, 'מבצע לטיפול פנים לפני החג', feed);
assert.ok(prompt.includes('key "offer-feed"') && prompt.includes('מבצע לטיפול פנים לפני החג') && prompt.includes('הקליניקה של מאיה'));
assert.ok(prompt.includes(`${OPTIONS_PER_GENERATION} אפשרויות`));

// ── Claude's answer: unknown keys dropped, values sanitised, two options minimum ──
const good = JSON.stringify({
  options: [
    { templateKey: 'offer-feed', angle: 'מבצע ישיר', values: { headline: '  טיפול פנים לפני החג ', price: '₪249', bogus: 'x' }, imageSubject: 'a calm clinic scene' },
    { templateKey: 'rosh-hashana-feed', angle: 'רגש', values: { headline: 'שנה של עור זוהר' }, imageSubject: 'honey and apples' },
    { templateKey: 'not-a-template', values: {} },
    { templateKey: 'gift-card-feed', angle: 'מתנה', values: { headline: 'שובר', price: '₪300' }, imageSubject: 'a wrapped box' },
    { templateKey: 'offer-feed', angle: 'רביעית, מיותרת', values: { headline: 'x' }, imageSubject: 'y' },
  ],
  copy: { text: 'טקסט לפוסט', hashtags: ['#עור', 'not a tag', '#skincare'] },
});
const plan = parseGeneratePlan('```json\n' + good + '\n```', feed);
assert.equal(plan.options.length, 3, 'unknown key dropped, capped at three');
assert.deepEqual(plan.options[0].values, { headline: 'טיפול פנים לפני החג', price: '₪249' }, 'trimmed, unknown field dropped');
assert.equal(plan.options[0].templateVersion, 2);
assert.equal(plan.options[1].templateKey, 'rosh-hashana-feed');
assert.deepEqual(plan.copy.hashtags, ['#עור', '#skincare']);
assert.throws(() => parseGeneratePlan(JSON.stringify({ options: [{ templateKey: 'offer-feed', values: {} }] }), feed), /only 1 usable/);

// ── The allowance: platform default, tenant override, fail-open ─────────────
const status = (used: number, cap: number | null, unknown = false) => ({ used, cap, exceeded: cap !== null && used >= cap, unknown });
assert.deepEqual(await generationAllowance('t', null, { status: status(3, 9) }), { used: 3, cap: 9, remaining: 6, exceeded: false });
assert.deepEqual(await generationAllowance('t', 20, { status: status(9, 9) }), { used: 9, cap: 20, remaining: 11, exceeded: false }, 'a tenant override wins');
assert.deepEqual(await generationAllowance('t', 0, { status: status(0, 9) }), { used: 0, cap: 0, remaining: 0, exceeded: true }, '0 switches it off');
assert.deepEqual(await generationAllowance('t', 'junk', { status: status(9, 9) }), { used: 9, cap: 9, remaining: 0, exceeded: true });
assert.deepEqual(await generationAllowance('t', null, { status: status(0, 9, true) }), { used: 0, cap: 9, remaining: 9, exceeded: false }, 'an unreadable count fails open');

console.log('post generator: ok');
