// Her own booking rules for the public page (Settings > calendar and services): minimum notice and how far ahead.
//
// The page and /api/book-appointment both read them through lib/bookingPolicy.ts, so what the page offers and what
// the server accepts cannot disagree. What must hold: a missing or malformed value is the page's old behaviour
// (2 hours, 21 days), a valid value is used, "no limit" notice (0) is allowed, and nothing a visitor posts can
// widen what she set.
import assert from 'node:assert/strict';
import {
  resolveBookingRules, isTooFarAhead, isTooSoonForSelfBooking,
  SELF_BOOKING_MIN_LEAD_MINUTES, DEFAULT_MAX_DAYS_AHEAD, MAX_DAYS_AHEAD_LIMIT, wallClockNow,
} from './lib/bookingPolicy.ts';

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

ok('no rules: the page\'s old behaviour', () => {
  for (const v of [null, undefined, {}, { booking_rules: null }, { booking_rules: {} }, 'x', []]) {
    assert.deepEqual(resolveBookingRules(v), { minLeadMinutes: SELF_BOOKING_MIN_LEAD_MINUTES, maxDaysAhead: DEFAULT_MAX_DAYS_AHEAD });
  }
  assert.equal(SELF_BOOKING_MIN_LEAD_MINUTES, 120);
  assert.equal(DEFAULT_MAX_DAYS_AHEAD, 21);
});

ok('her values are used', () => {
  const r = resolveBookingRules({ booking_rules: { min_notice_hours: 24, max_days_ahead: 30 } });
  assert.deepEqual(r, { minLeadMinutes: 1440, maxDaysAhead: 30 });
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

console.log(`${n} passed`);
