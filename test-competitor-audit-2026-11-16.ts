// Competitor-style audit, 2026-11-16: each fix below was a finding a rival could have used against Kalmea.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { toWhatsAppNumber } from './lib/phone.ts';
import { voucherPartlyUsed } from './lib/grow/voucherRefund.ts';

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };
const read = (f: string) => fs.readFileSync(f, 'utf8');
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

ok('phone: the shapes the booking form accepts reach the right Israeli number', () => {
  assert.equal(toWhatsAppNumber('+972 052-123-4567'), '972521234567', 'the trunk 0 after +972 is dropped');
  assert.equal(toWhatsAppNumber('521234567'), '972521234567', '9 digits starting with 5 is an Israeli mobile, not Mexico');
  assert.equal(toWhatsAppNumber('052-123-4567'), '972521234567');
  assert.equal(toWhatsAppNumber('00972521234567'), '972521234567');
  assert.equal(toWhatsAppNumber('+44 7700 900123'), '447700900123', 'a foreign number still passes through');
});

ok('booking: stores and messages the validated number, and matches returning clients past 1,000 rows', () => {
  const s = code('app/api/book-appointment/route.js');
  assert.ok(s.includes('const phoneLocal = "0" + phoneCheck.e164.slice(3);'));
  assert.ok(/client_phone: phoneLocal,/.test(s), 'the appointment row');
  assert.ok(!/client_phone: phone,/.test(s), 'never the raw typing');
  assert.ok(/phone: phoneLocal,\s*service,/.test(s), 'the confirmation');
  assert.ok(s.includes('readAllRows(supabase, "clients"'), 'paged client read');
});

ok('send-receipt: everything in the message comes from her stored receipt', () => {
  const s = code('app/api/send-receipt/route.js');
  assert.ok(s.includes('.from("receipts")') && s.includes('.eq("id", receipt_id)') && s.includes('.eq("tenant_id", tenantId)'));
  assert.ok(/if \(!receipt\) \{/.test(s), 'no receipt, no message');
  assert.ok(s.includes('const amount = Number(receipt.amount)') && s.includes('const payment_method = String(receipt.payment_method'));
  assert.ok(s.includes('known.includes(asked)'), 'the phone must be the client\'s own');
  assert.ok(!/const \{ client_name, client_phone, amount, payment_method/.test(s), 'the old body destructuring is gone');
});

ok('gift voucher refund: a partly used voucher blocks a full refund; a live one is voided with the money', () => {
  assert.equal(voucherPartlyUsed(null), false);
  assert.equal(voucherPartlyUsed({ id: 'v', status: 'active', balance: 500, initial_amount: 500 }), false);
  assert.equal(voucherPartlyUsed({ id: 'v', status: 'active', balance: 200, initial_amount: 500 }), true);
  assert.equal(voucherPartlyUsed({ id: 'v', status: 'void', balance: 200, initial_amount: 500 }), false);
});

ok('visible copy: no [object Object] placeholder, no English browser errors in onboarding, no false "בקרוב"', () => {
  assert.ok(!read('app/beautyos.jsx').includes('placeholder={bulkLeadIds?<Spinner'));
  assert.ok(!read('app/onboarding/page.tsx').includes('setError(err.message || '));
  assert.ok(!read('app/design/ContentPlan.jsx').includes('catch (e) { setError(e.message); }'));
  assert.ok(read('app/BookingPage.jsx').includes('{hasServices ? "כרגע אין תורים פנויים להזמנה אונליין" : "ההזמנות המקוונות ייפתחו כאן בקרוב"}'), 'the runner shows tr("X") as "X"');
  const terms = read('app/terms/page.tsx');
  assert.ok(!/אתה אחראי|שאתה מזין|ב-קלמיה/.test(terms), 'the terms speak to her, like the signup page that links them');
});

ok('client links: a gap-fill offer dies 30 minutes before the slot; a late confirm cannot undo her cancel', () => {
  assert.ok(code('app/api/slots/offer/route.js').includes('Math.min(OFFER_TTL_HOURS * 60, Math.max(0, leadMinutes - 30))'));
  const c = code('app/api/confirm/route.ts');
  assert.ok(c.includes("q.eq('confirmation_status', appt.confirmation_status)") && /if \(!changed \|\| changed\.length === 0\)/.test(c));
});

ok('no real client name or number in the source', () => {
  for (const f of ['lib/search/matchQuery.ts', 'lib/phone.ts', 'lib/whatsapp.js', 'app/beautyos.jsx', 'test-match-query.js']) {
    assert.ok(!/Sigal|Hakak|526666306/i.test(read(f)), f);
  }
});

console.log(`competitor audit 2026-11-16: ${n} ok`);
