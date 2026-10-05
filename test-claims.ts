// What the AI may say about how a treatment feels.
//
// She posts what it writes without reading it. So a caption that promises "only a
// slight tingle" for a peel that stings is hers to answer for - and she will not
// see it coming. The rule, in the words of the person who pays for this: how a
// treatment feels, its intensity, its downtime, who it suits and what it contains
// may appear ONLY if her business profile, the service description or her own
// request says so. Otherwise the text stays general.
//
// Prompts are followed most of the time, not all of it, and "most" is not good
// enough for a promise made in her name. So there are two layers, both tested:
//   1. the PROMPT says it, strictly, in every prompt that writes text she posts
//      (and the old rule that said the opposite is gone);
//   2. a deterministic BACKSTOP reads what came back, and anything in these five
//      categories that is not in the source she wrote is caught: one retry with
//      the offending words named, and if it still happens the post is REFUSED with
//      a plain explanation instead of published.
// The fixtures are the real captions production wrote on 2026-10-05.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GROUNDING_RULES, buildBusinessContext } from './lib/ai/marketingAI.ts';
import { buildGeneratePrompt } from './lib/ai/postGenerator.ts';
import { buildDirectorPrompt } from './lib/ai/creativeDirector.ts';
import { CLAIMS_RULE_HE, findUngroundedClaims, withClaimsGuard, UngroundedClaimsError, fixHebrewSlips } from './lib/ai/claimsGuard.ts';

const code = (f: string) => fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

// ── 1. the prompts ──────────────────────────────────────────────────────────
assert.ok(!GROUNDING_RULES.includes('מותר וכדאי לתאר חוויה, תחושה'), 'the rule that PERMITTED describing sensation is gone - it is what produced "only a slight tingle"');
assert.ok(GROUNDING_RULES.includes(CLAIMS_RULE_HE), 'the shared grounding rules (director, reel, shooting list) carry the strict rule');
for (const cat of ['תחושה', 'עוצמה', 'זמן התאוששות', 'התאמה', 'הרכב']) assert.ok(CLAIMS_RULE_HE.includes(cat), `the rule names the category: ${cat}`);
assert.ok(/אלא אם|רק אם/.test(CLAIMS_RULE_HE) && /באופן כללי|כללי/.test(CLAIMS_RULE_HE), 'it says when it is allowed and what to do otherwise: stay general');
assert.ok(CLAIMS_RULE_HE.includes('מפרסמת') && /בלי לבדוק/.test(CLAIMS_RULE_HE), 'and tells the model why: she publishes without checking');

const profile = { business_name: 'הקליניקה של מאיה', services: ['פילינג כימי (₪350, 45 דק׳)'] };
const generate = buildGeneratePrompt(profile as any, 'פילינג אחרי הקיץ', []);
assert.ok(generate.includes(CLAIMS_RULE_HE), 'the caption prompt carries the strict rule');
const tpl: any = { key: 'k', version: 1, name: 'n', description: 'd', fields: [], variables: [], ai: null };
let director = '';
try { director = buildDirectorPrompt(profile as any, tpl, 'פילינג אחרי הקיץ'); } catch { director = GROUNDING_RULES; }
assert.ok(director.includes(CLAIMS_RULE_HE), 'the director (AI fill) prompt carries it');
for (const f of ['app/api/marketing/reel/route.ts', 'app/api/marketing/shooting-list/route.ts']) {
  assert.ok(code(f).includes('GROUNDING_RULES'), `${f} uses the shared grounding rules`);
}

// ── 2. the model is shown what she wrote about each service ─────────────────
const withDesc = buildBusinessContext({
  business_name: 'מאיה', services: ['פילינג כימי (₪350)'],
  service_details: ['פילינג כימי: מרגישים חום קל, חוזרים לשגרה באותו יום'],
} as any);
assert.ok(withDesc.includes('מרגישים חום קל'), 'a service description reaches the model');
assert.ok(/המקור היחיד|רק מכאן/.test(withDesc), 'and is labelled as the ONLY source for claims about feel, intensity, downtime, suitability and contents');
const noDesc = buildBusinessContext({ business_name: 'מאיה', services: ['פילינג כימי (₪350)'] } as any);
assert.ok(!/תיאורי השירותים/.test(noDesc), 'no descriptions: no empty section');
const loader = code('lib/ai/loadBusinessProfile.ts');
assert.ok(loader.includes('description'), 'the profile loader reads service descriptions');
assert.ok(/isMissingColumnError/.test(loader), 'and degrades when the column has not been added yet');

