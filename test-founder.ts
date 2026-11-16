// test-founder.ts
//
// "מנוי מייסדת" (lib/founder.ts, 2026-11-16): the admin marks a business free for life; it never closes and no billing path
// can charge it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isFounder, FOUNDER_PRICE, FOUNDER_LABEL_HE, founderConsentTextHe, FOUNDER_CONSENT_VERSION } from './lib/founder.ts';
import { planState } from './lib/planState.ts';
import { priceOf } from './lib/billing/service.ts';

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };
const read = (p: string) => fs.readFileSync(p, 'utf8').split('\r\n').join('\n');

ok('isFounder: active at price exactly 0, nothing else', () => {
  assert.equal(isFounder({ plan_status: 'active', plan_price: 0 }), true);
  assert.equal(isFounder({ plan_status: 'active', plan_price: '0.00' }), true, 'numeric(10,2) comes back as a string');
  assert.equal(isFounder({ plan_status: 'active', plan_price: null }), false, 'no agreed price is not free');
  assert.equal(isFounder({ plan_status: 'active', plan_price: '' }), false);
  assert.equal(isFounder({ plan_status: 'active' }), false);
  assert.equal(isFounder({ plan_status: 'active', plan_price: 349 }), false);
  assert.equal(isFounder({ plan_status: 'trial', plan_price: 0 }), false, 'extended back to trial = not a founder any more');
  assert.equal(isFounder({ plan_status: 'paused', plan_price: 0 }), false);
  assert.equal(isFounder(null), false);
  assert.equal(FOUNDER_LABEL_HE, 'מייסדת');
});

ok('a founder never closes, whatever her old trial date says', () => {
  const p = planState({ plan_status: 'active', plan_price: FOUNDER_PRICE, trial_ends_at: '2020-01-01T00:00:00Z' }, new Date('2030-01-01T00:00:00Z'));
  assert.equal(p.isBlocked, false);
  assert.equal(p.tone, 'none', 'and sees no trial banner');
});

ok('why the billing guard is needed: priceOf reads 0 as "no price" and would charge the launch price', () => {
  assert.ok(priceOf({ plan_price: 0, created_at: '2026-11-16T00:00:00Z' }) > 0);
});

ok('admin route: a "founder" action that writes active + price 0', () => {
  const r = read('app/api/admin/tenants/route.ts');
  assert.match(r, /const ACTIONS = \['extend', 'activate', 'pause', 'founder'\] as const/);
  assert.match(r, /action === 'founder'\) \{[\s\S]*?patch = \{ plan_status: 'active', plan_price: FOUNDER_PRICE \}/);
  assert.ok(!/\.delete\(/.test(r), 'still never deletes');
});

ok('admin panel: the button, the confirm question, and the price column says מייסדת', () => {
  const a = read('app/dashboard/admin/AdminClient.tsx');
  assert.match(a, /onClick=\{\(\) => run\(tenant\.id, 'founder'\)\}/);
  assert.match(a, /לסמן את \$\{label\} כמייסדת\?/);
  assert.match(a, /if \(Number\(value\) === FOUNDER_PRICE\) return FOUNDER_LABEL_HE/);
  assert.match(read('app/dashboard/admin/subscribers/SubscribersClient.tsx'), /r\.planPrice === 0 \? ` · \$\{FOUNDER_LABEL_HE\}`/);
});

ok('founder consent: add-ons only, no monthly charge, its own version', () => {
  const t = founderConsentTextHe();
  assert.match(t, /תוספות שאבחר בעצמי/);
  assert.match(t, /על המנוי עצמו אין חיוב/);
  assert.ok(!/בכל חודש/.test(t), 'never promises a monthly charge');
  assert.notEqual(FOUNDER_CONSENT_VERSION, 'billing-card-v3');
});

ok('billing routes: a founder may save a card (for add-ons), with her own consent; no plan price and no yearly switch', () => {
  const card = read('app/api/billing/card/route.ts');
  assert.match(card, /const price = founder \? 0 :/);
  assert.match(card, /consent_text: founder \? founderConsentTextHe\(\)/);
  assert.match(card, /consent_version: founder \? FOUNDER_CONSENT_VERSION/);
  const st = read('app/api/billing/status/route.ts');
  assert.match(st, /if \(founder\) out\.plan\.price = 0;/);
  assert.match(st, /if \(annualPlanEnabled\(\) && !founder\) \{/);
  assert.match(read('app/api/billing/upgrades/route.ts'), /if \(annualOn && !isFounder\(t\?\.data\)\) \{/);
  const svc = read('lib/billing/service.ts');
  assert.match(svc, /if \(isFounder\(tenant\)\) return 'skipped';/, 'attempt() refuses a plan charge');
  assert.match(svc, /if \(isFounder\(tenant\)\) \{ sum\.skipped\+\+; continue; \}/, 'the daily run skips her');
});

ok('billing card: the founder line, her consent, no price line, no cancel', () => {
  const b = read('app/BillingCard.jsx');
  assert.match(b, /if \(founder\) line = FOUNDER_BILLING_HE;/);
  assert.match(b, /\{!founder && <p/);
  assert.match(b, /founder \? founderConsentTextHe\(\) :/);
  assert.match(b, /\{!isDemo && !founder && s\.owner !== false && sub/);
  assert.ok(!/if \(s\.founder\) \{/.test(b), 'no longer a dead end: the add-on packs below stay');
});

console.log(`\n${n} checks passed`);
