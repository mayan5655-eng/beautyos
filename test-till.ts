// test-till.ts
//
// Proves lib/till.ts and lib/reliability.ts: the numbers the till shows and
// the ways an appointment can end. Plain node, no database.

import {
  paymentsOf, isSplit, validateSplit, discountAmount, voidedIds, liveReceipts, voidOf,
  totalsOf, receiptsOnDay, localDayKey, paidWith, SPLIT_METHOD, receiptsInMonth, monthSummary,
  bucketByMethod, OTHER_METHOD,
} from './lib/till.ts';
import {
  isLateCancellation, clientReliability, reliabilityLine, canMarkNoShow,
  recurrenceDates, shortDates, applyPersonalPreset, PERSONAL_PRESETS, NO_SHOW,
} from './lib/reliability.ts';

let passed = 0, failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; }
  else { failed++; console.error(`FAIL ${label}\n  expected ${e}\n  got      ${a}`); }
}

// ── payments: one shape for both kinds of receipt ──────────────────────────
eq(paymentsOf({ amount: 200, payment_method: 'מזומן' }), [{ method: 'מזומן', amount: 200 }], 'single receipt is one line');
eq(paymentsOf({ amount: 200, payment_method: SPLIT_METHOD, payments: [{ method: 'ביט', amount: 120 }, { method: 'מזומן', amount: 80 }] }).length, 2, 'split receipt has its lines');
eq(paymentsOf({ amount: 200, payment_method: SPLIT_METHOD, payments: '[{"method":"ביט","amount":120},{"method":"מזומן","amount":80}]' }).length, 2, 'payments stored as a string still parse');
eq(paymentsOf({ amount: 200, payment_method: 'ביט', payments: 'not json' }), [{ method: 'ביט', amount: 200 }], 'junk payments falls back to the single line');
eq(paymentsOf({ amount: 200, payment_method: 'ביט', payments: [] }), [{ method: 'ביט', amount: 200 }], 'empty payments falls back');
eq(isSplit({ amount: 1, payment_method: 'x' }), false, 'not split');
eq(isSplit({ amount: 1, payments: [{ method: 'a', amount: 0.5 }, { method: 'b', amount: 0.5 }] }), true, 'split');
eq(paidWith({ amount: 1, payments: [{ method: 'ביט', amount: 0.5 }, { method: 'מזומן', amount: 0.5 }] }, 'ביט'), true, 'a split receipt was paid with each of its methods');
eq(paidWith({ amount: 1, payment_method: 'מזומן' }, 'ביט'), false, 'and not with others');

// ── split validation ───────────────────────────────────────────────────────
eq(validateSplit([{ method: 'ביט', amount: 120 }, { method: 'מזומן', amount: 80 }], 200).ok, true, 'a split that adds up');
eq(validateSplit([{ method: 'ביט', amount: 120 }, { method: 'מזומן', amount: 70 }], 200).ok, false, 'a split that does not add up');
eq(validateSplit([{ method: 'ביט', amount: 200 }], 200).ok, false, 'one line is not a split');
eq(validateSplit([{ method: 'ביט', amount: 100 }, { method: 'ביט', amount: 100 }], 200).ok, false, 'same method twice');
eq(validateSplit([{ method: 'ביט', amount: 0 }, { method: 'מזומן', amount: 200 }], 200).ok, false, 'a zero part');
eq(validateSplit([{ method: '', amount: 100 }, { method: 'מזומן', amount: 100 }], 200).ok, false, 'a part with no method');
eq(validateSplit([{ method: 'ביט', amount: 33.33 }, { method: 'מזומן', amount: 66.67 }], 100).ok, true, 'agorot round correctly');

// ── discount ───────────────────────────────────────────────────────────────
eq(discountAmount(200, 'ils', 30), 30, 'shekel discount');
eq(discountAmount(200, 'pct', 10), 20, 'percent discount');
eq(discountAmount(200, 'pct', 150), 200, 'over 100% caps at the subtotal');
eq(discountAmount(200, 'ils', 500), 200, 'a shekel discount cannot exceed the subtotal');
eq(discountAmount(200, 'ils', -5), 0, 'never negative');
eq(discountAmount(199, 'pct', 15), 29.85, 'rounded to agorot');

