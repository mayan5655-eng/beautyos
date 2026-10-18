// Kalmea sells as an exempt dealer (osek patur): a subscription charge gets a RECEIPT with no VAT line and the price is final; the legal
// footer says "עוסק פטור" with placeholders; and switching to a licensed dealer is the one constant in lib/kalmeaBusiness.ts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KALMEA_TAX_STATUS, subscriptionDoc, footerBusinessLine, VAT_RATE } from './lib/kalmeaBusiness.ts';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

assert.equal(KALMEA_TAX_STATUS, 'exempt', 'Kalmea starts as an exempt dealer');

// Exempt: a receipt, no VAT anywhere, the amount is untouched.
const ex = subscriptionDoc(349);
assert.deepEqual(ex, { docType: 'receipt', labelHe: 'קבלה', amount: 349, vatAmount: 0, netAmount: 349, showVatLine: false });
assert.equal(subscriptionDoc(499).amount, 499, 'the price is final, nothing is added');

// Licensed (the later switch): a tax invoice-receipt, VAT contained in the same price.
const li = subscriptionDoc(499, 'licensed');
assert.equal(li.docType, 'tax_invoice_receipt'); assert.equal(li.labelHe, 'חשבונית מס קבלה'); assert.equal(li.amount, 499); assert.equal(li.showVatLine, true);
assert.equal(Math.round((li.netAmount + li.vatAmount) * 100) / 100, 499, 'net + VAT = the price');
assert.ok(Math.abs(li.vatAmount - 499 * VAT_RATE / (1 + VAT_RATE)) < 0.01);

// The footer line.
assert.ok(footerBusinessLine().includes('עוסק פטור') && footerBusinessLine().includes('[BUSINESS NUMBER]') && footerBusinessLine().includes('[ADDRESS]'));
assert.ok(footerBusinessLine('licensed').includes('עוסק מורשה'));
for (const f of ['app/LandingPage.jsx', 'app/terms/page.tsx', 'app/privacy/page.tsx']) assert.ok(/<KalmeaLegalFooter/.test(read(`./${f}`)), `${f} carries Kalmea's seller line`);
assert.ok(!/Kalmea|KalmeaLegalFooter/.test(read('./app/PublicFooterLinks.tsx').replace(/^\/\/.*$/gm, '')), "a cosmetician's own pages do not carry Kalmea's registration");
assert.ok(!/KalmeaLegalFooter/.test(read('./app/BookingPage.jsx')) && !/KalmeaLegalFooter/.test(read('./app/PublicLandingPage.tsx')));

// The wiring is also pinned in source, so the check holds even if the in-memory probe above changes shape.
const svc = read('./lib/billing/service.ts');
assert.ok(/subscriptionDoc\(pay\.amount\)/.test(svc) && /docType: doc\.docType, vatAmount: doc\.vatAmount/.test(svc), 'the invoice request carries the document type and VAT');
assert.ok(/subscriptionDoc\(p\.amount\)\.labelHe/.test(read('./app/BillingCard.jsx')), 'her billing history names the document by its type, not always "חשבונית"');

console.log('test-kalmea-business: ok');

// Kalmea support: ONE WhatsApp-only constant, offered as wa.me, never as a call.
const { KALMEA_SUPPORT_WHATSAPP, supportWhatsAppUrl } = await import('./lib/support.ts');
assert.equal(KALMEA_SUPPORT_WHATSAPP, '972507321978');
assert.equal(supportWhatsAppUrl('x'), 'https://wa.me/972507321978?text=x');
assert.ok(supportWhatsAppUrl()!.startsWith('https://wa.me/972507321978?text='), 'the default renewal message goes to the support line');
for (const f of ['app/LandingPage.jsx', 'app/TrialBanner.jsx', 'app/ReadOnlyNotice.jsx', 'app/TrialNudge.jsx', 'app/terms/page.tsx', 'app/privacy/page.tsx', 'app/accessibility/page.tsx', 'app/BillingNotices.jsx', 'app/BillingCard.jsx']) {
  const src = read(`./${f}`);
  assert.ok(!/tel:/.test(src.replace(/^\s*(\/\/|\/\*).*$/gm, '')), `${f}: no tel: link for Kalmea`);
  assert.ok(!/972507321978|050-?7321978/.test(src.replace(/^\s*(\/\/|\/\*).*$/gm, '')), `${f}: the number is not repeated, it comes from lib/support.ts`);
}
for (const f of ['app/LandingPage.jsx', 'app/TrialBanner.jsx', 'app/ReadOnlyNotice.jsx', 'app/terms/page.tsx', 'app/privacy/page.tsx', 'app/accessibility/page.tsx']) assert.ok(/supportWhatsAppUrl/.test(read(`./${f}`)), `${f} links to the shared support line`);
console.log('test-kalmea-business: support line ok');
