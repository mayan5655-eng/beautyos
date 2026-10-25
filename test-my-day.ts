import assert from 'node:assert/strict';
import { buildMyDay, buildTimeline, buildNeeds, durationHe, waitingHe, telHref, hhmm, myDayEnabled, CAPS, MIN_GAP_MINUTES } from './lib/myDay.js';

const startMinute = (a: any) => (a.start_minute ?? null);
const endMinute = (a: any) => (a.start_minute === null || a.start_minute === undefined ? null : a.start_minute + (a.duration ?? 60));
const isPersonal = (a: any) => a.kind === 'personal';
const hasPhone = (a: any) => !!a.phone;
const morning = new Date(2026, 9, 25, 8, 0); // Sun 25.10.2026 08:00
const A = (o: any = {}) => ({ id: 'x', name: 'דנה', service: 'ניקוי פנים', date: '2026-10-25', start_minute: 9 * 60, duration: 60, price: 250, confirmation_status: 'confirmed', phone: '050', ...o });

// ── words ──
assert.equal(durationHe(45), '45 דק׳');
assert.equal(durationHe(60), 'שעה');
assert.equal(durationHe(90), 'שעה וחצי');
assert.equal(durationHe(120), 'שעתיים');
assert.equal(durationHe(150), 'שעתיים וחצי');
assert.equal(durationHe(200), '3 שע׳ ו-20 דק׳');
assert.equal(hhmm(9 * 60 + 5), '09:05');
assert.equal(hhmm(null), '');
assert.equal(telHref('050-123 4567'), 'tel:0501234567');
assert.equal(telHref(''), '');
assert.equal(telHref('12'), '');
// 25.10.2026 is the night Israel's clock goes back an hour; times are picked so the test reads the same in UTC (Vercel) and Israel.
assert.equal(waitingHe(new Date(2026, 9, 24, 7, 0).toISOString(), morning), 'פנתה אתמול');
assert.equal(waitingHe(new Date(2026, 9, 22, 7, 0).toISOString(), morning), 'פנתה לפני 3 ימים');
assert.equal(waitingHe(null, morning), '');

// ── timeline: order, gaps, state ──
let t = buildTimeline({ entries: [A({ id: '2', name: 'לאה', start_minute: 12 * 60 }), A({ id: '1', name: 'דנה' })], now: morning, startMinute, endMinute, isPersonal });
assert.deepEqual(t.rows.map((r: any) => r.id), ['1', '2'], 'sorted by start');
assert.equal(t.rows[0].state, 'next');
assert.equal(t.rows[1].state, 'later');
assert.equal(t.rows[0].gapAfter?.minutes, 120, 'free from 10:00 to 12:00');
assert.equal(t.rows[0].gapAfter?.until, 'לאה');
assert.equal(t.rows[1].gapAfter, null);
assert.equal(t.freeMinutes, 120);
assert.equal(t.headline, '2 תורים היום, מ-09:00 עד 13:00');
assert.equal(t.count, 2);

// A short or back-to-back gap is not announced.
t = buildTimeline({ entries: [A({ id: '1' }), A({ id: '2', start_minute: 10 * 60 + MIN_GAP_MINUTES - 1 })], now: morning, startMinute, endMinute, isPersonal });
assert.equal(t.rows[0].gapAfter, null);

// Cancelled and unreadable rows are not on the day; personal time is, but is not a "תור".
t = buildTimeline({ entries: [A({ id: 'c', confirmation_status: 'cancelled' }), A({ id: 'n', start_minute: null, hour: null }), A({ id: 'p', kind: 'personal', note: 'רואה חשבון', start_minute: 11 * 60 })], now: morning, startMinute, endMinute, isPersonal });
assert.deepEqual(t.rows.map((r: any) => r.id), ['p']);
assert.equal(t.rows[0].title, 'רואה חשבון');
assert.equal(t.count, 0);
assert.equal(t.headline, 'אין תורים היום. יום רגוע ☕');

// One visit.
t = buildTimeline({ entries: [A()], now: morning, startMinute, endMinute, isPersonal });
assert.equal(t.headline, 'תור אחד היום, ב-09:00');

