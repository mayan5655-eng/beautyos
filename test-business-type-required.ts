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
assert.ok(/\{\(!settings\.business_tax_status\|\|taxStatusUnconfirmed\(settings\)\)&&\(/.test(block), 'shown when no type, or a type she never confirmed');
assert.ok(/openSetupTab\("general"\)/.test(block), 'links to the setting (העסק שלי / general)');
assert.ok(/התשלום עצמו יירשם כרגיל/.test(block), 'says the payment still goes through');
// The type field lives in the general tab, so the link lands on it.
const general = app.indexOf('setEditSettings({...editSettings,business_tax_status:o.k,');
assert.ok(general > 0, 'the setting exists in Settings');

// The live column defaults to 'exempt': "chosen" is a separate stamp, and the app degrades to the old check without it.
const m = app.match(/const taxStatusUnconfirmed = \(s\) => (.*);/);
assert.ok(m, 'taxStatusUnconfirmed exists');
const taxStatusUnconfirmed = new Function('s', `return ${m![1]}`) as (s: unknown) => boolean;
assert.equal(taxStatusUnconfirmed({ business_tax_status: 'exempt' }), false, 'before the migration (no key): not unconfirmed');
assert.equal(taxStatusUnconfirmed({ business_tax_status: 'exempt', business_tax_status_set_at: null }), true, 'after it, unstamped: unconfirmed');
assert.equal(taxStatusUnconfirmed({ business_tax_status: 'exempt', business_tax_status_set_at: '2026-10-23T10:00:00Z' }), false, 'stamped: confirmed');
assert.ok(/business_tax_status:o\.k,business_tax_status_set_at:new Date\(\)\.toISOString\(\)/.test(app), 'tapping a type in Settings stamps it');
assert.ok(/business_tax_status: data\.business_tax_status, business_tax_status_set_at: new Date\(\)\.toISOString\(\)/.test(ob), 'onboarding stamps it');
const cols = rd('lib/settingsColumns.ts');
assert.ok(/'business_tax_status_set_at',/.test(cols), 'the stamp is a writable column');
const save = rd('app/api/settings/save/route.ts');
assert.ok(/OPTIONAL_COLUMNS = \['business_tax_status_set_at'\]/.test(save) && /withoutOptional\(toWrite\)/.test(save), 'a save without the migration retries without the stamp');
assert.ok(/for \(const key of OPTIONAL_COLUMNS\) delete reduced\[key\]/.test(save), 'and so does the onboarding insert');
const sql = rd('supabase/migrations/add_business_tax_status_set_at.sql');
assert.ok(/add column if not exists business_tax_status_set_at timestamptz/.test(sql) && !/drop/i.test(sql.replace(/drops nothing/g, '')), 'migration only adds');

console.log('business type required: all checks passed');
