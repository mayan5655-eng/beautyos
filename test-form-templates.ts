// test-form-templates.ts
//
// lib/formTemplates.ts: the client forms, shared by /form (what she signs) and the owner's "צפייה בתשובות" sheet.
//   1. The seven templates that lived in app/form/page.jsx are unchanged, word for word and in order, against a frozen
//      copy taken from main on 2026-11-04 (test-fixtures/form-templates-before-2026-11-04.json). A changed question
//      would read every signed answer after it against the wrong question.
//   2. Typed questions: required/optional, progress, multi with "אחר" and an exclusive "אין", what gets stored, and
//      what the POST accepts.
//   3. Old index-keyed answers render against their template; an unknown form_type falls back to raw pairs.
//   4. skin_anamnesis: its shape, its copy rules, cosmetics only, mentioned in help for cosmetics and not for nails.
//   5. The public route still returns no answers and no signature; the owner reads them with her own client.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  FORMS, YES, NO, MULTI_SEP, FORM_SKIN_TYPES, templateFor, isSection, normalizeQuestion, isAnswered, showsNote,
  missingRequired, progressOf, toggleMulti, splitMulti, answersToStore, isStorableAnswers, answerRows, isFlagged,
  type QuestionObject,
} from './lib/formTemplates.ts';
import { helpSectionsFor } from './lib/helpSections.ts';

const src = (f: string) => fs.readFileSync(f, 'utf8');
const frozen = JSON.parse(src('test-fixtures/form-templates-before-2026-11-04.json')) as Record<string, { title: string; questions: string[] }>;

// ── 1. Existing templates, unchanged ──
{
  const oldKeys = Object.keys(frozen);
  assert.deepEqual(oldKeys, ['general', 'nails_general', 'nails_media', 'plasma', 'device', 'laser', 'peel'], 'the frozen copy is the seven templates');
  assert.deepEqual(Object.keys(FORMS).slice(0, oldKeys.length), oldKeys, 'same keys, same order, new ones only after');
  for (const k of oldKeys) {
    assert.equal(FORMS[k].title, frozen[k].title, `${k}: title`);
    assert.deepEqual(FORMS[k].questions, frozen[k].questions, `${k}: every question, same text, same order`);
    assert.ok(FORMS[k].questions.every((q) => typeof q === 'string'), `${k}: still plain yes/no strings`);
    assert.equal(FORMS[k].intro, undefined, `${k}: no intro added`);
  }
  const page = src('app/form/page.jsx');
  assert.ok(!/const FORMS\s*=/.test(page), 'the page no longer carries its own copy');
  assert.ok(page.includes('from "@/lib/formTemplates"') && page.includes('templateFor(formData.form_type)'), 'the page reads the shared templates');
  assert.ok(page.includes('answers: answersToStore(formTemplate, answers)'), 'the page sends the cleaned answers');
  assert.equal(templateFor('nope'), null);
  assert.equal(templateFor('constructor'), null, 'no prototype keys');
  assert.equal(templateFor(undefined), null);
}

