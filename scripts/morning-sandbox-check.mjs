// scripts/morning-sandbox-check.mjs
//
// Proves our Morning mapping against Morning's SANDBOX, with a sandbox account's
// keys, BEFORE anything is switched to production. Run it, read the answers, fix
// lib/legalReceipts/spec.js where Morning disagrees, and only then set
// MORNING_ENV=production.
//
//   MORNING_SANDBOX_KEY_ID=... MORNING_SANDBOX_KEY_SECRET=... \
//     node scripts/morning-sandbox-check.mjs [exempt|licensed]
//
// It refuses to run against production. It creates real (sandbox) documents:
//   1. a receipt (400, or a tax invoice-receipt 320 for "licensed") paid by CARD
//   2. the same paid by CASH
//   3. one with a discount line and a split payment (Bit + cash)
//   4. a credit document (330) cancelling the first one
// and prints, for each, exactly what we sent and what Morning answered.
//
// What to look for (the judgement calls marked UNVERIFIED in spec.js):
//   - does a credit-card payment need cardNum / cardType?
//   - is a negative "הנחה" income row accepted, or must the discount be a `discount` object?
//   - is `signed: true` accepted?
//   - is a credit (330) with negative rows + linkType "cancel" accepted for a RECEIPT (exempt dealer)?
//   - the response: is the number in `number`, and the link in `url.origin`?
// Nothing here is legal advice; have your accountant look at the resulting PDFs.

import { createMorning, morningConfig } from '../lib/legalReceipts/morning.js';
import { buildDocument, buildCredit } from '../lib/legalReceipts/spec.js';

const cfg = morningConfig();
if (cfg.environment !== 'sandbox') {
  console.error('Refusing to run: MORNING_ENV is "production". This script only ever touches the sandbox.');
  process.exit(2);
}
const keyId = process.env.MORNING_SANDBOX_KEY_ID, secret = process.env.MORNING_SANDBOX_KEY_SECRET;
if (!keyId || !secret) {
  console.error('Set MORNING_SANDBOX_KEY_ID and MORNING_SANDBOX_KEY_SECRET (from a Morning SANDBOX account: Settings > Developer tools > API keys).');
  process.exit(2);
}
const taxStatus = process.argv[2] === 'licensed' ? 'licensed' : 'exempt';
const creds = { keyId, secret };
const m = createMorning({ config: cfg });
console.log(`sandbox  api=${cfg.apiBase}  token=${cfg.tokenUrl}  taxStatus=${taxStatus}\n`);

const show = (label, sent, got) => {
  console.log(`--- ${label}`);
  if (sent) console.log('sent:', JSON.stringify(sent));
  console.log('got: ', JSON.stringify(got), '\n');
};

const v = await m.verify(creds);
show('verify keys', null, v);
if (!v.ok) process.exit(1);

const items = JSON.stringify([{ name: 'טיפול פנים', price: 300, qty: 1 }, { name: 'סרום', price: 100, qty: 1 }]);
const base = { client_name: 'בדיקה', service: 'טיפול פנים', items, discount: 0, tip: 0 };
const stamp = Date.now();
const cases = [
  ['card', { id: `t${stamp}a`, ...base, amount: 400, payment_method: 'אשראי' }],
  ['cash', { id: `t${stamp}b`, ...base, amount: 400, payment_method: 'מזומן' }],
  ['discount + split', { id: `t${stamp}c`, ...base, amount: 350, discount: 50, payment_method: 'מפוצל', payments: [{ method: 'ביט', amount: 200 }, { method: 'מזומן', amount: 150 }] }],
];
let first = null;
for (const [label, receipt] of cases) {
  const doc = buildDocument({ receipt, taxStatus, client: { name: 'לקוחת בדיקה' } });
  const r = await m.createDocument(creds, doc);
  show(`create: ${label}`, doc, r);
  if (r.ok && !first) first = { receipt, docId: r.docId };
}
if (first) {
  const credit = buildCredit({ receipt: first.receipt, originalDocId: first.docId, taxStatus, client: { name: 'לקוחת בדיקה' }, reason: 'בדיקת זיכוי' });
  const r = await m.createDocument(creds, credit);
  show('credit (330, linkType cancel) of the first document', credit, r);
} else {
  console.log('No document was created, so the credit was not tried.');
}
console.log('Open the PDFs in your Morning sandbox and check: the type, the numbering, the payment lines, the discount line, the credit linked to its original.');