// Past / current / next, and a gap that already started is only counted from now.
const noon = new Date(2026, 9, 25, 10, 30);
t = buildTimeline({ entries: [A({ id: '1' }), A({ id: '2', start_minute: 10 * 60, duration: 60 }), A({ id: '3', start_minute: 13 * 60 })], now: noon, startMinute, endMinute, isPersonal });
assert.deepEqual(t.rows.map((r: any) => r.state), ['done', 'now', 'next']);
assert.equal(t.rows[1].gapAfter?.minutes, 120, '11:00-13:00');
const lateNoon = new Date(2026, 9, 25, 11, 30);
t = buildTimeline({ entries: [A({ id: '2', start_minute: 10 * 60 }), A({ id: '3', start_minute: 13 * 60 })], now: lateNoon, startMinute, endMinute, isPersonal });
assert.equal(t.rows[0].gapAfter?.minutes, 90, 'only the part still ahead');

// ── needs ──
const evening = new Date(2026, 9, 25, 18, 0);
const common = { now: evening, endMinute, startMinute, hasPhone };
let n = buildNeeds({ ...common, clientAppts: [A({ id: 'p1', name: 'דנה' })], tomorrowAppts: [], receipts: [], leads: [] });
assert.equal(n.items.length, 1);
assert.equal(n.items[0].kind, 'pay');
assert.equal(n.items[0].action, 'רישום תשלום');
assert.ok(!/שילמ/.test(n.items[0].text + n.items[0].sub), 'says "no payment recorded", never "did not pay"');
assert.equal(n.items[0].appt.id, 'p1');
// Paid, free and cancelled visits are not on it.
n = buildNeeds({ ...common, clientAppts: [A({ id: 'a' }), A({ id: 'b', price: 0 }), A({ id: 'c', confirmation_status: 'cancelled' })], tomorrowAppts: [], receipts: [{ appointment_id: 'a' }], leads: [] });
assert.equal(n.items.length, 0);

// Tomorrow: unconfirmed with a phone; unsent first; confirmed / cancelled / no phone excluded.
const tm = (o: any) => A({ date: '2026-10-26', confirmation_status: 'pending', confirmation_sent: false, ...o });
n = buildNeeds({ ...common, now: morning, clientAppts: [], receipts: [], leads: [], tomorrowAppts: [
  tm({ id: 's', name: 'שרה', start_minute: 9 * 60, confirmation_sent: true }),
  tm({ id: 'r', name: 'רות', start_minute: 15 * 60 }),
  tm({ id: 'ok', confirmation_status: 'confirmed' }),
  tm({ id: 'x', confirmation_status: 'cancelled' }),
  tm({ id: 'np', phone: '' }),
] });
assert.deepEqual(n.items.map((i: any) => i.appt.id), ['r', 's']);
assert.equal(n.items[0].action, 'תזכורת בוואטסאפ');
assert.equal(n.items[1].action, 'הזכירי שוב');
assert.equal(n.items[0].text, 'רות: מחר ב-15:00, עוד לא אישרה');

// Leads: only unanswered ones with a number, within two weeks, oldest first; closed ones never; not before leads loaded.
const lead = (o: any) => ({ id: 'l', name: 'נועה', phone: '052-111 2222', status: 'new', created_at: new Date(2026, 9, 24, 7, 0).toISOString(), service_interest: 'גבות', ...o });
const leads = [lead({ id: 'new' }), lead({ id: 'old', created_at: new Date(2026, 9, 22, 7, 0).toISOString(), status: 'no_answer' }), lead({ id: 'closed', status: 'closed' }), lead({ id: 'nophone', phone: '' }), lead({ id: 'ancient', created_at: new Date(2026, 8, 1).toISOString() })];
n = buildNeeds({ ...common, now: morning, clientAppts: [], tomorrowAppts: [], receipts: [], leads });
assert.deepEqual(n.items.map((i: any) => i.lead.id), ['old', 'new']);
assert.equal(n.items[0].kind, 'call');
assert.equal(n.items[0].href, 'tel:0521112222');
assert.equal(n.items[1].sub, 'פנתה אתמול · גבות');
n = buildNeeds({ ...common, now: morning, clientAppts: [], tomorrowAppts: [], receipts: [], leads, leadsReady: false });
assert.equal(n.items.length, 0, 'leads still loading: say nothing rather than guess');

