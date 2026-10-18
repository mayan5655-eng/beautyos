// A client's own cancel link now asks the owner whether to offer the freed slot (it never sends anything itself).
import assert from 'node:assert/strict';
import { askGapFillAfterClientCancel, minutesUntilIsrael } from './lib/ownerQuestions.js';

// 2026-10-19 10:00 Israel (UTC+3 until the 25th) = 07:00Z.
const now = new Date('2026-10-19T07:00:00Z');
assert.equal(minutesUntilIsrael('2026-10-19', 12 * 60, now), 120);
assert.equal(minutesUntilIsrael('2026-10-20', 10 * 60, now), 1440);

function fakeDb({ automations = {}, dup = false } = {}) {
  const inserts: unknown[] = [];
  const chain = (table: string) => {
    const q: any = {
      select: () => q, eq: () => q, limit: async () => ({ data: dup ? [{ id: 1 }] : [] }),
      maybeSingle: async () => ({ data: table === 'settings' ? { automations } : null }),
      insert: async (row: unknown) => { inserts.push(row); return { error: null }; },
    };
    return q;
  };
  return { db: { from: chain }, inserts };
}
const appt = { date: '2026-10-21', start_minute: 600, service: 'לק ג׳ל', duration: 60, client_id: 7 };

assert.equal(await askGapFillAfterClientCancel(fakeDb({ automations: { paused: true } }).db, { tenantId: 't', appt, now }), 'paused');
assert.equal(await askGapFillAfterClientCancel(fakeDb({ automations: { quiet: true } }).db, { tenantId: 't', appt, now }), 'quiet');
assert.equal(await askGapFillAfterClientCancel(fakeDb().db, { tenantId: 't', appt: { ...appt, date: '2026-10-19', start_minute: 11 * 60 }, now }), 'too_soon');
const d = fakeDb({ dup: true });
assert.equal(await askGapFillAfterClientCancel(d.db, { tenantId: 't', appt, now }), 'duplicate');
assert.equal(d.inserts.length, 0);
// A database that throws is a reason, never an exception into the confirm route.
assert.equal(await askGapFillAfterClientCancel({ from: () => { throw new Error('down'); } }, { tenantId: 't', appt, now }), 'error');
console.log('gap fill on client cancel: ok');