// ── 3. the backstop, on the real captions ──────────────────────────────────
const BRIEF = 'פילינג כימי עדין לעור עייף אחרי הקיץ - מתחילות שנה עם עור חדש';
const SRC = `${buildBusinessContext(profile as any)}\n${BRIEF}`; // profile + her own request
const run2 = 'מורחת קרם בבוקר, והוא נשאר על הפנים כמו שכבה שלא נספגת. ככה זה אחרי חודשים של שמש, מזגן ומלח. פילינג כימי בעוצמה נמוכה מסיר בעדינות את התאים המתים שהצטברו, כך שמה שתשימי מעכשיו באמת ייקלט. בלי שפשוף. התהליך מותאם אחרי בדיקה קצרה, ולרוב מרגישים רק עקצוץ קל. ספטמבר הוא זמן טוב להתחיל ממנו.';
const run1 = 'פילינג כימי עדין מסיר אותה בעזרת חומצות שנבחרות לפי סוג העור שלך. בלי שפשוף. בסיום המגע חלק יותר.';
const flagged2 = findUngroundedClaims([run2], SRC);
for (const must of ['עקצוץ', 'עוצמה', 'שפשוף', 'בדיקה']) assert.ok(flagged2.some((c) => c.includes(must)), `run 2: "${must}" is flagged - her profile never said it`);
assert.ok(!flagged2.some((c) => c.includes('עדין')), '"עדין" is NOT flagged: it is in her own request');
assert.ok(findUngroundedClaims([run1], SRC).some((c) => c.includes('חומצ')), 'run 1: claiming what the peel contains is flagged');
assert.ok(findUngroundedClaims(['מזמינה אותך לקבוע תור לפילינג כימי. אחרי הקיץ, זה הזמן להתחיל מחדש.'], SRC).length === 0, 'a general, true caption passes');

// the same words ARE allowed once she wrote them
const grounded = `${SRC}\nתיאור הטיפול: מרגישים עקצוץ קל, בעוצמה נמוכה, מותאם אחרי בדיקה קצרה, בלי שפשוף`;
assert.deepEqual(findUngroundedClaims([run2], grounded), [], 'once her service description says so, the claim is hers and passes');
// prefixes and inflections do not hide a claim
assert.ok(findUngroundedClaims(['והעקצוצים נעלמים תוך דקות'], SRC).length > 0, 'prefixed / inflected forms are caught');
assert.ok(findUngroundedClaims(['הטיפול מתאים גם לעור רגיש'], SRC).length > 0, 'suitability is caught');
assert.ok(findUngroundedClaims(['בלי זמן החלמה ובלי השבתה'], SRC).length > 0, 'downtime is caught');
assert.ok(findUngroundedClaims(['עם רטינול וויטמין C'], SRC).length > 0, 'contents are caught');
assert.ok(findUngroundedClaims(['נתאים יחד את הטיפול בדיוק לעור שלך'], SRC).length > 0, 'a promised personalisation nobody wrote is caught');

// ── 4. retry once, then refuse ─────────────────────────────────────────────
{
  const seen: (string | null)[] = [];
  const out = await withClaimsGuard(async (c) => { seen.push(c); return { text: 'מזמינה אותך לקבוע תור.' }; }, (r) => [r.text], SRC);
  assert.equal(seen.length, 1, 'a clean first draft costs one call');
  assert.equal(out.text, 'מזמינה אותך לקבוע תור.');
}
{
  const seen: (string | null)[] = [];
  const out = await withClaimsGuard(async (c) => { seen.push(c); return { text: c ? 'מזמינה אותך לקבוע תור.' : 'מרגישים רק עקצוץ קל.' }; }, (r) => [r.text], SRC);
  assert.equal(seen.length, 2, 'a flagged draft gets exactly one retry');
  assert.ok(seen[1] && seen[1].includes('עקצוץ'), 'and the retry names the offending words');
  assert.ok(!/עקצוץ/.test(out.text), 'the retried text is what is returned');
}
{
  let calls = 0;
  await assert.rejects(
    () => withClaimsGuard(async () => { calls++; return { text: 'מרגישים רק עקצוץ קל.' }; }, (r) => [r.text], SRC),
    (e: any) => e instanceof UngroundedClaimsError && /בהגדרות|תיאור/.test(e.message) && !/claim|guard|regex/i.test(e.message) && e.claims.length > 0,
  );
  assert.equal(calls, 2, 'it never loops: two attempts, then it refuses');
}

// ── 5. the typo ───────────────────────────────────────────────────────────
assert.equal(fixHebrewSlips('לא כשמתאימים אותו אלייך'), 'לא כשמתאימים אותו אליך');
assert.equal(fixHebrewSlips('זה עלייך'), 'זה עליך');
assert.equal(fixHebrewSlips('אלייכם ועלייכן'), 'אליכם ועליכן');
assert.equal(fixHebrewSlips('הידיים שלך, ידייך'), 'הידיים שלך, ידייך', 'a correct plural suffix is left alone');
assert.equal(fixHebrewSlips('אליך ועליך'), 'אליך ועליך', 'correct forms are untouched');

// ── 6. wired in ───────────────────────────────────────────────────────────
assert.ok(code('lib/ai/postGenerator.ts').includes('withClaimsGuard('), 'the caption generator runs behind the backstop');
assert.ok(code('lib/ai/creativeDirector.ts').includes('withClaimsGuard('), 'the AI fill runs behind it');
assert.ok(code('app/api/marketing/reel/route.ts').includes('withClaimsGuard('), 'the reel script runs behind it');
assert.ok(code('lib/ai/postGenerator.ts').includes('fixHebrewSlips('), 'generated Hebrew is spell-fixed');

console.log('claims: ok');
