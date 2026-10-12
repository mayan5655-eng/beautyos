// Two defects from the legal review (2026-10-07) that are plain code/copy mistakes, not legal questions:
//  - the CSV export said it exports CLIENTS ("ייצוא לקוחות") but writes PAYMENTS, into a file named with the old brand;
//  - sign-up did not point to the terms or the privacy policy, which both exist and say that using the service is agreeing to them.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('./app/beautyos.jsx', import.meta.url), 'utf8');
const fn = app.slice(app.indexOf('handleExportCSV'), app.indexOf('handleExportCSV') + 2500);
assert.ok(/receipts|payment|שולם|amount/i.test(fn), 'the export really is of payments');
assert.ok(!/ייצוא לקוחות/.test(app), 'nothing calls the payments export "export clients"');
assert.ok(/ייצוא תשלומים \(CSV\)/.test(app) && /aria-label="ייצוא תשלומים לקובץ CSV"/.test(app), 'it says what it exports');
assert.ok(/kalmea_payments_\$\{today\}\.csv/.test(app) && !/beautyos_\$\{today\}\.csv/.test(app), 'and the file carries the current brand');

const signup = readFileSync(new URL('./app/signup/page.tsx', import.meta.url), 'utf8');
assert.ok(/href="\/terms"/.test(signup) && /href="\/privacy"/.test(signup), 'sign-up links the terms and the privacy policy');
assert.ok(/בהרשמה את מאשרת את/.test(signup), 'in her words (feminine)');
assert.ok(/rel="noreferrer"/.test(signup) && /target="_blank"/.test(signup), 'in a new tab: she must not lose the form');
for (const page of ['app/terms/page.tsx', 'app/privacy/page.tsx']) assert.ok(readFileSync(new URL(`./${page}`, import.meta.url), 'utf8').length > 500, `${page} exists`);

console.log('legal copy: ok');