// ── voids ──────────────────────────────────────────────────────────────────
{
  const rs = [{ id: 1, amount: 100, payment_method: 'מזומן' }, { id: 2, amount: 50, payment_method: 'ביט' }, { id: 3, amount: 70, payment_method: 'מזומן' }];
  const voids = [{ receipt_id: 2, reason: 'טעות בסכום', created_at: '2026-09-22T10:00:00Z' }];
  eq([...voidedIds(voids)], ['2'], 'void ids as strings');
  eq(liveReceipts(rs, voids).map((r) => r.id), [1, 3], 'a voided receipt drops out of the live set');
  eq(liveReceipts(rs, []).length, 3, 'no voids: same array');
  eq(liveReceipts(rs, null).length, 3, 'null voids tolerated');
  eq(voidOf(rs[1], voids)?.reason, 'טעות בסכום', 'the void row for a receipt');
  eq(voidOf(rs[0], voids), null, 'none for an unvoided one');
  eq(totalsOf(liveReceipts(rs, voids)).total, 170, 'totals exclude the void');
  eq(rs[1].amount, 50, 'the original row is untouched');
}

// ── totals ─────────────────────────────────────────────────────────────────
{
  const rs = [
    { id: 1, amount: 200, tip: 20, payment_method: 'מזומן', created_at: '2026-09-22T09:00:00' },
    { id: 2, amount: 300, tip: 0, payment_method: SPLIT_METHOD, payments: [{ method: 'ביט', amount: 200 }, { method: 'מזומן', amount: 100 }], created_at: '2026-09-22T11:00:00' },
    { id: 3, amount: 150, payment_method: 'אשראי', created_at: '2026-09-21T18:00:00' },
  ];
  const today = receiptsOnDay(rs, '2026-09-22');
  eq(today.map((r) => r.id), [1, 2], 'today by local day');
  const t = totalsOf(today);
  eq(t.total, 500, 'today total is the sum of amounts');
  eq(t.tips, 20, 'tips separately');
  eq(t.collected, 520, 'collected is amount plus tips');
  eq(t.count, 2, 'a split receipt counts once');
  eq(t.byMethod, [{ method: 'מזומן', total: 300, count: 2 }, { method: 'ביט', total: 200, count: 1 }], 'by method, each split line to its own method, largest first');
  eq(localDayKey('nope'), '', 'junk timestamp is an empty key');
  eq(localDayKey(null), '', 'null timestamp is an empty key');
}

