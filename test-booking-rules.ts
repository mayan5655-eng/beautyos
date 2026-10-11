// Her own booking rules for the public page (Settings > calendar and services): minimum notice and how far ahead.
//
// The page and /api/book-appointment both read them through lib/bookingPolicy.ts, so what the page offers and what
// the server accepts cannot disagree. What must hold: a missing or malformed value is the page's old behaviour
// (2 hours, 21 days), a valid value is used, "no limit" notice (0) is allowed, and nothing a visitor posts can
// widen what she set.
import assert from 'node:assert/strict';
import {
  resolveBookingRules, isTooFarAhead, isTooSoonForSelfBooking, bookingTermsRequired, isInsideCancelWindow, MAX_DEPOSIT_AMOUNT,
  SELF_BOOKING_MIN_LEAD_MINUTES, DEFAULT_MAX_DAYS_AHEAD, MAX_DAYS_AHEAD_LIMIT, wallClockNow,
} from './lib/bookingPolicy.ts';

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

ok('no rules: the page\'s old behaviour', () => {
  for (const v of [null, undefined, {}, { booking_rules: null }, { booking_rules: {} }, 'x', []]) {
    assert.deepEqual(resolveBookingRules(v), { minLeadMinutes: SELF_BOOKING_MIN_LEAD_MINUTES, maxDaysAhead: DEFAULT_MAX_DAYS_AHEAD, depositAmount: 0, depositNote: '', cancelWindowHours: 0 });
  }
  assert.equal(SELF_BOOKING_MIN_LEAD_MINUTES, 120);
  assert.equal(DEFAULT_MAX_DAYS_AHEAD, 21);
});

ok('her values are used', () => {
  const r = resolveBookingRules({ booking_rules: { min_notice_hours: 24, max_days_ahead: 30 } });
  assert.deepEqual(r, { minLeadMinutes: 1440, maxDaysAhead: 30, depositAmount: 0, depositNote: '', cancelWindowHours: 0 });
});

ok('zero notice is a real choice, not a missing value', () => {
  assert.equal(resolveBookingRules({ booking_rules: { min_notice_hours: 0 } }).minLeadMinutes, 0);
});

ok('garbage falls back to the default, never to "no limit"', () => {
  const r = resolveBookingRules({ booking_rules: { min_notice_hours: 'soon', max_days_ahead: -5 } });
  assert.equal(r.minLeadMinutes, 120);
  assert.equal(r.maxDaysAhead, 21);
  assert.equal(resolveBookingRules({ booking_rules: { min_notice_hours: 9999 } }).minLeadMinutes, 120, 'over a week is refused');
  assert.equal(resolveBookingRules({ booking_rules: { max_days_ahead: 500 } }).maxDaysAhead, 21, 'over the availability horizon is refused');
  assert.equal(MAX_DAYS_AHEAD_LIMIT, 60);
});

const addDays = (d: string, k: number) => {
  const [y, m, dd] = d.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, dd + k));
  return t.toISOString().slice(0, 10);
};

ok('too far ahead: the day after her limit is refused, her limit itself is not', () => {
  const now = new Date('2026-10-11T09:00:00Z');
  const today = wallClockNow(now).date;
  assert.equal(isTooFarAhead(addDays(today, 14), 14, now), false);
  assert.equal(isTooFarAhead(addDays(today, 15), 14, now), true);
  assert.equal(isTooFarAhead('not-a-date', 14, now), true, 'unparseable is refused');
});

ok('too soon honours her notice', () => {
  const now = new Date('2026-10-11T09:00:00Z');
  const wall = wallClockNow(now);
  const in90 = wall.minutes + 90;
  if (in90 < 1440) {
    assert.equal(isTooSoonForSelfBooking(wall.date, in90, now, 60), false, '90 minutes away passes a 1-hour rule');
    assert.equal(isTooSoonForSelfBooking(wall.date, in90, now, 120), true, '...and fails the default');
    assert.equal(isTooSoonForSelfBooking(wall.date, in90, now, 0), false, 'zero notice allows it');
  }
});

ok('deposit and cancellation window: parsed, bounded, default off', () => {
  const r = resolveBookingRules({ booking_rules: { deposit_amount: 80.4, deposit_note: '  ביט ל-050-0000000 ', cancel_window_hours: 24 } });
  assert.equal(r.depositAmount, 80);
  assert.equal(r.depositNote, 'ביט ל-050-0000000');
  assert.equal(r.cancelWindowHours, 24);
  assert.equal(bookingTermsRequired(r), true);
  assert.equal(bookingTermsRequired(resolveBookingRules(null)), false);
  for (const bad of [{ deposit_amount: -5 }, { deposit_amount: MAX_DEPOSIT_AMOUNT + 1 }, { deposit_amount: 'x' }, { cancel_window_hours: 'soon' }, { cancel_window_hours: 9999 }]) {
    const rr = resolveBookingRules({ booking_rules: bad });
    assert.equal(rr.depositAmount, 0);
    assert.equal(rr.cancelWindowHours, 0);
  }
  assert.equal(resolveBookingRules({ booking_rules: { deposit_note: 'x'.repeat(500) } }).depositNote.length, 200);
});

ok('inside the cancellation window: only restricts when a window is set and the slot is close', () => {
  const now = new Date('2026-10-11T09:00:00Z');
  const wall = wallClockNow(now);
  const soon = wall.minutes + 180; // 3 hours away, same day
  if (soon < 1440) {
    assert.equal(isInsideCancelWindow(wall.date, soon, 24, now), true);
    assert.equal(isInsideCancelWindow(wall.date, soon, 2, now), false);
    assert.equal(isInsideCancelWindow(wall.date, soon, 0, now), false, 'no window set');
  }
  assert.equal(isInsideCancelWindow('garbage', 600, 24, now), false, 'unparseable never blocks');
});

console.log(`${n} passed`);
