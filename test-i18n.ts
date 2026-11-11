// test-i18n.ts
//
// Languages (lib/i18n, 2026-11-11): Hebrew, Arabic, English.
//   1. The setting: settings.branding.language, Hebrew when unset or unknown, RTL for Hebrew and Arabic, LTR for English.
//   2. tr(): the Hebrew is the key, a miss is the Hebrew, placeholders filled.
//   3. The health declaration and the other client forms: every template translated item for item, and what is STORED
//      is the Hebrew option whatever language the client read.
//   4. The /form page has its own language picker, opening in the business's language.
//   5. Every string the public pages and the owner's app look up has an Arabic and an English translation, with the
//      same placeholders.
//   6. The setting is on the settings screen, saved in branding, and reaches the public pages.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LANGS, normalizeLang, dirOf, langOfSettings, localeOf, translate, makeT, speechLangOf } from './lib/i18n/core.ts';
import { trWith, tr, trv, setActiveLang, uiDir } from './lib/i18n/tr.ts';
import { FORM_DICT } from './lib/i18n/dict/form.ts';
import { FORM_TRANSLATIONS, itemText, formTitle, formIntro } from './lib/i18n/formTemplatesI18n.ts';
import { FORMS, isSection, normalizeQuestion, answersToStore, isFlagged, type QuestionObject } from './lib/formTemplates.ts';
import { resolveBranding } from './lib/branding.js';
import { mergeStoredBags } from './lib/settingsColumns.ts';
import { readRawSource } from './scripts/test-source-view.mjs';
import { collect, SURFACES } from './scripts/i18n-extract.mjs';

const SURFACE_FILES = (s: 'public' | 'owner'): string[] => (SURFACES as any)[s].files;

const raw = (f: string): string => String(readRawSource(f)).replace(/\r\n/g, '\n');
const json = (f: string) => JSON.parse(fs.readFileSync(f, 'utf8'));
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; };

// ── 1. The setting ──
ok('three languages, Hebrew first and the default', () => {
  assert.deepEqual([...LANGS], ['he', 'ar', 'en']);
  for (const v of [undefined, null, '', 'fr', 42, {}, 'xx-YY']) assert.equal(normalizeLang(v), 'he');
  assert.equal(normalizeLang('EN'), 'en');
  assert.equal(normalizeLang(' ar-IL '), 'ar');
});
ok('direction: Hebrew and Arabic RTL, English LTR', () => {
  assert.equal(dirOf('he'), 'rtl');
  assert.equal(dirOf('ar'), 'rtl');
  assert.equal(dirOf('en'), 'ltr');
});
ok('the business language lives in settings.branding.language', () => {
  assert.equal(langOfSettings({ branding: { language: 'ar' } }), 'ar');
  assert.equal(langOfSettings({ branding: { language: 'en' } }), 'en');
  assert.equal(langOfSettings({ branding: {} }), 'he', 'unset: Hebrew, so nothing changes for an existing business');
  assert.equal(langOfSettings({ branding: null }), 'he');
  assert.equal(langOfSettings(null), 'he');
  assert.equal(langOfSettings({ branding: { language: 'de' } }), 'he');
});
ok('Arabic keeps Western digits', () => {
  assert.match(new Intl.NumberFormat(localeOf('ar')).format(1234), /1.?234/);
});
ok('resolveBranding carries the language to every public page', () => {
  assert.equal(resolveBranding({ branding: { language: 'en' } }).language, 'en');
  assert.equal(resolveBranding({}).language, 'he');
});
ok('saving keeps the language next to the rest of branding', () => {
  const merged: any = mergeStoredBags({ branding: { language: 'ar' } } as any, { branding: { logo_url: 'x', booking_rules: { min_notice_hours: 2 } } } as any);
  assert.equal(merged.branding.language, 'ar');
  assert.equal(merged.branding.logo_url, 'x', 'and nothing else in branding is lost');
});

