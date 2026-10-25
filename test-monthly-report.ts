// The simple monthly report (lib/monthlyReport.ts): Israel-time month boundaries, last month on the SAME elapsed days,
// voided receipts out, exempt vs authorized dealer, the top treatment, the two observations, and the honest empty state.
import assert from 'node:assert/strict';
import { monthlyReport, israelDay, treatmentShares, topTreatment, lapsedClientCount, quietestWeekday } from './lib/monthlyReport.ts';
import { incomeTotals } from './lib/incomePeriod.js';

const VAT = 0.18;
// Receipts are stored zone-less in UTC ("2026-10-05T22:10:35"); parseDb reads them as UTC.
const rc = (id: number, at: string, amount: number, service = 'טיפול פנים', items?: unknown) => ({ id, created_at: at, amount, service, items: items === undefined ? '[]' : JSON.stringify(items) });
const NOW = new Date('2026-10-15T09:00:00Z'); // 12:00 in Israel (UTC+3 until Oct 25), the 15th

// ── Israel day boundaries ──
// The clocks go back on Oct 25 2026, so Israel is UTC+2 at the end of October: 22:00 UTC is midnight, Nov 1.
let d = israelDay('2026-10-31T22:00:00')!;
assert.deepEqual([d.year, d.month, d.day], [2026, 10, 1], 'late Oct 31 UTC is Nov 1 in Israel');
d = israelDay('2026-10-31T21:59:59')!; assert.deepEqual([d.month, d.day], [9, 31], 'still October 31 at 23:59 in Israel');
d = israelDay('2026-10-04T22:30:00')!; assert.deepEqual([d.month, d.day], [9, 5], 'summer: 22:30 UTC is 01:30 next day');
assert.equal(israelDay('2026-10-15T09:00:00')!.dow, 4, 'Oct 15 2026 is a Thursday');
assert.equal(israelDay('garbage'), null);

// A payment at 23:30 on Sep 30 in Israel summer time is Sep 30; at 00:30 Oct 1 it belongs to October.
const sepLast = rc(1, '2026-09-30T20:30:00', 100); // 23:30 Israel Sep 30
const octFirst = rc(2, '2026-09-30T21:30:00', 200); // 00:30 Israel Oct 1
let r = monthlyReport({ receipts: [sepLast, octFirst], status: 'exempt', vatRate: VAT, now: NOW });
assert.equal(r.income, 200, 'only the payment after Israeli midnight is October');

// ── same elapsed days: on the 15th, last month counts only its days 1..15 ──
const rs = [
  rc(10, '2026-10-03T08:00:00', 300), rc(11, '2026-10-14T08:00:00', 200),   // this month: 500
  rc(12, '2026-09-05T08:00:00', 150), rc(13, '2026-09-15T08:00:00', 100),   // last month, days 5 and 15: counted
  rc(14, '2026-09-16T08:00:00', 5000), rc(15, '2026-09-28T08:00:00', 5000), // last month, after day 15: NOT counted
  rc(16, '2026-10-20T08:00:00', 9999),                                      // later this month (clock-skew / future): not counted yet
];
r = monthlyReport({ receipts: rs, status: 'exempt', vatRate: VAT, now: NOW });
assert.equal(r.income, 500); assert.equal(r.prevIncome, 250, 'last month only through the 15th'); assert.equal(r.count, 2);
assert.ok(r.sentences[0].includes('100%') && r.sentences[0].includes('יותר מאותם 15 ימים בחודש שעבר') && r.sentences[0].includes('₪500'), r.sentences[0]);
// down
r = monthlyReport({ receipts: [rc(1, '2026-10-02T08:00:00', 100), rc(2, '2026-09-02T08:00:00', 400)], status: 'exempt', vatRate: VAT, now: NOW });
assert.ok(r.sentences[0].includes('75%') && r.sentences[0].includes('פחות'), r.sentences[0]);
// equal
r = monthlyReport({ receipts: [rc(1, '2026-10-02T08:00:00', 300), rc(2, '2026-09-02T08:00:00', 300)], status: 'exempt', vatRate: VAT, now: NOW });
assert.ok(r.sentences[0].includes('בדיוק כמו'), r.sentences[0]);
// no comparison available: said plainly, no invented percentage
r = monthlyReport({ receipts: [rc(1, '2026-10-02T08:00:00', 300)], status: 'exempt', vatRate: VAT, now: NOW });
assert.ok(r.sentences[0].includes('אין עם מה להשוות') && !r.sentences[0].includes('%'), r.sentences[0]);

