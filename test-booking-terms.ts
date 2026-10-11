// Deposit / cancellation-window terms are enforced where the data is written, not only on the page.
// Source-level on purpose: these routes need a database to run, and what matters is the ORDER (refuse before
// the insert) and that the page and the server read the same function.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };
const read = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n');

ok('book-appointment refuses an unaccepted booking BEFORE the appointment insert', () => {
  const src = read('app/api/book-appointment/route.js');
  const gate = src.indexOf('bookingTermsRequired(rules) && acceptedTerms !== true');
  const insert = src.indexOf('.from("appointments")\n      .insert(');
  assert.ok(gate > -1, 'the terms gate exists');
  assert.ok(insert > -1 && gate < insert, 'and sits before the insert');
});

ok('the page asks for the tick from the same function the server uses', () => {
  const page = read('app/BookingPage.jsx');
  assert.match(page, /bookingTermsRequired\(bookingRules\)/);
  assert.match(page, /acceptedTerms: termsRequired \? termsOk === true : undefined/);
  assert.match(page, /data-testid="booking-terms"/);
});

ok('the client cancel link is refused inside the window and only the cancel action is restricted', () => {
  const src = read('app/api/confirm/route.ts');
  assert.match(src, /action === 'cancel' && cancelWindowHours > 0/);
  assert.match(src, /isInsideCancelWindow\(String\(appt\.date\)/);
  assert.match(src, /tooLate: true/);
  // the check comes before the status update
  assert.ok(src.indexOf('isInsideCancelWindow(') < src.indexOf("from('appointments').update(patch)"));
});

console.log(`${n} passed`);