// ── 2. Typed questions ──
{
  assert.deepEqual(normalizeQuestion('שאלה?'), { q: 'שאלה?', type: 'yesno' }, 'a string is a required yes/no');
  assert.equal(normalizeQuestion({ section: 'כותרת' }), null);
  assert.ok(isSection({ section: 'x' }) && !isSection('x') && !isSection({ q: 'x', type: 'text' }));

  const tpl = {
    title: 't',
    questions: [
      { section: 'א' },
      'כן או לא?',
      { q: 'בחירה', type: 'choice' as const, options: ['1', '2'] },
      { q: 'כמה', type: 'multi' as const, options: ['א', 'ב', 'אחר', 'אין'], other: 'אחר', none: 'אין' },
      { q: 'טקסט', type: 'text' as const },
      { q: 'לא חובה', type: 'longtext' as const, optional: true },
    ],
  };
  assert.deepEqual(missingRequired(tpl, {}), [1, 2, 3, 4], 'a heading and an optional question never block');
  assert.deepEqual(progressOf(tpl, {}), { done: 0, total: 4, pct: 0 }, 'the bar counts required questions only');
  const a: Record<string, string> = { 1: NO, 2: '2', 3: 'א, אחר', 4: '   ', 5: '' };
  assert.deepEqual(missingRequired(tpl, a), [4], 'whitespace is not an answer');
  assert.deepEqual(progressOf(tpl, a), { done: 3, total: 4, pct: 75 });
  a[4] = 'משהו';
  assert.deepEqual(missingRequired(tpl, a), []);
  assert.equal(progressOf(tpl, a).pct, 100);
  assert.equal(progressOf({ title: 'x', questions: [{ section: 'רק כותרת' }] }, {}).pct, 100, 'no required questions is not NaN');

  const m = tpl.questions[3] as QuestionObject;
  assert.equal(toggleMulti(m, '', 'ב'), 'ב');
  assert.equal(toggleMulti(m, 'ב', 'א'), 'א, ב', 'stored in the template order, whatever the tap order');
  assert.equal(toggleMulti(m, 'א, ב', 'א'), 'ב', 'a second tap removes it');
  assert.equal(toggleMulti(m, 'א, ב', 'אין'), 'אין', '"אין" clears the rest');
  assert.equal(toggleMulti(m, 'אין', 'ב'), 'ב', 'anything else clears "אין"');
  assert.equal(toggleMulti(m, 'אין', 'אין'), '', '"אין" toggles off too');
  assert.deepEqual(splitMulti('א, ב'), ['א', 'ב']);
  assert.ok(isAnswered(m, { 3: 'א' }, 3) && !isAnswered(m, { 3: '' }, 3));

  assert.ok(showsNote('x', { 0: YES }, 0) && !showsNote('x', { 0: NO }, 0), 'yes/no: "כן" opens the note');
  assert.ok(showsNote(m, { 3: 'א, אחר' }, 3) && !showsNote(m, { 3: 'א' }, 3), 'multi: "אחר" opens the note');
  assert.ok(!showsNote(tpl.questions[2], { 2: '1' }, 2), 'a choice has no note');

  const stored = answersToStore(tpl, { 1: NO, '1_note': 'נשאר מ"כן" קודם', 2: '1', 3: 'א, אחר', '3_note': '  משהו אחר ', 4: '  טקסט  ', 5: '' });
  assert.deepEqual(stored, { 1: NO, 2: '1', 3: 'א, אחר', '3_note': 'משהו אחר', 4: 'טקסט' }, 'trimmed, empty dropped, a stale note dropped');
  assert.ok(Object.keys(stored).every((k) => typeof k === 'string'), 'keys stay index strings');
  assert.deepEqual(answersToStore(FORMS.general, { 0: YES, '0_note': 'חודש שלישי', 1: NO }), { 0: YES, '0_note': 'חודש שלישי', 1: NO }, 'an old template stores the same keys as before');

  // The POST check.
  assert.ok(isStorableAnswers({}));
  assert.ok(isStorableAnswers({ 0: 'כן', '0_note': 'x', 12: 'לא' }), 'the shape the old page sent');
  assert.ok(isStorableAnswers(stored));
  assert.ok(!isStorableAnswers([]), 'not an array');
  assert.ok(!isStorableAnswers(null));
  assert.ok(!isStorableAnswers({ 0: { nested: true } }), 'no nested objects');
  assert.ok(!isStorableAnswers({ 0: 1 }), 'no numbers');
  assert.ok(!isStorableAnswers({ name: 'x' }), 'no other keys');
  assert.ok(!isStorableAnswers({ '0_other': 'x' }));
  assert.ok(!isStorableAnswers({ 1234: 'x' }));
  const route = src('app/api/forms/route.ts');
  assert.ok(route.includes("import { isStorableAnswers } from '@/lib/formTemplates'") && route.includes('if (!isStorableAnswers(answers))'), 'the route uses the shared check');
  assert.ok(route.includes('const MAX_ANSWERS_CHARS = 20_000;'), 'the size cap is unchanged');
  assert.ok(route.indexOf('isStorableAnswers(answers)') < route.indexOf(".from('forms')\n      .update"), 'checked before anything is written');
}

