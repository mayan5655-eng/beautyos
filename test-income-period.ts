// The income summary's period logic (lib/incomePeriod.js): month by month for EVERY tax status, and a net figure that is right for an
// exempt dealer. Uses the demo seed's own receipts (lib/demoWeek.ts) so "October and September both have real figures" is checked on
// the data the demo tenant really gets.
import assert from 'node:assert/strict';
import { effectiveMode, periodFilter, periodLabel, incomeTotals } from './lib/incomePeriod.js';
import { buildDemoWeek } from './lib/demoWeek.ts';

const VAT = 0.18;
const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

// ── the mode: everyone can choose "monthly"; the default follows the registration ──
for (const status of ['exempt', 'licensed', 'company']) assert.equal(effectiveMode(status, 'monthly'), 'monthly', `${status} can look at a month`);
assert.equal(effectiveMode('exempt', 'bimonthly'), 'annual', 'exempt default is the year');
assert.equal(effectiveMode('exempt', 'annual'), 'annual');
assert.equal(effectiveMode('licensed', 'bimonthly'), 'bimonthly', 'licensed default is bi-monthly');
assert.equal(effectiveMode('licensed', 'annual'), 'bimonthly', 'a stale "annual" never gives a licensed dealer a year view of VAT');

// ── labels and filters ──
assert.equal(periodLabel({ mode: 'monthly', idx: 9, year: 2026, monthNames: MONTHS }), 'אוקטובר 2026');
assert.equal(periodLabel({ mode: 'bimonthly', idx: 4, year: 2026, monthNames: MONTHS }), 'ספטמבר–אוקטובר 2026');
assert.equal(periodLabel({ mode: 'annual', idx: 0, year: 2026, monthNames: MONTHS }), 'שנת 2026');
assert.ok(periodFilter({ mode: 'monthly', idx: 9 })(new Date(2026, 9, 15)) && !periodFilter({ mode: 'monthly', idx: 9 })(new Date(2026, 8, 15)));
assert.ok(periodFilter({ mode: 'bimonthly', idx: 4 })(new Date(2026, 8, 30)) && periodFilter({ mode: 'bimonthly', idx: 4 })(new Date(2026, 9, 1)));
assert.ok(periodFilter({ mode: 'annual', idx: 0 })(new Date(2026, 0, 1)));

// ── net: an exempt dealer's takings ARE her turnover; a dealer who charges VAT has it inside the takings ──
const ex = incomeTotals([100, 200, 300], 'exempt', VAT);
assert.equal(ex.gross, 600); assert.equal(ex.net, 600, 'exempt: no VAT is carved out of what she took'); assert.equal(ex.vatDue, 0); assert.equal(ex.count, 3);
const li = incomeTotals([118, 118], 'licensed', VAT);
assert.equal(li.gross, 236); assert.ok(Math.abs(li.net - 200) < 1e-9, 'licensed: 236 incl. 18% VAT is 200 net'); assert.ok(Math.abs(li.vatDue - 36) < 1e-9);
assert.equal(incomeTotals([], 'exempt', VAT).gross, 0); assert.equal(incomeTotals(['x', null, 50], 'licensed', VAT).gross, 50, 'junk amounts count as zero');

// ── on the demo tenant's own receipts: October AND September both have real money, for every status ──
const services = [
  { name: 'ניקוי פנים עמוק', price: 300, duration: 75 }, { name: 'טיפול פנים קלאסי', price: 260, duration: 60 },
  { name: 'פילינג כימי', price: 380, duration: 45 }, { name: 'הידרפייסיאל', price: 500, duration: 60 },
  { name: 'מיקרונידלינג', price: 650, duration: 60 }, { name: 'הסרת שיער בלייזר', price: 220, duration: 30 },
];
const w = buildDemoWeek(services, 14, new Date(Date.UTC(2026, 9, 6, 17, 0)));
const all = [...w.receipts, ...w.lastMonth];
const monthOf = (m: number) => all.filter((r) => { const d = new Date(r.createdAtUtc); return d.getFullYear() === 2026 && periodFilter({ mode: 'monthly', idx: m })(d); }).map((r) => r.amount);
for (const status of ['exempt', 'licensed']) {
  const oct = incomeTotals(monthOf(9), status, VAT), sep = incomeTotals(monthOf(8), status, VAT);
  assert.ok(oct.gross > 0 && oct.count > 0, `${status}: October has real figures (${oct.gross}, ${oct.count})`);
  assert.ok(sep.gross > 0 && sep.count > 0, `${status}: September has real figures (${sep.gross}, ${sep.count})`);
  assert.notEqual(oct.gross, sep.gross, 'two different months');
  if (status === 'exempt') assert.equal(oct.net, oct.gross); else assert.ok(oct.net < oct.gross);
}

console.log('income period: ok');
