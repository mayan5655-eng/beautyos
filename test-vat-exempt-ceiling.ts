// test-vat-exempt-ceiling.ts
//
// תקרת עוסק פטור (lib/vatExemptCeiling.ts): a gentle notice from about 80% of the yearly ceiling and again past it, for
// an exempt dealer only, worded as an estimate that sends her to her accountant. The ceiling is ONE constant.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { exemptCeilingWarning, VAT_EXEMPT_CEILING_NIS, VAT_EXEMPT_WARN_RATIO, VAT_EXEMPT_CEILING_CHECKED_FOR_YEAR } from './lib/vatExemptCeiling.ts';

let passed = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); passed++; };
const eq = (a: unknown, b: unknown, m: string) => { assert.deepEqual(a, b, m); passed++; };

eq(VAT_EXEMPT_CEILING_NIS, 120_000, 'the value in use (marked לבדוק in the source)');
eq(VAT_EXEMPT_WARN_RATIO, 0.8, 'about 80%');
ok(VAT_EXEMPT_CEILING_CHECKED_FOR_YEAR >= 2025, 'the year it was taken for is recorded');
const src = readFileSync('lib/vatExemptCeiling.ts', 'utf8');
ok(/VAT_EXEMPT_CEILING_NIS = 120_000; \/\/ לבדוק/.test(src), 'the constant carries the "לבדוק" mark');
ok(/CHANGES/.test(src) && /every January/.test(src), 'and the comment says it changes yearly and must be verified');

// Only an exempt dealer.
eq(exemptCeilingWarning({ status: 'licensed', yearToDate: 500_000 }), null, 'a licensed dealer: nothing');
eq(exemptCeilingWarning({ status: 'company', yearToDate: 500_000 }), null, 'a company: nothing');
eq(exemptCeilingWarning({ status: null, yearToDate: 500_000 }), null, 'no registration chosen: nothing (the screen asks first)');

// Thresholds.
eq(exemptCeilingWarning({ status: 'exempt', yearToDate: 0 }), null, 'a new business: nothing');
eq(exemptCeilingWarning({ status: 'exempt', yearToDate: 'abc' }), null, 'garbage: nothing');
eq(exemptCeilingWarning({ status: 'exempt', yearToDate: 95_999 }), null, 'just under 80%: nothing');
const near = exemptCeilingWarning({ status: 'exempt', yearToDate: 96_000 })!;
ok(near && near.level === 'near' && near.pct === 80, 'exactly 80%: the soft notice');
const near99 = exemptCeilingWarning({ status: 'exempt', yearToDate: 119_999 })!;
ok(near99.level === 'near' && near99.pct === 99, '99.99% is still "near", and never rounds up to 100');
const over = exemptCeilingWarning({ status: 'exempt', yearToDate: 120_000 })!;
ok(over.level === 'over' && over.pct === 100, 'exactly at the ceiling: the second notice');
ok(exemptCeilingWarning({ status: 'exempt', yearToDate: 150_000 })!.level === 'over', 'past it: still the second notice');
ok(exemptCeilingWarning({ status: 'exempt', yearToDate: 80, ceiling: 100 })!.level === 'near', 'the ceiling can be passed in (one place for the default)');

// Copy: an estimate, the accountant, feminine, no dashes.
for (const w of [near, near99, over]) {
  const all = w.title + ' ' + w.text;
  ok(/הערכה/.test(all), 'says it is an estimate');
  ok(/רואה החשבון/.test(all), 'sends her to the accountant');
  ok(!/[–—]/.test(all), 'no en or em dashes');
  ok(!/ - /.test(all), 'no hyphen used as a dash');
  ok(all.includes('₪120,000'), 'prints the ceiling it used, so a stale value is visible');
  ok(/מתעדכן מדי שנה/.test(all), 'and says it changes yearly');
}
ok(/את מתקרבת/.test(near.title), 'feminine second person');
ok(/עברת/.test(over.title), 'feminine second person');
ok(over.text.includes('₪120,000, מעל התקרה') || over.text.includes('מעל התקרה'), 'over: says it is above');

// The screen: exempt only, this year only, from the yearly total it already shows.
const app = readFileSync('app/beautyos.jsx', 'utf8');
ok(app.includes('const ceilingWarning = taxYear===new Date().getFullYear() ? exemptCeilingWarning({ status, yearToDate: yearGross }) : null;'), 'the income tab computes it from the year-to-date total');
ok(app.includes('data-testid="exempt-ceiling"'), 'and renders it');

// ONE constant: no other file hard-codes the ceiling.
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  if (['node_modules', '.next', '.git'].includes(f)) return [];
  return statSync(p).isDirectory() ? walk(p) : /\.(js|jsx|ts|tsx)$/.test(f) ? [p] : [];
});
const others = [...walk('app'), ...walk('lib')].filter((p) => !p.endsWith('vatExemptCeiling.ts') && /120[_,]?000/.test(readFileSync(p, 'utf8')) && /פטור|exempt/i.test(readFileSync(p, 'utf8')) && /תקר|ceiling/i.test(readFileSync(p, 'utf8')));
eq(others, [], 'the ceiling lives in one place');

console.log(`vat exempt ceiling: passed ${passed} failed 0`);