// ── THE INVARIANT: the breakdown always sums to the total ──────────────────
// The bug: the month headline filtered to this month while the per-method
// cards ran over every receipt ever, so cash showed 2,700 under a 1,400
// month. Both now come from monthSummary(), one set; this proves that set's
// lines add up to its total under every shape a receipt can take - single,
// split, tipped, voided, other months, junk dates.
{
  const sumBy = (t: { byMethod: { total: number }[] }) => Math.round(t.byMethod.reduce((s, b) => s + b.total, 0) * 100) / 100;
  const rs = [
    { id: 1, amount: 1400, tip: 100, payment_method: 'מזומן', created_at: '2026-09-03T10:00:00' },
    { id: 2, amount: 800, payment_method: SPLIT_METHOD, payments: [{ method: 'ביט', amount: 500 }, { method: 'מזומן', amount: 300 }], created_at: '2026-09-15T10:00:00' },
    { id: 3, amount: 2700, payment_method: 'מזומן', created_at: '2026-08-30T10:00:00' },   // last month: the 2,700
    { id: 4, amount: 999, payment_method: 'מזומן', created_at: '2026-09-20T10:00:00' },     // voided below
    { id: 5, amount: 60.5, payment_method: 'אשראי', created_at: '2026-09-21T23:59:59' },
    { id: 6, amount: 10, payment_method: 'מזומן', created_at: 'not a date' },
    { id: 7, amount: 55, payment_method: 'ביט', created_at: null },
  ];
  const voids = [{ receipt_id: 4, reason: 'טעות', created_at: '2026-09-20T11:00:00' }];
  const live = liveReceipts(rs, voids);

  // The month, September 2026 (getMonth() is 0-based).
  const sept = monthSummary(live, 8, 2026);
  eq(sept.total, 2260.5, 'September total: 1400 + 800 + 60.5, not last month, not the void');
  eq(sumBy(sept), sept.total, 'THE INVARIANT: September breakdown sums to the September total');
  eq(sept.byMethod.find((b) => b.method === 'מזומן')?.total, 1700, 'cash is 1400 + the 300 half of the split - never the 2,700 from August');
  eq(sept.tips, 100, 'tips beside the total, not inside it');
  eq(sept.byMethod.every((b) => b.total <= sept.total), true, 'no method exceeds the total');

  // Last month has its own consistent pair.
  const aug = monthSummary(live, 7, 2026);
  eq(aug.total, 2700, 'August total');
  eq(sumBy(aug), aug.total, 'August breakdown sums to the August total');

  // All-time also holds, so the property is of totalsOf, not of one window.
  const all = totalsOf(live);
  eq(sumBy(all), all.total, 'all-time breakdown sums to the all-time total');
  eq(receiptsInMonth(rs, 8, 2026).map((r) => r.id), [1, 2, 4, 5], 'month filter drops junk and null dates');

  // And with voids ignored the invariant still holds - it is about the set,
  // whichever set is chosen; the caller's job is to choose the same one twice.
  const raw = totalsOf(rs);
  eq(sumBy(raw), raw.total, 'even the unfiltered set sums to its own total');

  // The rows the screen renders: every known method, plus "אחר" for the rest,
  // and THOSE rows sum to the total too - including when a receipt carries a
  // method nobody listed.
  const KNOWN = ['מזומן', 'אשראי', 'ביט', 'פייבוקס', 'העברה', 'חבילה'];
  const withStray = [...live, { id: 8, amount: 40, payment_method: 'צ׳ק', created_at: '2026-09-22T09:00:00' }];
  const t = monthSummary(withStray, 8, 2026);
  const rows = bucketByMethod(t, KNOWN);
  eq(rows.length, KNOWN.length + 1, 'six known rows plus one "other"');
  eq(rows.slice(0, KNOWN.length).map((r) => r.method), KNOWN, 'known rows in the given order, zeros included');
  eq(rows[rows.length - 1], { method: OTHER_METHOD, total: 40, count: 1, known: false }, 'the stray method lands in "other"');
  eq(Math.round(rows.reduce((s, r) => s + r.total, 0) * 100) / 100, t.total, 'THE INVARIANT, on the rendered rows: they sum to the total');
  eq(bucketByMethod(monthSummary(live, 8, 2026), KNOWN).some((r) => r.method === OTHER_METHOD), false, 'no "other" row when nothing is stray');
  eq(rows.find((r) => r.method === 'פייבוקס')?.total, 0, 'an unused method shows as zero, not missing');
}

