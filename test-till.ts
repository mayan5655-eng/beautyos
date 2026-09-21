// test-till.ts
//
// Proves lib/till.ts and lib/reliability.ts: the numbers the till shows and
// the ways an appointment can end. Plain node, no database.

import {
  paymentsOf, isSplit, validateSplit, discountAmount, voidedIds, liveReceipts, voidOf,
  totalsOf, receiptsOnDay, localDayKey, paidWith, SPLIT_METHOD,
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
