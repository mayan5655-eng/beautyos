import assert from 'node:assert/strict';
import { buildClosingList, joinNames, ALL_CLEAR_HE } from './lib/closingList.js';

const end = (a: any) => (a.start_minute ?? null) === null ? null : a.start_minute + (a.duration ?? 60);
const now = new Date(2026, 8, 29, 18, 0); // Tue 29.9, 18:00
const A = (o: any) => ({ id: 'x', name: 'דנה', date: '2026-09-29', start_minute: 10 * 60, duration: 60, price: 250, confirmation_status: 'confirmed', ...o });

// Names, said the way a person says them.
assert.equal(joinNames(['דנה']), 'דנה');
assert.equal(joinNames(['דנה', 'לאה']), 'דנה ולאה');
assert.equal(joinNames(['דנה', 'לאה', 'מיה']), 'דנה, לאה ומיה');
assert.equal(joinNames(['א', 'ב', 'ג', 'ד', 'ה']), 'א, ב, ג ועוד 2');
assert.equal(joinNames([]), '');

// A quiet day: everything ended, everything has a receipt, tomorrow confirmed.
let r = buildClosingList({ appointments: [A({ id: '1' })], receipts: [{ appointment_id: '1' }], now, endMinute: end });
assert.equal(r.allClear, true);
assert.deepEqual(r.items, []);
assert.equal(ALL_CLEAR_HE, 'אין כלום שמחכה לך. אפשר ללכת הביתה.');

// Ended today, no receipt: one line, with the appointment to open the till on.
r = buildClosingList({ appointments: [A({ id: '1', name: 'דנה' }), A({ id: '2', name: 'לאה', start_minute: 12 * 60 })], receipts: [], now, endMinute: end });
assert.equal(r.items[0].key, 'no-receipt-today');
assert.equal(r.items[0].text, 'היום עוד אין קבלה על: דנה ולאה.');
assert.equal(r.items[0].appt.id, '1');

// Not ended yet, cancelled, free, and already-paid visits are not on the list.
r = buildClosingList({ appointments: [
  A({ id: 'late', start_minute: 17 * 60 + 30 }),          // ends 18:30, still in progress at 18:00
  A({ id: 'gone', confirmation_status: 'cancelled' }),
  A({ id: 'free', price: 0 }),
  A({ id: 'paid' }),
], receipts: [{ appointment_id: 'paid' }], now, endMinute: end });
assert.equal(r.allClear, true, JSON.stringify(r.items));

// Yesterday's forgotten one shows, and is said without accusing anyone of not paying.
r = buildClosingList({ appointments: [A({ id: 'y', name: 'מיה', date: '2026-09-28' })], receipts: [], now, endMinute: end });
assert.equal(r.items[0].key, 'no-receipt-earlier');
assert.ok(!/שילמ/.test(r.items[0].text), 'says "no receipt yet", never "did not pay"');
// Three days back is too old to nag about.
r = buildClosingList({ appointments: [A({ id: 'old', date: '2026-09-25' })], receipts: [], now, endMinute: end });
assert.equal(r.allClear, true);

// Tomorrow's unconfirmed.
r = buildClosingList({ appointments: [A({ id: 't', name: 'ליאת', date: '2026-09-30', confirmation_status: 'pending' }), A({ id: 't2', name: 'נועה', date: '2026-09-30' })], receipts: [], now, endMinute: end });
assert.deepEqual(r.items.map((i) => i.text), ['למחר עוד לא אישרו: ליאת.']);

// Never more than three lines.
r = buildClosingList({ appointments: [A({ id: '1' }), A({ id: 'y', date: '2026-09-28' }), A({ id: 't', date: '2026-09-30', confirmation_status: 'pending' })], receipts: [], now, endMinute: end });
assert.equal(r.items.length, 3);
console.log('closing list: ok');