// ── 2. tr() ──
ok('the Hebrew is the key; a miss shows the Hebrew', () => {
  const table = { 'שמירה': 'Save', 'נשארו {0} שאלות': '{0} questions left' };
  assert.equal(trWith(table, 'שמירה'), 'Save');
  assert.equal(trWith(table, 'נשארו {0} שאלות', [3]), '3 questions left');
  assert.equal(trWith(table, 'משהו אחר'), 'משהו אחר');
  assert.equal(trWith(null, 'שלום {0}', ['רונית']), 'שלום רונית');
  assert.equal(trWith(table, 'תבנית {שם}'), 'תבנית {שם}', 'a Hebrew {token} in a template is left alone');
});
ok('the owner app: one active language, Hebrew passes through', () => {
  setActiveLang('he', null);
  assert.equal(tr('שמירה'), 'שמירה');
  assert.equal(uiDir(), 'rtl');
  setActiveLang('en', { 'שמירה': 'Save', 'כן': 'Yes' });
  assert.equal(tr('שמירה'), 'Save');
  assert.equal(trv('כן'), 'Yes', 'a stored Hebrew value that is a product string is shown translated');
  assert.equal(trv('רונית כהן'), 'רונית כהן', 'her client\'s name is not');
  assert.equal(trv(42), 42);
  assert.equal(uiDir(), 'ltr');
  setActiveLang('he', null);
});
ok('dictionary helpers', () => {
  for (const [k, e] of Object.entries(FORM_DICT)) for (const l of LANGS) {
    assert.ok(e[l] && e[l].trim(), `form dict ${k}.${l}`);
    assert.equal(placeholders(e[l]), placeholders(e.he), `form dict ${k}.${l} placeholders`);
  }
  assert.equal(makeT(FORM_DICT, 'en')('hello', { name: 'Dana' }), 'Hi Dana 👋');
  assert.equal(translate(FORM_DICT, 'ar', 'no-such-key'), 'no-such-key');
});

// ── 3. The forms, translated item for item ──
ok('every template has an Arabic and an English version of the same shape', () => {
  for (const lang of ['ar', 'en'] as const) {
    const tx = FORM_TRANSLATIONS[lang];
    assert.deepEqual(Object.keys(tx).sort(), Object.keys(FORMS).sort(), `${lang}: one per template`);
    for (const [key, tpl] of Object.entries(FORMS)) {
      const t = tx[key];
      assert.ok(t.title && !/[֐-׿]/.test(t.title), `${lang} ${key}: a title, in ${lang}`);
      assert.equal(!!t.intro, !!tpl.intro, `${lang} ${key}: an intro where the Hebrew has one`);
      assert.equal(t.questions.length, tpl.questions.length, `${lang} ${key}: same number of items`);
      tpl.questions.forEach((item, i) => {
        const li = t.questions[i];
        const text = typeof li === 'string' ? li : li.q;
        assert.ok(text && !/[֐-׿]/.test(text), `${lang} ${key}[${i}] is translated`);
        if (isSection(item)) { assert.equal(typeof li, 'string', `${lang} ${key}[${i}] a heading is a heading`); return; }
        const q = normalizeQuestion(item) as QuestionObject;
        const opts = typeof li === 'string' ? undefined : li.options;
        if (q.options) assert.equal(opts?.length, q.options.length, `${lang} ${key}[${i}] same number of options`);
        else assert.equal(opts, undefined, `${lang} ${key}[${i}] no options where there are none`);
        if (q.placeholder) assert.ok(typeof li !== 'string' && li.placeholder, `${lang} ${key}[${i}] the placeholder is translated`);
      });
    }
  }
});
ok('the client reads her language; the record keeps the Hebrew option', () => {
  const tpl = FORMS.skin_anamnesis;
  const age = tpl.questions.findIndex((x) => typeof x === 'object' && (x as QuestionObject).q === 'מה טווח הגיל שלך?');
  const words = itemText('skin_anamnesis', 'en', age, tpl.questions[age]);
  assert.equal(words.text, 'What is your age range?');
  assert.equal(words.optionLabel('20 עד 29'), '20 to 29');
  assert.equal(itemText('skin_anamnesis', 'ar', age, tpl.questions[age]).optionLabel('60 ומעלה'), '60 فما فوق');
  // The page stores the option it was given (the Hebrew one), so the same picks store the same string in any language.
  assert.deepEqual(answersToStore(tpl, { [age]: '20 עד 29' }), { [String(age)]: '20 עד 29' });
  assert.equal(itemText('general', 'he', 0, FORMS.general.questions[0]).text, FORMS.general.questions[0], 'Hebrew is the template itself');
  assert.equal(formTitle('general', 'en'), 'General health declaration');
  assert.equal(formTitle('general', 'he'), FORMS.general.title);
  assert.equal(formIntro('skin_anamnesis', 'ar'), FORM_TRANSLATIONS.ar.skin_anamnesis.intro);
});
ok('a "none" written in Arabic or English is not flagged to the owner', () => {
  const meds: QuestionObject = { q: 'x', type: 'text', flag: true };
  for (const none of ['אין', 'none', 'None', 'لا يوجد', '"لا يوجد"', 'no']) assert.equal(isFlagged(meds, none), false, none);
  assert.equal(isFlagged(meds, 'Roaccutane'), true);
});

