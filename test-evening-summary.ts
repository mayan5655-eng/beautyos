import assert from 'node:assert/strict';
import { buildEveningSummary, israelWeekday, isQuietEvening } from './lib/eveningSummary.js';

const start = (a: any) => a.start_minute ?? null;
const end = (a: any) => (a.start_minute == null ? null : a.start_minute + (a.duration ?? 60));
const A = (o: any) => ({ name: 'דנה', service: 'פילינג', start_minute: 9 * 60 + 30, duration: 60, confirmation_status: 'confirmed', ...o });
const date = '2026-09-30';

assert.equal(buildEveningSummary({ date, appointments: [], startMinute: start, endMinute: end }), null, 'an empty day is not worth a message');
assert.equal(buildEveningSummary({ date, appointments: [A({ confirmation_status: 'cancelled' })], startMinute: start, endMinute: end }), null);

const m = buildEveningSummary({ date, appointments: [
  A({ name: 'לאה', service: 'אקנה', start_minute: 15 * 60, duration: 90 }),
  A({ name: 'דנה' }),
  A({ name: 'ליאת', start_minute: 12 * 60, confirmation_status: 'pending' }),
  A({ name: 'נועה', start_minute: 13 * 60, confirmation_status: 'pending' }),
  A({ name: 'ביטלה', confirmation_status: 'cancelled' }),
], startMinute: start, endMinute: end })!;
assert.ok(m.startsWith('מחר, '), m);
assert.ok(m.includes('4 לקוחות.'), 'counts the live ones only: ' + m);
assert.ok(m.includes('הראשונה ב-09:30 (דנה, פילינג)'), m);
assert.ok(m.includes('נגמר ב-16:30'), 'ends when the last one ends: ' + m);
assert.ok(m.includes('עוד לא אישרו: ליאת ונועה.'), m);
assert.ok(m.trim().endsWith('לילה טוב.'));

const one = buildEveningSummary({ date, appointments: [A({})], startMinute: start, endMinute: end })!;
assert.ok(one.includes('לקוחה אחת.') && one.includes('היא ב-09:30'), one);
assert.ok(!/עוד לא אישרו/.test(one), 'nothing to chase when everyone confirmed');
assert.ok(!/נגמר/.test(one), 'one client: no "the day ends" line');

// Shabbat: Friday evening and Saturday evening are quiet (Israel time).
assert.equal(israelWeekday(new Date('2026-09-30T16:00:00Z')), 3); // Wed
assert.equal(isQuietEvening(new Date('2026-09-30T16:00:00Z')), false);
assert.equal(isQuietEvening(new Date('2026-10-02T16:00:00Z')), true);  // Fri
assert.equal(isQuietEvening(new Date('2026-10-03T16:00:00Z')), true);  // Sat
assert.equal(isQuietEvening(new Date('2026-10-01T16:00:00Z')), false); // Thu: covers Friday
console.log('evening summary: ok');
