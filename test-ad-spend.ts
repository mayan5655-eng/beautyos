// Ad spend: what a manual entry may be, the daily pull window, and how a missing ads permission is told apart.
import assert from 'node:assert/strict';
import { parseManualSpend, pullWindow, isAdsPermissionError, spendRowsForUpsert, FACEBOOK_SOURCE_LABEL } from './lib/adSpend.ts';

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

ok('a valid manual entry is accepted and rounded', () => {
  const r = parseManualSpend({ day: '2026-10-05', source: '  גוגל ', amount: '120.456' });
  assert.deepEqual(r, { ok: true, value: { day: '2026-10-05', source: 'גוגל', amount: 120.46 } });
});

ok('bad entries are refused with a reason', () => {
  for (const b of [null, {}, { day: '2026-13-40', source: 'x', amount: 1 }, { day: '2026-10-05', source: '', amount: 1 }, { day: '2026-10-05', source: 'x', amount: -1 }, { day: '2026-10-05', source: 'x', amount: 'abc' }, { day: '2026-10-05', source: 'x', amount: 5_000_000 }, { day: '05/10/2026', source: 'x', amount: 1 }]) {
    const r = parseManualSpend(b);
    assert.equal(r.ok, false);
  }
});

ok('the pull window ends yesterday and spans 35 days', () => {
  const w = pullWindow(new Date('2026-10-12T12:00:00Z'));
  assert.equal(w.until, '2026-10-11');
  assert.equal(w.since, '2026-09-07');
});

ok('a missing ads permission is "not approved yet", an outage is not', () => {
  assert.equal(isAdsPermissionError({ fbError: { code: 200, message: 'Requires ads_read permission' } }), true);
  assert.equal(isAdsPermissionError({ fbError: { code: 190 } }), true);
  assert.equal(isAdsPermissionError({ message: '(#10) Application does not have permission for this action' }), true);
  assert.equal(isAdsPermissionError({ fbError: { code: 2, message: 'Service temporarily unavailable' } }), false);
  assert.equal(isAdsPermissionError(new Error('fetch failed')), false);
});

ok('Graph rows become Facebook rows; zero-spend days are kept; junk is dropped', () => {
  const rows = spendRowsForUpsert('t1', [{ day: '2026-10-01', spend: 12.345 }, { day: '2026-10-02', spend: 0 }, { day: 'nope', spend: 5 }, { day: '2026-10-03', spend: -4 }]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].source, FACEBOOK_SOURCE_LABEL);
  assert.equal(rows[0].origin, 'facebook');
  assert.equal(rows[0].amount, 12.35);
  assert.equal(rows[0].tenant_id, 't1');
});

console.log(`${n} passed`);