// ── 4. /form: its own picker ──
ok('the health declaration has a language picker of its own, opening in the business language', () => {
  const page = raw('app/form/page.jsx');
  assert.match(page, /<LangPicker value=\{shownLang\} onChange=\{chooseLang\}/, 'a picker on the form');
  assert.match(page, /setLang\(isLang\(asked\) \? asked : normalizeLang\(data\.language\)\)/, '?lang= first, else the business language');
  assert.match(page, /url\.searchParams\.set\("lang", l\)/, 'her choice survives a reload');
  assert.match(page, /dir=\{dir\} lang=\{shownLang\}/, 'the page turns LTR for English');
  assert.match(page, /optionLabel\(opt\)/, 'options are shown translated');
  assert.match(page, /onClick=\{\(\)=>setAnswer\(i, opt\)\}/, '...and stored as the Hebrew option');
  assert.match(raw('app/api/forms/route.ts'), /language = langOfSettings\(s\);/, '/api/forms returns the business language');
});

// ── 5. Translations complete ──
for (const surface of ['public', 'owner'] as const) {
  ok(`${surface}: every key has Arabic and English with the same placeholders`, () => {
    const keys = collect(surface);
    const ar = json(`lib/i18n/strings/${surface}.ar.json`);
    const en = json(`lib/i18n/strings/${surface}.en.json`);
    if (surface === 'owner' && Object.keys(en).length === 0) return; // not translated yet: the app stays Hebrew
    const missing = keys.filter((k) => !ar[k] || !en[k]);
    assert.deepEqual(missing.slice(0, 10), [], `${surface}: ${missing.length} keys without a translation (node scripts/i18n-extract.mjs ${surface} --missing)`);
    for (const k of keys) {
      assert.equal(placeholders(ar[k]), placeholders(k), `${surface} ar placeholders: ${k}`);
      assert.equal(placeholders(en[k]), placeholders(k), `${surface} en placeholders: ${k}`);
      // A CSS selector key is code; a quoted Hebrew word is one she or her client must type as is ('הסר', "מחיקה").
      const unquoted = en[k].replace(/(['"“”«»])[֐-׿\s]+\1|'[֐-׿\s]+'|"[֐-׿\s]+"|“[֐-׿\s]+”|«[֐-׿\s]+»/g, '');
      if (!/^[a-z]+\[/.test(k)) assert.ok(!/[֐-׿]/.test(unquoted), `${surface} en has no Hebrew left: ${k}`);
    }
  });
}

// ── 6. Wiring ──
ok('the setting is on the settings screen and saves to branding.language', () => {
  const app = raw('app/beautyos.jsx');
  assert.match(app, /data-testid="language-setting"/);
  assert.match(app, /branding:\{\.\.\.\(\(prev\?\.branding&&typeof prev\.branding==="object"\)\?prev\.branding:\{\}\),language:l\}/);
  assert.match(app, /applyOwnerLang\(devLangOverride\(\) \|\| savedLang\)/, 'the owner app follows the saved language');
  assert.match(raw('lib/i18n/ownerLang.ts'), /if \(process\.env\.NODE_ENV === 'production'\) return null;/, 'the override is development only');
});
ok('public pages speak the business language', () => {
  const slug = raw('app/[slug]/page.tsx');
  assert.match(slug, /const lang = typeof devLang === 'string' \? normalizeLang\(devLang\) : langOfSettings\(initialSettings\)/);
  assert.match(slug, /const devLang = process\.env\.VERCEL_ENV !== 'production' \?/, 'the ?lang= override never works on production');
  assert.equal((slug.match(/<LangProvider lang=\{lang\}>/g) || []).length, 2, 'both the landing page and the booking page');
  assert.match(raw('app/book/page.jsx'), /<LangProvider lang=\{lang\}>/);
  assert.match(raw('app/PublicChrome.tsx'), /dir=\{dirOf\(lang\)\} lang=\{lang\}/, 'the shared frame turns LTR for English');
  assert.match(raw('app/confirm/page.jsx'), /const tr = useTr\(lang\)/, 'the cancel page');
  assert.match(raw('app/api/confirm/route.ts'), /language: langOfSettings\(st\)/);
  assert.match(raw('app/review/page.jsx'), /const tr = useTr\(lang\)/, 'the review page');
  assert.match(raw('app/c/[token]/ClientPageView.tsx'), /const tr = trFor\(lang\)/, 'the client page');
});

ok('voice commands listen and understand in her language', () => {
  const app = raw('app/beautyos.jsx');
  assert.match(app, /rec\.lang = speechLangOf\(getActiveLang\(\)\)/, 'the microphone listens in the system language');
  assert.ok(!/rec\.lang = "he-IL"/.test(app), 'never fixed to Hebrew');
  assert.match(app, /JSON\.stringify\(\{ transcript, today, lang: getActiveLang\(\) \}\)/, 'and tells the server which language it heard');
  const route = raw('app/api/voice-intent/route.ts');
  assert.match(route, /const lang: Lang = normalizeLang\(body\?\.lang\)/);
  assert.match(route, /\$\{languageNote\}/, 'the model is told the language, and to ask its question in it');
});
ok('speech languages', () => {
  assert.deepEqual(['he', 'ar', 'en'].map((l) => speechLangOf(l as any)), ['he-IL', 'ar-IL', 'en-US']);
});

ok('every file that calls tr() / trv() has them in scope', () => {
  // A .jsx file is not type-checked: a tr() with no import is a crash on the first render, not a build error.
  const files = [...new Set([...SURFACE_FILES('public'), ...SURFACE_FILES('owner'), 'app/form/page.jsx'])];
  for (const f of files) {
    const s = raw(f);
    // '@/lib/i18n/tr' from app/, './i18n/tr.ts' from lib/
    if (/\btr\(/.test(s)) assert.ok(/import \{[^}]*\btr\b[^}]*\} from ["'](@\/lib|\.{1,2}(\/\.\.)*)\/i18n\/tr(\.ts)?["']|import \{[^}]*\btr\b[^}]*\} from ["']@\/lib\/i18n\/tr["']|\bconst tr = |\bfunction tr\(|\bconst T = /.test(s) || !/[^.\w]tr\(/.test(s), `${f}: tr is imported or declared`);
    if (/[^.\w]trv\(/.test(s)) assert.match(s, /import \{[^}]*\btrv\b[^}]*\} from ["'](@\/lib|\.{1,2}(\/\.\.)*)\/i18n\/tr(\.ts)?["']/, `${f}: trv is imported`);
    if (/useTr\(/.test(s)) assert.match(s, /import \{[^}]*\buseTr\b[^}]*\} from ["']@\/lib\/i18n\/useTr["']/, `${f}: useTr is imported`);
  }
});

console.log(`i18n: ${n} checks ok`);