// ── no-show and late cancellation ──────────────────────────────────────────
{
  const late = { date: '2026-09-22', start_minute: 600, confirmation_status: 'cancelled', cancelled_at: '2026-09-22T06:00:00' };
  const early = { date: '2026-09-22', start_minute: 600, confirmation_status: 'cancelled', cancelled_at: '2026-09-20T06:00:00' };
  const unknown = { date: '2026-09-22', start_minute: 600, confirmation_status: 'cancelled' };
  eq(isLateCancellation(late), true, 'cancelled 4 hours before is late');
  eq(isLateCancellation(early), false, 'cancelled two days before is not');
  eq(isLateCancellation(unknown), false, 'no cancelled_at: unknown, not late');
  eq(isLateCancellation({ ...late, confirmation_status: 'confirmed' }), false, 'a kept appointment is not a cancellation');
  const r = clientReliability([
    late, early, unknown,
    { date: '2026-08-01', start_minute: 600, confirmation_status: NO_SHOW },
    { date: '2026-07-01', start_minute: 600, confirmation_status: 'confirmed' },
    { date: '2026-06-01', start_minute: 600, confirmation_status: 'pending' },
    { date: '2026-06-02', start_minute: 600, confirmation_status: NO_SHOW, kind: 'personal' },
  ]);
  eq(r, { noShows: 1, lateCancels: 1, visits: 2 }, 'counts: one no-show, one late cancel, two visits; personal ignored');
  eq(reliabilityLine(r), 'לא הגיעה פעם אחת · ביטול מאוחר אחד', 'the card line, singular forms');
  eq(reliabilityLine({ noShows: 3, lateCancels: 2, visits: 0 }), 'לא הגיעה 3 פעמים · 2 ביטולים מאוחרים', 'plural forms');
  eq(reliabilityLine({ noShows: 0, lateCancels: 0, visits: 5 }), null, 'nothing to say for a reliable client');
  eq(canMarkNoShow({ date: '2026-09-22', confirmation_status: 'pending' }, '2026-09-22'), true, 'today: can mark');
  eq(canMarkNoShow({ date: '2026-09-21', confirmation_status: 'confirmed' }, '2026-09-22'), true, 'yesterday: can mark');
  eq(canMarkNoShow({ date: '2026-09-23', confirmation_status: 'pending' }, '2026-09-22'), false, 'tomorrow: cannot');
  eq(canMarkNoShow({ date: '2026-09-21', confirmation_status: 'cancelled' }, '2026-09-22'), false, 'cancelled: cannot');
  eq(canMarkNoShow({ date: '2026-09-21', confirmation_status: NO_SHOW }, '2026-09-22'), false, 'already marked');
  eq(canMarkNoShow({ date: '2026-09-21', kind: 'personal' }, '2026-09-22'), false, 'personal: never');
}

// ── recurrence ─────────────────────────────────────────────────────────────
eq(recurrenceDates('2026-10-06', 3, 4), ['2026-10-06', '2026-10-27', '2026-11-17', '2026-12-08'], 'every three weeks, four times, starting on the date itself');
eq(recurrenceDates('2026-03-24', 1, 2), ['2026-03-24', '2026-03-31'], 'across the DST switch the weekday holds');
eq(recurrenceDates('bad', 3, 4), [], 'a bad date gives nothing');
eq(recurrenceDates('2026-10-06', 0, 0).length, 1, 'floors: at least one date, at least one week');
eq(recurrenceDates('2026-10-06', 99, 999).length, 52, 'caps: 52 dates at most');
eq(shortDates(['2026-10-12', '2026-11-02']), '12.10, 2.11', 'short dates for a toast');

// ── personal presets ───────────────────────────────────────────────────────
{
  const draft = { from: '2026-09-22', to: '2026-09-22', title: '', allDay: false, startMinute: 9 * 60, duration: 60, note: '' };
  const lunch = applyPersonalPreset(draft, PERSONAL_PRESETS[0]);
  eq([lunch.title, lunch.allDay, lunch.startMinute, lunch.duration, lunch.to], ['הפסקת צהריים', false, 780, 60, '2026-09-22'], 'lunch: an hour at one');
  const off = applyPersonalPreset(draft, PERSONAL_PRESETS[1]);
  eq([off.title, off.allDay, off.to], ['יום חופש', true, '2026-09-22'], 'day off: all day, one day');
  const vac = applyPersonalPreset(draft, PERSONAL_PRESETS[2]);
  eq([vac.title, vac.allDay, vac.to], ['חופשה', true, '2026-09-28'], 'vacation: a week, all day');
  eq(draft.title, '', 'the draft passed in is not mutated');
}

console.log(`test-till: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