// Order and caps: payments, then reminders, then leads; never more than CAPS.total; the rest is counted.
const many = Array.from({ length: 6 }, (_, i) => A({ id: 'p' + i, name: 'ל' + i, start_minute: 8 * 60 + i }));
n = buildNeeds({ ...common, clientAppts: many, tomorrowAppts: Array.from({ length: 6 }, (_, i) => tm({ id: 't' + i })), receipts: [], leads: Array.from({ length: 4 }, (_, i) => lead({ id: 'q' + i })) });
assert.equal(n.items.length, CAPS.total);
assert.deepEqual(n.items.map((i: any) => i.kind), ['pay', 'pay', 'remind', 'remind', 'remind']);
assert.equal(n.more, 6 + 6 + 4 - CAPS.total);


// Receipts not loaded yet (history still loading): no 'no payment recorded' guesses.
n = buildNeeds({ ...common, clientAppts: [A({ id: 'p1' })], tomorrowAppts: [], receipts: [], leads: [], paymentsReady: false });
assert.equal(n.items.length, 0, 'receipts still loading: say nothing rather than guess');

// A nails-only day: long back-to-back sets, a lunch break. Nothing the card says by itself is cosmetics wording.
const nails = [
  A({ id: 'n1', name: 'שני', service: 'בניית ציפורניים', start_minute: 9 * 60, duration: 120, price: 280 }),
  A({ id: 'n2', name: 'גלית', service: 'לק ג׳ל', start_minute: 11 * 60, duration: 90, price: 150 }),
  A({ id: 'n3', name: 'עדי', service: 'מילוי', start_minute: 13 * 60 + 30, duration: 90, price: 200 }),
];
const dn = buildMyDay({ entries: nails, clientAppts: nails, tomorrowAppts: [], receipts: [], leads: [], now: morning, startMinute, endMinute, isPersonal, hasPhone });
assert.equal(dn.headline, '3 תורים היום, מ-09:00 עד 15:00');
assert.deepEqual(dn.rows.map((r: any) => r.gapAfter?.minutes ?? null), [null, 60, null], 'only the lunch break is free time');
assert.equal(dn.rows[0].sub, 'בניית ציפורניים');
assert.ok(!/טיפול|פנים|קוסמטי/.test(JSON.stringify({ h: dn.headline, r: dn.rows.map((r: any) => [r.title, r.sub]), n: dn.needs.map((i: any) => [i.text, i.action]) })), 'no cosmetics words of our own');

// ── the whole card ──
// A brand-new empty tenant: nothing at all, and it is called empty (the dashboard shows the warm welcome).
let d = buildMyDay({ entries: [], clientAppts: [], tomorrowAppts: [], receipts: [], leads: [], now: morning, startMinute, endMinute, isPersonal, hasPhone });
assert.equal(d.isEmpty, true);
assert.equal(d.count, 0);
assert.equal(d.more, 0);
// Missing arrays do not throw.
d = buildMyDay({ now: morning, startMinute, endMinute, isPersonal, hasPhone } as any);
assert.equal(d.isEmpty, true);
// A quiet day with visits is not empty.
d = buildMyDay({ entries: [A()], clientAppts: [A()], tomorrowAppts: [], receipts: [], leads: [], now: morning, startMinute, endMinute, isPersonal, hasPhone });
assert.equal(d.isEmpty, false);

// Thousands of rows: result stays small and fast.
const big = Array.from({ length: 20000 }, (_, i) => A({ id: 'b' + i, date: `2025-${String(1 + (i % 12)).padStart(2, '0')}-10`, name: 'ל' + i }));
const t0 = Date.now();
d = buildMyDay({ entries: [A()], clientAppts: big, tomorrowAppts: [], receipts: [], leads: Array.from({ length: 5000 }, (_, i) => lead({ id: 'z' + i, status: 'closed' })), now: morning, startMinute, endMinute, isPersonal, hasPhone });
assert.ok(Date.now() - t0 < 500, `20k rows took ${Date.now() - t0}ms`);
assert.ok(d.needs.length <= CAPS.total);

// ── flag ──
assert.equal(myDayEnabled(undefined), true);
assert.equal(myDayEnabled({}), true);
assert.equal(myDayEnabled({ automations: { feature_flags: { my_day: false } } }), false);
assert.equal(myDayEnabled({ automations: { feature_flags: { skin_scan: false } } }), true);

console.log('my-day OK');