// the 31st vs a 30-day month: last month is taken whole, never skipped
const END = new Date('2026-10-31T10:00:00Z');
r = monthlyReport({ receipts: [rc(1, '2026-10-02T08:00:00', 600), rc(2, '2026-09-30T08:00:00', 300), rc(3, '2026-09-01T08:00:00', 300)], status: 'exempt', vatRate: VAT, now: END });
assert.equal(r.prevIncome, 600, 'Sep 30 is inside "the first 31 days" of September');
// the 1st: one elapsed day against the 1st of last month
r = monthlyReport({ receipts: [rc(1, '2026-10-01T08:00:00', 100), rc(2, '2026-09-01T08:00:00', 100), rc(3, '2026-09-02T08:00:00', 900)], status: 'exempt', vatRate: VAT, now: new Date('2026-10-01T10:00:00Z') });
assert.equal(r.prevIncome, 100); assert.ok(r.sentences[0].includes('ביום הראשון'));
// January looks back to December of the previous year
r = monthlyReport({ receipts: [rc(1, '2027-01-04T08:00:00', 100), rc(2, '2026-12-03T08:00:00', 200), rc(3, '2026-12-20T08:00:00', 800)], status: 'exempt', vatRate: VAT, now: new Date('2027-01-10T08:00:00Z') });
assert.equal(r.prevIncome, 200);

// ── voided receipts are out (same rule as the income screen), a void still waiting for its credit document is not ──
const base = [rc(1, '2026-10-02T08:00:00', 300), rc(2, '2026-10-03T08:00:00', 200), rc(3, '2026-09-02T08:00:00', 400)];
r = monthlyReport({ receipts: base, voids: [{ receipt_id: 2 }, { receipt_id: 3 }], status: 'exempt', vatRate: VAT, now: NOW });
assert.equal(r.income, 300); assert.equal(r.count, 1); assert.equal(r.prevIncome, 0);
assert.ok(r.sentences[0].includes('אין עם מה להשוות'));
r = monthlyReport({ receipts: base, voids: [{ receipt_id: 2, credit_status: 'pending' }], status: 'exempt', vatRate: VAT, now: NOW });
assert.equal(r.income, 500, 'a void still waiting for its credit document counts, exactly as in lib/till');
// everything voided: the empty state, not zeros
r = monthlyReport({ receipts: [rc(1, '2026-10-02T08:00:00', 300)], voids: [{ receipt_id: 1 }], status: 'exempt', vatRate: VAT, now: NOW });
assert.equal(r.hasData, false); assert.deepEqual(r.sentences, []);

// ── exempt vs authorized dealer: the same incomeTotals as the income screen ──
const two = [rc(1, '2026-10-02T08:00:00', 118), rc(2, '2026-10-03T08:00:00', 118)];
const ex = monthlyReport({ receipts: two, status: 'exempt', vatRate: VAT, now: NOW });
const li = monthlyReport({ receipts: two, status: 'licensed', vatRate: VAT, now: NOW });
const co = monthlyReport({ receipts: two, status: 'company', vatRate: VAT, now: NOW });
assert.equal(ex.income, 236, 'exempt: what she took IS her turnover'); assert.equal(ex.netOfVat, false); assert.ok(!ex.sentences[0].includes('מע"מ'));
assert.equal(li.income, Math.round(incomeTotals([118, 118], 'licensed', VAT).net)); assert.equal(li.income, 200);
assert.equal(li.netOfVat, true); assert.ok(li.sentences[0].includes('לפני מע"מ'));
assert.equal(co.income, 200);

