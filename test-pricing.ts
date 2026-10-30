// Kalmea's prices live in ONE place (lib/pricing.ts), and the upgrade buttons stay off until the owner switches them on.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PLAN_PRICES, upgradeButtonsEnabled, priceHe } from './lib/pricing.ts';
import { REGULAR_PRICE } from './lib/billing/service.ts';
import { TRIAL_URGENT_BODY_HE, upgradeCtaHe, payToContinueHe } from './lib/planCopy.ts';
import { nudgeCopy } from './lib/trialNudges.ts';

// the billing service charges the configured price
assert.equal(REGULAR_PRICE, PLAN_PRICES.regular);

// the copy carries the configured price
assert.ok(TRIAL_URGENT_BODY_HE.includes(priceHe(PLAN_PRICES.regular)));
assert.ok(nudgeCopy('day23', { appointments: 3, clients: 2 }).body.includes(priceHe(PLAN_PRICES.regular)));
assert.equal(upgradeCtaHe(349), 'הצטרפות למנוי, 349 ₪ לחודש');
assert.equal(payToContinueHe(499), 'תשלום וחזרה לעבודה, 499 ₪ לחודש');
assert.equal(priceHe(349.5), '349.5 ₪');
for (const s of [upgradeCtaHe(499), payToContinueHe(499)]) assert.ok(!/[–—]/.test(s), 'no em or en dashes in plan copy');

// the flag: off unless exactly "1"
assert.equal(upgradeButtonsEnabled({}), false);
assert.equal(upgradeButtonsEnabled({ NEXT_PUBLIC_UPGRADE_BUTTONS: '' }), false);
assert.equal(upgradeButtonsEnabled({ NEXT_PUBLIC_UPGRADE_BUTTONS: 'true' }), false);
assert.equal(upgradeButtonsEnabled({ NEXT_PUBLIC_UPGRADE_BUTTONS: '1' }), true);

// no hard-coded copy of a price comes back in the places that show or charge one
const files = ['lib/billing/service.ts', 'lib/planCopy.ts', 'lib/trialNudges.ts', 'app/LandingPage.jsx', 'app/terms/page.tsx', 'app/BillingNotices.jsx', 'app/TrialBanner.jsx', 'app/api/billing/status/route.ts'];
for (const f of files) {
  const code = fs.readFileSync(f, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  for (const p of Object.values(PLAN_PRICES)) assert.ok(!new RegExp(`(^|[^\\d.])${p}([^\\d]|$)`).test(code), `${f} hard-codes ${p}: read it from lib/pricing.ts`);
}

// the upgrade buttons only exist behind the flag, and open the existing billing screen
const notices = fs.readFileSync('app/BillingNotices.jsx', 'utf8');
assert.ok(/const upgrade = upgradeOn && canPay/.test(notices), 'upgrade needs the flag AND a billing screen that can take a card');
assert.equal((notices.match(/data-testid="upgrade-cta"/g) || []).length, 1);
assert.ok(/onClick=\{onOpenBilling\}\s*\n\s*data-testid="upgrade-cta"/.test(notices), 'the quiet button opens the billing screen');

console.log('test-pricing: ok');
