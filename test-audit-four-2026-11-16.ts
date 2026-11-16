// Her four decisions after the 2026-11-16 audit, pinned: the law on online-booking cancellations, tips in the terms, a membership
// commitment of 12 months at most, and no receptionist in the landing cost table.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { distanceSaleCancel, distanceSaleFeeCap } from './lib/cancellationPolicy.ts';
import { commitMonths, consentTextHe, PLAN_LIMITS, sanitizePlan } from './lib/memberships.ts';

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };
const raw = (f: string) => (fs.readFileSync(f, { encoding: 'utf8', raw: true } as never) as unknown as string).replace(/\r\n/g, '\n');

ok('online booking: cancelled within 14 days and two working days before is the client\'s right', () => {
  const at = (iso: string) => new Date(iso);
  const base = { bookedAt: '2026-11-15T10:00:00Z' };
  // Sunday 15 Nov booked; Thursday 19 Nov appointment. Cancel Monday: Tue + Wed free = 2.
  assert.equal(distanceSaleCancel({ ...base, cancelledAt: at('2026-11-16T09:00:00Z'), apptDay: '2026-11-19' }), true);
  // Cancel Tuesday: only Wednesday between = 1.
  assert.equal(distanceSaleCancel({ ...base, cancelledAt: at('2026-11-17T09:00:00Z'), apptDay: '2026-11-19' }), false);
  // Saturday does not count: cancel Thursday 19th for Monday 23rd: Fri + Sun = 2 (Sat skipped).
  assert.equal(distanceSaleCancel({ ...base, cancelledAt: at('2026-11-19T09:00:00Z'), apptDay: '2026-11-23' }), true);
  assert.equal(distanceSaleCancel({ ...base, cancelledAt: at('2026-11-20T09:00:00Z'), apptDay: '2026-11-23' }), false, 'Fri for Mon: Sat skipped, only Sun');
  // A yom tov does not count either.
  assert.equal(distanceSaleCancel({ ...base, cancelledAt: at('2026-11-19T09:00:00Z'), apptDay: '2026-11-23', isRestDay: (d) => d === '2026-11-22' }), false);
  // More than 14 days after booking: her own policy.
  assert.equal(distanceSaleCancel({ bookedAt: '2026-10-01T10:00:00Z', cancelledAt: at('2026-11-16T09:00:00Z'), apptDay: '2026-11-30' }), false);
  // Unknown booking time: her own policy, as before.
  assert.equal(distanceSaleCancel({ bookedAt: null, cancelledAt: at('2026-11-16T09:00:00Z'), apptDay: '2026-11-30' }), false);
  assert.equal(distanceSaleFeeCap(300), 15);
  assert.equal(distanceSaleFeeCap(5000), 100);
});

ok('the fee logic honours it: no fee, and a deposit goes back in money, never as credit', () => {
  const f = raw('lib/grow/cancelFees.ts');
  assert.ok(f.includes("const lawful = i.event === 'cancel' && snap.via !== 'owner'"), 'online bookings only, not ones she made herself');
  assert.ok(f.includes('if (lawful) verdict = \'timely\';'));
  assert.ok(f.includes("if (consent.snapshot.timely_cancel === 'credit' && base.client_id && !moneyBack) {"));
  assert.ok(raw('app/BookingPage.jsx').includes('data-testid="grow-policy-law"'), 'the client is told before she agrees');
});

ok('terms: the cancellation right and tips', () => {
  const t = raw('app/terms/page.tsx');
  assert.ok(t.includes('לא יעלו על 5% מהמחיר') && t.includes('או 100 ₪, הנמוך מביניהם'));
  assert.ok(t.includes('טיפ שנרשם בתשלום שייך לעסק'));
  assert.ok(t.includes('A tip added to a payment'));
});

ok('memberships: 12 months at most, old plans read as 12, the client may still ask to end early', () => {
  assert.equal(PLAN_LIMITS.minMonthsMax, 12);
  assert.equal(commitMonths(24), 12);
  assert.equal(commitMonths(6), 6);
  assert.equal(commitMonths('x'), 0);
  const r = sanitizePlan({ name: 'מנוי', price: 200, credits: 2, min_months: 18 }) as { ok: boolean };
  assert.equal(r.ok, false, 'a new plan cannot ask for more');
  const text = consentTextHe({ name: 'מנוי', price: 200, credits: 2, rollover: false, min_months: 24, services: [] }, 'עסק');
  assert.ok(text.includes('12 חודשים') || text.includes('שנה'), text);
  assert.ok(text.includes('לפי חוק הגנת הצרכן'));
  assert.ok(raw('app/MembershipsPanel.jsx').includes('min={0} max={12}'));
});

ok('landing: no receptionist in the cost table', () => {
  assert.ok(!raw('app/LandingPage.jsx').includes('מזכירה / פקידת קבלה'));
});

console.log(`audit four: ${n} ok`);
