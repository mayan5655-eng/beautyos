import assert from 'node:assert/strict';
import { buildNextClientBrief, agoHe, untilHe } from './lib/nextClient.js';

const start = (a: any) => a.start_minute ?? null;
const end = (a: any) => (a.start_minute == null ? null : a.start_minute + (a.duration ?? 60));
const now = new Date(2026, 8, 29, 13, 50); // 13:50
const A = (o: any) => ({ id: 'x', client_id: 'c1', name: 'דנה', service: 'פילינג', date: '2026-09-29', start_minute: 14 * 60, duration: 60, confirmation_status: 'confirmed', ...o });
const clients = [{ id: 'c1', name: 'דנה', allergies: 'לטקס', notes: 'מתחתנת בנובמבר' }];

assert.equal(agoHe(1), 'אתמול');
assert.equal(agoHe(3), 'לפני 3 ימים');
assert.equal(agoHe(7), 'לפני שבוע');
assert.equal(agoHe(14), 'לפני שבועיים');
assert.equal(agoHe(21), 'לפני 3 שבועות');
assert.equal(agoHe(60), 'לפני חודשיים');
assert.equal(agoHe(400), 'לפני שנה');
assert.equal(untilHe(10), 'בעוד 10 דקות');
assert.equal(untilHe(0), 'עכשיו');
assert.equal(untilHe(30), 'בעוד חצי שעה');

const past = A({ id: 'p', date: '2026-09-08', service: 'ניקוי פנים' });
const b = buildNextClientBrief({ appointments: [A({ id: 'n' }), past], clients, now, startMinute: start, endMinute: end })!;
assert.equal(b.appt.id, 'n');
assert.equal(b.minutesUntil, 10);
assert.deepEqual(b.lastVisit, { service: 'ניקוי פנים', ago: 'לפני 3 שבועות' });
assert.equal(b.allergies, 'לטקס');
assert.equal(b.note, 'מתחתנת בנובמבר');
assert.equal(b.isNew, false);

// First visit: no history, and the card says so via isNew.
const first = buildNextClientBrief({ appointments: [A({ id: 'n', client_id: 'c2', name: 'חדשה' })], clients, now, startMinute: start, endMinute: end })!;
assert.equal(first.isNew, true);
assert.equal(first.note, '');

// Too early, already gone, cancelled: nothing.
assert.equal(buildNextClientBrief({ appointments: [A({ start_minute: 16 * 60 })], clients, now, startMinute: start, endMinute: end }), null, 'more than 45 minutes away');
assert.equal(buildNextClientBrief({ appointments: [A({ start_minute: 12 * 60 })], clients, now, startMinute: start, endMinute: end }), null, 'already started');
assert.equal(buildNextClientBrief({ appointments: [A({ confirmation_status: 'cancelled' })], clients, now, startMinute: start, endMinute: end }), null);
// A cancelled past visit is not "last time".
const c = buildNextClientBrief({ appointments: [A({ id: 'n' }), A({ id: 'p', date: '2026-09-08', confirmation_status: 'cancelled' })], clients, now, startMinute: start, endMinute: end })!;
assert.equal(c.lastVisit, null);
console.log('next client: ok');