// ── 3. Old answers render against their template ──
{
  const rows = answerRows('general', { 0: 'כן', '0_note': 'חודש שלישי', 1: 'לא', 2: 'לא' });
  assert.equal(rows.length, frozen.general.questions.length, 'one row per question, no extra raw rows');
  assert.ok(rows.every((r) => r.kind === 'question'), 'an old template has no headings');
  const [r0, r1, r3] = [rows[0], rows[1], rows[3]];
  assert.ok(r0.kind === 'question' && r0.n === 1 && r0.q === frozen.general.questions[0] && r0.answer === 'כן' && r0.note === 'חודש שלישי' && r0.flag, '"כן" is flagged, with its note');
  assert.ok(r1.kind === 'question' && r1.answer === 'לא' && !r1.flag);
  assert.ok(r3.kind === 'question' && r3.answer === '' && !r3.flag, 'an unanswered question shows empty, never invented');

  const raw = answerRows('retired_type', { 1: 'לא', 0: 'כן', '0_note': 'x', 10: 'כן' });
  assert.deepEqual(raw, [
    { kind: 'raw', key: '0', value: 'כן' }, { kind: 'raw', key: '0_note', value: 'x' },
    { kind: 'raw', key: '1', value: 'לא' }, { kind: 'raw', key: '10', value: 'כן' },
  ], 'an unknown template shows the raw pairs, in index order');
  assert.deepEqual(answerRows('general', null).filter((r) => r.kind === 'raw'), [], 'no data: no raw rows, no throw');
  assert.deepEqual(answerRows('nope', 'garbage'), []);
  const extra = answerRows('nails_media', { 0: 'כן', 7: 'מפתח לא מוכר' });
  assert.deepEqual(extra.at(-1), { kind: 'raw', key: '7', value: 'מפתח לא מוכר' }, 'a key the template does not explain is still shown');
  assert.ok(answerRows('general', { 0: 5 }).some((r) => r.kind === 'question' && r.answer === '5'), 'a non-string value is shown, not dropped');

  const sa = FORMS.skin_anamnesis;
  const chronic = sa.questions.findIndex((q) => typeof q === 'object' && 'q' in q && q.q === 'האם יש לך מחלה כרונית?');
  const meds = sa.questions.findIndex((q) => typeof q === 'object' && 'q' in q && q.q.startsWith('אילו תרופות'));
  const typedRows = answerRows('skin_anamnesis', { [chronic]: 'סוכרת, אחר', [`${chronic}_note`]: 'אסתמה', [meds]: 'אין' });
  assert.equal(typedRows.filter((r) => r.kind === 'section').length, sa.questions.filter(isSection).length, 'headings come through');
  const cr = typedRows.find((r) => r.kind === 'question' && r.index === chronic);
  assert.ok(cr && cr.kind === 'question' && cr.answer === 'סוכרת, אחר' && cr.note === 'אסתמה' && cr.flag, 'a health multi is flagged, with its "אחר" text');
  const mr = typedRows.find((r) => r.kind === 'question' && r.index === meds);
  assert.ok(mr && mr.kind === 'question' && !mr.flag, '"אין" in a flagged text question is not flagged');
  assert.ok(!isFlagged(normalizeQuestion(sa.questions[chronic])!, 'אין'), '"אין" is not flagged');
  const numbers = typedRows.filter((r) => r.kind === 'question').map((r) => (r.kind === 'question' ? r.n : 0));
  assert.deepEqual(numbers, numbers.map((_, i) => i + 1), 'questions are numbered 1..n, headings skipped');
}