// ── empty and tiny tenants ──
r = monthlyReport({ receipts: [], status: 'exempt', vatRate: VAT, now: NOW });
assert.equal(r.hasData, false); assert.equal(r.income, 0); assert.deepEqual(r.sentences, []);
r = monthlyReport({ receipts: [rc(1, '2026-09-02T08:00:00', 400)], status: 'exempt', vatRate: VAT, now: NOW });
assert.equal(r.hasData, false, 'only last month has data: this month is still empty, and says so');
r = monthlyReport({ receipts: [rc(1, 'not-a-date', 400), { id: 2, created_at: null, amount: 5 }], status: 'exempt', vatRate: VAT, now: NOW });
assert.equal(r.hasData, false);
r = monthlyReport({ receipts: [rc(1, '2026-10-02T08:00:00', 0)], status: 'exempt', vatRate: VAT, now: NOW });
assert.equal(r.hasData, false, 'a free/package-covered visit alone is not income');

// ── treatment count wording ──
r = monthlyReport({ receipts: [rc(1, '2026-10-02T08:00:00', 100)], status: 'exempt', vatRate: VAT, now: NOW });
assert.equal(r.sentences[1], 'עד עכשיו עשית טיפול אחד.');
r = monthlyReport({ receipts: two, status: 'exempt', vatRate: VAT, now: NOW });
assert.equal(r.sentences[1], 'עד עכשיו עשית 2 טיפולים.');

// ── top treatment: items scaled to the amount, a discount shared, service text as the fallback ──
const sh = treatmentShares(rc(1, '2026-10-02T08:00:00', 90, 'x', [{ name: 'פנים', price: 100, qty: 1 }, { name: 'גבות', price: 50, qty: 1 }]));
assert.deepEqual(sh.map((s) => [s.name, Math.round(s.income)]), [['פנים', 60], ['גבות', 30]], '150 of items paid as 90: each item takes its share');
assert.deepEqual(treatmentShares(rc(1, '2026-10-02T08:00:00', 100, 'מניקור, פדיקור')).map((s) => s.income), [50, 50]);
assert.deepEqual(treatmentShares({ amount: 100, items: '{broken', service: 'גבות' }), [{ name: 'גבות', income: 100 }]);
assert.deepEqual(treatmentShares(rc(1, '2026-10-02T08:00:00', 0, 'גבות')), [], 'nothing was paid');
const tt = topTreatment([
  rc(1, '2026-10-02T08:00:00', 100, 'גבות', [{ name: 'גבות', price: 100, qty: 1 }]),
  rc(2, '2026-10-03T08:00:00', 100, 'גבות', [{ name: 'גבות', price: 100, qty: 1 }]),
  rc(3, '2026-10-04T08:00:00', 150, 'טיפול פנים', [{ name: 'טיפול פנים', price: 150, qty: 1 }]),
])!;
assert.deepEqual(tt, { name: 'גבות', income: 200 }, 'by income, not by how many times');
assert.equal(topTreatment([]), null);
r = monthlyReport({ receipts: [rc(1, '2026-10-02T08:00:00', 300, 'טיפול פנים')], status: 'exempt', vatRate: VAT, now: NOW });
assert.ok(r.sentences[2].includes('טיפול פנים') && r.sentences[2].includes('₪300'));

