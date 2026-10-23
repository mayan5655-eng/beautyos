// test-business-type-required.ts
//
// Owner's decision 2026-10-23: the business type (פטור / מורשה / חברה) is a required onboarding step for new businesses, and the
// till warns an existing business that has not chosen one, with a way to the setting, without blocking the payment. Source checks:
// the onboarding page and the till are client components with no harness to render them here.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rd = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n');

const ob = rd('app/onboarding/page.tsx');
assert.ok(/if \(step === 2 && !data\.business_tax_status\) \{\s*setError\(/.test(ob), '"הבא" on step 2 stops without a business type');
assert.ok(/!\(step === 2 && !data\.business_tax_status\)/.test(ob), 'no "דלגי" on step 2 until a type is chosen');
assert.ok(/if \(!data\.business_tax_status\) \{\s*setStep\(2\)/.test(ob), 'finish() sends an old draft back to step 2');
assert.ok(!/אפשר לדלג ולבחור אחר כך/.test(ob), 'the old "you can skip" hint is gone');
assert.ok(/business_tax_status: data\.business_tax_status/.test(ob), 'the choice is still saved');

const app = rd('app/beautyos.jsx');
const cashier = app.indexOf('title="קופה — תשלום חדש"');
assert.ok(cashier > 0);
const warn = app.indexOf('data-testid="cashier-tax-warning"', cashier);
assert.ok(warn > cashier && warn - cashier < 1500, 'the warning sits at the top of the till');
const block = app.slice(cashier, warn + 1500);
assert.ok(/\{!settings\.business_tax_status&&\(/.test(block), 'shown only when no type was chosen');
assert.ok(/openSetupTab\("general"\)/.test(block), 'links to the setting (העסק שלי / general)');
assert.ok(/התשלום עצמו יירשם כרגיל/.test(block), 'says the payment still goes through');
// The type field lives in the general tab, so the link lands on it.
const general = app.indexOf('setEditSettings({...editSettings,business_tax_status:o.k})');
assert.ok(general > 0, 'the setting exists in Settings');

console.log('business type required: all checks passed');
