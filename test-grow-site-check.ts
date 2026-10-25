// Grow's site check (https://grow.business/Site_check, read 2026-10-21) before clearing goes live: a phone number on the home page, the
// business address on the site or in the terms, a required terms tick WITH a link to the terms on every payment page, and the terms must
// cover delivery of the service, an 18+ purchase limit, privacy, the business's liability, and cancellation under the Consumer Protection Law.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { billingConsentTextHe, BILLING_CONSENT_VERSION, BILLING_TERMS_SENTENCE_HE } from './lib/billing/consent.ts';
import { PAYMENT_TERMS_HREF } from './lib/paymentTerms.ts';

const read = (p: string) => readFileSync(new URL(`./${p}`, import.meta.url), 'utf8');

// The terms page covers Grow's required sections.
const terms = read('app/terms/page.tsx');
for (const [what, re] of [
  ['delivery of the service', /אספקת השירות/],
  ['an 18+ purchase limit', /מלאו לו 18/],
  ['privacy', /heHeading="פרטיות"/],
  ['direct or indirect damage', /לנזק ישיר ו\/או עקיף/],
  ['cancellation under the Consumer Protection Law', /חוק הגנת הצרכן, התשמ&quot;א-1981/],
  ['paying a business through Kalmea', /id="payments"/],
  ['the business details', /footerBusinessLine\(\)/],
] as const) assert.match(terms, re, `terms: ${what}`);
assert.equal(PAYMENT_TERMS_HREF, '/terms#payments');

// The client payment page: a required tick with a link, the button waits for it, and the server refuses without it.
const pay = read('app/pay/[token]/PayClient.jsx');
assert.ok(pay.includes('data-testid="pay-terms"') && pay.includes('href={PAYMENT_TERMS_HREF}'), 'pay page: the tick links the terms');
assert.ok(/disabled=\{phase === 'opening' \|\| !termsOk\}/.test(pay) && /acceptedTerms: termsOk === true/.test(pay), 'pay page: the button waits for the tick and sends it');
const wr = read('app/api/grow/wallet/route.ts');
assert.ok(wr.indexOf('body.acceptedTerms !== true') > -1 && wr.indexOf('body.acceptedTerms !== true') < wr.indexOf('startWalletSession('), 'wallet route: refused without the tick, before Grow is asked');

// The booking page's Grow policy tick and Kalmea's own billing tick link the terms.
assert.ok(/href=\{PAYMENT_TERMS_HREF\}/.test(read('app/BookingPage.jsx')), 'booking page: the Grow policy tick links the payment terms');
assert.ok(billingConsentTextHe(349).endsWith(BILLING_TERMS_SENTENCE_HE) && BILLING_CONSENT_VERSION === 'billing-card-v3' && !/אצל חברת הסליקה/.test(billingConsentTextHe(349)), 'billing: the stored consent names the terms, new version');
assert.ok(/href=\{KALMEA_TERMS_HREF\}/.test(read('app/BillingCard.jsx')), 'billing card: the terms are a link');

// A phone number in plain sight on Kalmea's own pages (landing, terms, privacy carry KalmeaLegalFooter).
assert.ok(read('app/KalmeaLegalFooter.tsx').includes('KALMEA_SUPPORT_WHATSAPP_DISPLAY'), 'footer: the contact number is shown');

console.log('grow site check: ok');