// ── observation: clients who have not come back ──
const T = israelDay(NOW)!;
const ap = (cid: string, date: string, extra: object = {}) => ({ client_id: cid, date, confirmation_status: 'confirmed', ...extra });
assert.equal(lapsedClientCount([ap('a', '2026-08-10')], T), 1, '66 days ago');
assert.equal(lapsedClientCount([ap('a', '2026-08-20')], T), 1, '56 days ago is exactly 8 weeks: counted');
assert.equal(lapsedClientCount([ap('a', '2026-08-21')], T), 0, '55 days: not yet');
assert.equal(lapsedClientCount([ap('a', '2026-08-10'), ap('a', '2026-10-30')], T), 0, 'she has a visit booked ahead');
assert.equal(lapsedClientCount([ap('a', '2026-08-10'), ap('a', '2026-10-01')], T), 0, 'her latest visit is recent');
assert.equal(lapsedClientCount([ap('a', '2026-08-10', { confirmation_status: 'cancelled' })], T), 0, 'a cancelled visit is not a visit');
assert.equal(lapsedClientCount([ap('a', '2026-08-10', { kind: 'personal' })], T), 0);
assert.equal(lapsedClientCount([ap('a', '2024-01-10')], T), 0, 'gone for years: not "has not come back"');
assert.equal(lapsedClientCount([{ client_id: null, date: '2026-08-10' }], T), 0);
const manyLapsed = ['a', 'b', 'c'].map((c) => ap(c, '2026-07-01'));
r = monthlyReport({ receipts: [rc(1, '2026-10-02T08:00:00', 300)], appointments: manyLapsed, status: 'exempt', vatRate: VAT, now: NOW });
assert.equal(r.observation?.kind, 'lapsed'); assert.ok(r.sentences[3].includes('3 לקוחות לא חזרו'));
assert.equal(r.sentences.length, 4);

// ── observation: the quietest weekday, only with real volume ──
// Sun..Thu: 6 each except Wednesday 1, over the last 8 weeks (all dated Sep 1 - Oct 14, 2026).
const busy: ReturnType<typeof rc>[] = [];
let id = 100;
const addOn = (iso: string, n: number) => { for (let i = 0; i < n; i++) busy.push(rc(id++, `${iso}T08:00:00`, 100)); };
addOn('2026-09-06', 6); addOn('2026-09-07', 6); addOn('2026-09-08', 6); addOn('2026-09-09', 1); addOn('2026-09-10', 6); // Sun..Thu; 09-09 is Wednesday
const q = quietestWeekday(busy, T)!;
assert.deepEqual(q, { dow: 3, count: 1, total: 25 });
assert.equal(quietestWeekday(busy.slice(0, 10), T), null, 'too little data to say anything');
const flat: ReturnType<typeof rc>[] = [];
for (const day of ['2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09']) for (let i = 0; i < 5; i++) flat.push(rc(id++, `${day}T08:00:00`, 100));
assert.equal(quietestWeekday(flat, T), null, 'evenly busy: nothing is "quiet"');
const old: ReturnType<typeof rc>[] = busy.map((b) => ({ ...b, created_at: String(b.created_at).replace('2026-09', '2026-05') }));
assert.equal(quietestWeekday(old, T), null, 'older than 8 weeks does not count');
r = monthlyReport({ receipts: [...busy, rc(1, '2026-10-02T08:00:00', 300)], status: 'exempt', vatRate: VAT, now: NOW });
assert.equal(r.observation?.kind, 'quiet');
assert.ok(r.sentences[3].startsWith('יום רביעי הוא היום הכי שקט') && r.sentences[3].includes('טיפול אחד מתוך 26'), r.sentences[3]);
// a single lapsed client is mentioned only when there is no quiet weekday to say
r = monthlyReport({ receipts: [rc(1, '2026-10-02T08:00:00', 300)], appointments: [ap('a', '2026-07-01')], status: 'exempt', vatRate: VAT, now: NOW });
assert.ok(r.sentences[3].startsWith('לקוחה אחת לא חזרה'));
// no observation at all is fine: three sentences
r = monthlyReport({ receipts: [rc(1, '2026-10-02T08:00:00', 300)], status: 'exempt', vatRate: VAT, now: NOW });
assert.equal(r.sentences.length, 3);
// the shekel sign sits right against its digits (a space can send it to the wrong end of an RTL line)
for (const s of r.sentences) assert.ok(!/₪\s/.test(s), s);

// the word the system must never use for its payment confirmation
for (const s of monthlyReport({ receipts: busy, appointments: manyLapsed, status: 'licensed', vatRate: VAT, now: NOW }).sentences) assert.ok(!s.includes('קבלה'), s);

console.log('monthly report: all checks passed');
