// The Creative Director's contract: the prompt carries the template's own
// variables and the grounding rules, the parser refuses what the UI could
// not use, and the picture brief never carries typography.
import assert from 'node:assert/strict';
import { buildDirectorPrompt, parseDirectorOutput, imagePromptForDirection, fillableVariables, DIRECTOR_AVOID } from './lib/ai/creativeDirector.ts';
import { HARD_CONSTRAINTS } from './lib/ai/imagePrompt.ts';
import { getTemplate } from './lib/design/templates/index.ts';
import { MONTHLY_CALL_CAPS } from './lib/ai/callCaps.ts';

const t = getTemplate('offer-feed')!;
const profile = { business_name: 'הקליניקה של מאיה', services: ['טיפול פנים קלאסי (₪320, 60 דק׳)'], brand_tone: 'יוקרתי ורגוע' };

// The prompt asks for exactly the variables she could type, by key.
const prompt = buildDirectorPrompt(profile, t, 'טיפול פנים קלאסי במבצע 249 ₪');
for (const v of fillableVariables(t)) assert.ok(prompt.includes(`"${v.key}"`), `prompt names ${v.key}`);
assert.ok(!prompt.includes('"business_name"'), 'sourced variables are not asked for');
assert.ok(/כללי דיוק/.test(prompt), 'grounding rules included');
assert.ok(/פרחים ורודים/.test(prompt) && /עור פלסטיק/.test(prompt), 'the default avoids are in the brief');
assert.ok(prompt.includes('טיפול פנים קלאסי במבצע 249 ₪'));

// Parser: keeps only known keys, caps lengths, validates directions.
const good = JSON.stringify({
  values: { headline: 'טיפול פנים קלאסי', price: '₪249', cta: 'לקביעת תור', business_name: 'HACK', nope: 'x', subline: 'א'.repeat(200) },
  copy: { text: 'פוסט', hashtags: ['#עור', 'bad', '#זוהר'] },
  directions: [
    { name: 'A', concept: 'c', composition: 'comp', negativeSpace: 'top', palette: ['#C9A24B', 'red'], imageSubject: 'a woman in a clinic' },
    { name: 'B', concept: 'c', composition: 'comp', negativeSpace: 'weird', palette: [], imageSubject: 'closeup' },
    { imageSubject: '' },
    { name: 'D', concept: 'c', composition: 'comp', negativeSpace: 'bottom', palette: [], imageSubject: 'd' },
    { name: 'E', concept: 'c', composition: 'comp', negativeSpace: 'bottom', palette: [], imageSubject: 'e' },
  ],
});
const out = parseDirectorOutput(t, '```json\n' + good + '\n```');
assert.deepEqual(Object.keys(out.values).sort(), ['cta', 'headline', 'price', 'subline']);
assert.equal(out.values.subline.length, 60, 'capped at the template maxLength');
assert.deepEqual(out.copy.hashtags, ['#עור', '#זוהר']);
assert.equal(out.directions.length, 3, 'at most three, empty ones skipped');
assert.equal(out.directions[0].negativeSpace, 'top');
assert.equal(out.directions[1].negativeSpace, 'bottom', 'unknown negative space defaults to bottom');
assert.deepEqual(out.directions[0].palette, ['#C9A24B']);
assert.throws(() => parseDirectorOutput(t, JSON.stringify({ values: {}, directions: [] })), /no usable direction/);
assert.throws(() => parseDirectorOutput(t, 'not json'));

// The picture brief: her colour and offer mood in, digits and typography out.
const ip = imagePromptForDirection(out.directions[0], { request: 'x', offer: 'במבצע 249 ₪', primaryColor: '#C9A24B', businessName: 'מאיה', format: 'feed45', variation: 2 });
assert.ok(ip.endsWith(HARD_CONSTRAINTS));
assert.ok(!/249/.test(ip), 'price digits never reach the model');
assert.ok(/#C9A24B/.test(ip) && /a woman in a clinic/.test(ip) && /top third/.test(ip));
assert.ok(/Variation 3/.test(ip), 'a variation is asked for as a different picture');
assert.ok(ip.includes(DIRECTOR_AVOID.split(',')[0]), 'the default avoids reach the image model');

assert.ok(MONTHLY_CALL_CAPS['creatives/direct'] > 0 && MONTHLY_CALL_CAPS['creatives/image'] > 0);
console.log('creative director: ok');