// ── 4. skin_anamnesis ──
{
  const sa = FORMS.skin_anamnesis;
  assert.equal(sa.title, 'אבחון עור ואנמנזה');
  const qs = sa.questions.filter((q) => !isSection(q)).map((q) => normalizeQuestion(q)!);
  assert.ok(qs.length >= 25 && qs.length <= 35, `25 to 35 questions (${qs.length})`);
  assert.deepEqual(sa.questions.filter(isSection).map((s) => s.section),
    ['פרטים כלליים', 'בריאות', 'אורח חיים', 'העור שלך', 'שגרת טיפוח', 'המטרות שלך', 'הצהרה']);
  assert.ok(isSection(sa.questions[0]), 'opens with a heading');

  const skin = src('app/beautyos.jsx').match(/const SKIN_TYPES = (\[[^\]]*\]);/);
  assert.ok(skin, 'SKIN_TYPES found in the app');
  assert.deepEqual(FORM_SKIN_TYPES, JSON.parse(skin![1]), 'the same skin types as the client card');
  const skinQ = qs.find((q) => q.q.startsWith('מה סוג העור'));
  assert.deepEqual(skinQ?.options, FORM_SKIN_TYPES);

  const byQ = (start: string) => qs.find((q) => q.q.startsWith(start))!;
  assert.deepEqual(byQ('האם יש לך מחלה כרונית').options, ['סוכרת', 'בלוטת התריס', 'לחץ דם', 'אוטואימונית', 'אחר', 'אין']);
  assert.equal(byQ('האם יש לך מחלה כרונית').type, 'multi');
  assert.deepEqual(byQ('מה מפריע לך').options, ['אקנה', 'פיגמנטציה', 'קמטים וקווי הבעה', 'אדמומיות', 'נקבוביות מורחבות', 'יובש', 'שומניות', 'רגישות', 'עיגולים כהים', 'אחר']);
  assert.equal(byQ('אילו תרופות').type, 'text');
  assert.equal(byQ('יש לך אלרגיות').type, 'text');
  assert.equal(byQ('מה היית רוצה').type, 'longtext');
  assert.ok(byQ('במה את עובדת').optional, 'occupation is optional');
  for (const start of ['האם את בהריון', 'האם נטלת רואקוטן', 'האם את נוטלת תרופות מדללות', 'האם את מקבלת טיפול הורמונלי', 'האם יש לך הרפס', 'האם יש לך נטייה להיצטלקות', 'האם יש לך קוצב לב']) {
    assert.equal(byQ(start).type, 'yesno', start);
  }
  assert.deepEqual(byQ('אני מצהירה').options, ['מאשרת'], 'the declaration is one required confirmation');
  assert.ok(!byQ('אני מצהירה').optional);

  for (const q of qs) {
    if (q.type === 'choice' || q.type === 'multi') assert.ok(q.options && q.options.length > 0, `${q.q}: has options`);
    if (q.type === 'multi') for (const o of q.options || []) assert.ok(!o.includes(MULTI_SEP.trim()), `${q.q}: a multi option never contains the separator (${o})`);
    if (q.other) assert.ok(q.options!.includes(q.other));
    if (q.none) assert.ok(q.options!.includes(q.none));
    assert.ok(!q.flag || q.type !== 'yesno', 'yes/no is flagged by its "כן" already');
  }
  // Copy rules: no em or en dash anywhere in the new form, and the client is addressed in the feminine.
  const allText = JSON.stringify(sa);
  assert.ok(!/[–—]/.test(allText), 'no em/en dashes');
  assert.ok(!/ אתה |שלךָ|עובד\?|מעשן\?/.test(allText), 'feminine second person');
  assert.ok(!/מרפא|מעלים|מבטיח|מובטח|קליני/.test(allText), 'no medical or result claims');

  // Cosmetics only, everywhere it is offered.
  const app = src('app/beautyos.jsx');
  assert.ok(app.includes('{key:"skin_anamnesis",label:"אבחון עור ואנמנזה",only:["cosmetics"]}'), 'FORM_TYPES: cosmetics only');
  const formTypeKeys = [...app.slice(app.indexOf('const FORM_TYPES = ['), app.indexOf('];', app.indexOf('const FORM_TYPES = ['))).matchAll(/\{key:"([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...formTypeKeys].sort(), Object.keys(FORMS).sort(), 'every template is offered and every offered form has a template');
  const help = (f: string[]) => helpSectionsFor(f).flatMap((s) => s.body).join('\n');
  assert.ok(help(['cosmetics']).includes('אבחון עור ואנמנזה'), 'help mentions it for cosmetics');
  assert.ok(help(['cosmetics', 'nails']).includes('אבחון עור ואנמנזה'));
  assert.ok(!help(['nails']).includes('אבחון עור'), 'the nails help never offers it');
  assert.ok(help(['cosmetics']).includes('צפייה בתשובות') && help(['nails']).includes('צפייה בתשובות'), 'both explain where the answers are');
}

// ── 5. Who can read the answers ──
{
  const route = src('app/api/forms/route.ts');
  assert.ok(route.includes("const SAFE_FIELDS = 'id, client_name, form_type, status';"), 'the public GET column list is unchanged');
  const get = route.slice(route.indexOf('export async function GET'), route.indexOf('export async function POST'));
  assert.ok(!/form_data|signature/.test(get), 'the public GET never names form_data or signature');
  assert.ok(get.includes('.select(`${SAFE_FIELDS}, tenant_id`)'), 'and reads only the safe columns');

  const sheet = src('app/FormAnswersSheet.jsx');
  assert.ok(sheet.includes("import { supabase } from './supabase'"), 'the owner reads with her own signed-in client');
  assert.ok(!/fetch\(/.test(sheet), 'never through the public route (no fetch at all)');
  assert.ok(/\.eq\('id', form\.id\)\s*\.eq\('tenant_id', tenantId\)/.test(sheet), 'one row, scoped to her tenant');
  assert.ok(sheet.includes("error.code === '42501'") && sheet.includes('form-answers-denied'), 'a column grant that blocks it is explained, not retried forever');

  const app = src('app/beautyos.jsx');
  const cols = app.match(/const FORM_LIST_COLUMNS = "([^"]+)";/);
  assert.ok(cols && !/form_data|signature/.test(cols[1]), 'the boot list reads no answers and no signature');
  assert.ok(app.includes('readAllRows(supabase, "forms", { columns: FORM_LIST_COLUMNS })'));
  assert.ok(app.includes('f.status==="signed"&&<button type="button" data-testid="form-view-answers" onClick={()=>setFormAnswersFor(f)}'), 'only a signed form offers the answers');
}

console.log('test-form-templates: all passed');
