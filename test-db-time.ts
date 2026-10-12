// A payment taken just after midnight belongs to today.
//
// 2026-10-06, brand-new tenant: she registered a payment at 01:10 Israel time on the 6th. The till said
// "today: no payments" and the confirmation was dated the 5th. receipts.created_at is a timestamp WITHOUT
// a time zone holding UTC ("2026-10-05T22:10:35.383187"); JavaScript read it as local time, so every
// receipt came out 2-3 hours early. Same for clients.created_at. These run the real till arithmetic in
// Israel's time zone, in summer and in winter, and at a month boundary.
process.env.TZ = 'Asia/Jerusalem'; // before any Date is made: what her browser does
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseDb } from './lib/dbTime.js';
import { localDayKey, receiptsOnDay, receiptsInMonth, monthSummary } from './lib/till.ts';

assert.equal(new Date(2026, 9, 6, 1, 10).getTimezoneOffset(), -180, 'the test really runs in Israel summer time (UTC+3)');
assert.equal(new Date(2026, 11, 10, 12, 0).getTimezoneOffset(), -120, 'and winter (UTC+2)');

// ── parseDb: a zone-less DB timestamp is UTC ───────────────────────────────────────────────
assert.equal(parseDb('2026-10-05T22:10:35.383187').toISOString(), '2026-10-05T22:10:35.383Z', 'zone-less is UTC');
assert.equal(parseDb('2026-10-05T22:10:35').toISOString(), '2026-10-05T22:10:35.000Z');
assert.equal(parseDb('2026-10-05 22:10:35').toISOString(), '2026-10-05T22:10:35.000Z', 'a space instead of the T');
assert.equal(parseDb('2026-10-05T22:10:35Z').toISOString(), '2026-10-05T22:10:35.000Z', 'a Z is left alone');
assert.equal(parseDb('2026-10-05T22:10:35+00:00').toISOString(), '2026-10-05T22:10:35.000Z', 'an offset is left alone (so the columns can move to timestamptz safely)');
assert.equal(parseDb('2026-10-06T01:10:35+03:00').toISOString(), '2026-10-05T22:10:35.000Z');
assert.ok(Number.isNaN(parseDb('not a date').getTime()), 'junk is an Invalid Date, like new Date(junk)');
assert.ok(Number.isNaN(parseDb(undefined as any).getTime()) && Number.isNaN(parseDb(null as any).getTime()));
const d = new Date(0); assert.equal(parseDb(d), d, 'a Date passes through');

// ── the day a receipt belongs to, in Israel ────────────────────────────────────────────────
assert.equal(localDayKey('2026-10-05T22:10:35.383187'), '2026-10-06', 'THE BUG: 01:10 Israel time on the 6th is the 6th, not the 5th');
assert.equal(localDayKey('2026-10-05T20:59:59'), '2026-10-05', 'one second before local midnight (23:59:59) is still the 5th');
assert.equal(localDayKey('2026-10-05T21:00:00'), '2026-10-06', 'local midnight exactly');
assert.equal(localDayKey('2026-10-06T10:00:00'), '2026-10-06', 'midday is unchanged');
assert.equal(localDayKey('2026-12-10T22:30:00'), '2026-12-11', 'winter (UTC+2): 00:30 on the 11th');
assert.equal(localDayKey('2026-12-10T21:59:59'), '2026-12-10', 'winter: 23:59:59 is still the 10th');
assert.equal(localDayKey('2026-10-06T01:10:00+03:00'), '2026-10-06', 'a timestamptz value (with an offset) agrees');
assert.equal(localDayKey(''), ''); assert.equal(localDayKey(undefined), ''); assert.equal(localDayKey('junk'), '');

// ── the till: "today", and the month ───────────────────────────────────────────────────────
const rcpt = (created_at: string, amount = 100) => ({ created_at, amount, payment_method: 'מזומן' });
{
  const rs = [rcpt('2026-10-05T22:10:35.383187', 300), rcpt('2026-10-06T08:00:00', 50), rcpt('2026-10-05T10:00:00', 70)];
  assert.deepEqual(receiptsOnDay(rs as any, '2026-10-06').map((r: any) => r.amount).sort((a: number, b: number) => a - b), [50, 300], 'today (the 6th) has the 01:10 payment and the morning one');
  assert.deepEqual(receiptsOnDay(rs as any, '2026-10-05').map((r: any) => r.amount), [70], 'and the 5th has only its own');
}
{
  const rs = [rcpt('2026-09-30T21:30:00', 200), rcpt('2026-09-30T20:00:00', 100), rcpt('2026-10-15T09:00:00', 10)];
  assert.equal(receiptsInMonth(rs as any, 9, 2026).length, 2, 'a payment at 00:30 on 1 October is October\'s (month 9)');
  assert.equal(receiptsInMonth(rs as any, 8, 2026).length, 1, 'and September keeps the 23:00 one');
  assert.equal(monthSummary(rs as any, 9, 2026).total, 210);
  assert.equal(monthSummary(rs as any, 8, 2026).total, 100);
}

// ── the dashboard may not go back to raw parsing of these columns ──────────────────────────
const code = (f: string) => fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const app = code('app/beautyos.jsx');
assert.equal((app.match(/new Date\([A-Za-z_][A-Za-z0-9_.]*\.created_at\)/g) || []).length, 0, 'no raw new Date(x.created_at) in the dashboard: use parseDb');
assert.equal((app.match(/\.created_at\??\.?\s*(\|\|\s*"")?\)?\.slice\(0,\s*10\)/g) || []).length, 0, 'no created_at.slice(0,10) in the dashboard: that is the UTC date; use localDayKey');
assert.ok(!/new Date\(r\.created_at\)/.test(code('lib/till.ts')), 'and none in the till arithmetic');

console.log('db time: ok');
