// lib/ai/voiceExamples.ts: "פוסטים שאני אוהבת" reaches the generators as a
// voice sample, and never as a fact the claims guard would accept.
import assert from 'node:assert/strict';
import { cleanVoiceExamples, buildVoiceBlock, addVoiceExample, VOICE_EXAMPLES_MAX, VOICE_EXAMPLE_MAX_CHARS } from './lib/ai/voiceExamples.ts';
import { buildBusinessContext } from './lib/ai/marketingAI.ts';
import { buildGeneratePrompt } from './lib/ai/postGenerator.ts';
import { buildPackPrompt } from './lib/content/pack.ts';

const A = 'בוקר טוב יפות שלי 🌸 השבוע פתחתי עוד שני תורים לטיפול פנים, מי ראשונה?';
const B = 'יש רגע כזה, כשמורידים את המסכה ורואים את העור נושם. בשבילו אני פה.';

// Empty, junk, and the settings screen's padded array all collapse to undefined.
assert.equal(cleanVoiceExamples(undefined), undefined);
assert.equal(cleanVoiceExamples(null), undefined);
assert.equal(cleanVoiceExamples(['', '  ', '']), undefined);
assert.equal(cleanVoiceExamples([42, {}, 'קצר']), undefined, 'a slogan is not a voice sample');
assert.equal(buildVoiceBlock(undefined), '');
assert.equal(buildVoiceBlock(['', '', '']), '');

// The UI stores ["text", "", ""]; blanks and duplicates go, order stays.
assert.deepEqual(cleanVoiceExamples([A, '', B]), [A, B]);
assert.deepEqual(cleanVoiceExamples([A, A, B]), [A, B]);
assert.deepEqual(cleanVoiceExamples(`  ${A}  `), [A], 'a single legacy string still counts');

// Capped in count and length so a pasted essay cannot swallow the prompt.
const many = Array.from({ length: 6 }, (_, i) => `${A} ${i}`);
assert.equal(cleanVoiceExamples(many)!.length, VOICE_EXAMPLES_MAX);
assert.equal(cleanVoiceExamples(['א'.repeat(5000)])![0].length, VOICE_EXAMPLE_MAX_CHARS);

// Windows line endings and runs of blank lines are normalised.
assert.deepEqual(cleanVoiceExamples([`${A}\r\n\r\n\r\n\r\n${B}`]), [`${A}\n\n${B}`]);

// The block carries the samples and the voice-only rule.
const block = buildVoiceBlock([A, B]);
assert.ok(block.includes(A) && block.includes(B));
assert.ok(block.includes('דוגמה 1') && block.includes('דוגמה 2'));
assert.ok(block.includes('אל תיקחי מהדוגמאות שום עובדה'));

// Never part of buildBusinessContext: that string is the claims guard's source,
// and an example may be old or another salon's.
const profile = { business_name: 'סטודיו נועה', voice_examples: [A, B] };
assert.ok(!buildBusinessContext(profile).includes(A));

// The generators that write public copy do carry it.
const gen = buildGeneratePrompt(profile, 'פוסט על טיפול פנים', []);
assert.ok(gen.includes(A) && gen.includes(B));
const pack = buildPackPrompt(profile, [{ key: 'tip', reason: 'טיפ', day: 'ראשון' }]);
assert.ok(pack.includes(A));

// Without examples, the prompt is unchanged around the business section.
assert.ok(!buildGeneratePrompt({ business_name: 'x' }, 'b', []).includes('הקול שלה'));

// "זה נשמע כמוני" from the editor: newest first, no duplicate, oldest falls off at three.
const C = 'עוד טקסט אחד שלי, בקול שלי, כדי שיהיו שלושה ויותר מזה כבר נופל.';
const D = 'והרביעי - הוא נכנס ראשון והישן ביותר יוצא מהרשימה בלי לשאול.';
assert.deepEqual(addVoiceExample(undefined, A), [A]);
assert.deepEqual(addVoiceExample([A], B), [B, A]);
assert.deepEqual(addVoiceExample([B, A], A), [A, B], 'saving one again moves it to the front, not twice');
assert.deepEqual(addVoiceExample([C, B, A], D), [D, C, B]);
assert.deepEqual(addVoiceExample(['', A, ''], B), [B, A], 'the settings screen padding is not kept');
assert.equal(addVoiceExample([A], 'קצר'), null);
assert.equal(addVoiceExample([A], 123), null);

console.log('voice examples: all passed');
