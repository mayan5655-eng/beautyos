// The accountant file and the profit line: VAT handled per registration, rows sorted, totals match the screen.
import assert from 'node:assert/strict';
import { accountantSheets, periodProfit } from './lib/accountantPack.js';

// Licensed: net 1000, expenses 236 incl. 36 VAT -> profit 1000 - 200 = 800.
assert.equal(periodProfit({ net: 1000, expensesTotal: 236, inputVat: 36, status: 'licensed' }), 800);
// Exempt: no VAT either side.
assert.equal(periodProfit({ net: 1000, expensesTotal: 236, inputVat: 0, status: 'exempt' }), 764);

const s = accountantSheets({
  businessName: 'סטודיו', statusLabel: 'עוסק פטור', rangeLabel: 'אוקטובר 2026', status: 'exempt',
  totals: { gross: 300, net: 300, vatDue: 0, count: 2 }, expensesTotal: 50, inputVat: 0,
  receipts: [
    { created_at: '2026-10-12T09:00:00Z', client_name: 'ב', service: 'לק', payment_method: 'cash', amount: 120, tip: 10 },
    { created_at: '2026-10-02T21:30:00Z', client_name: 'א', service: 'בניה', payment_method: 'bit', amount: 180 },
  ],
  expenses: [{ expense_date: '2026-10-05', category: 'חומרים', description: 'ג׳ל', amount: 50 }],
});
assert.equal(s.profit, 250);
assert.equal(s.receipts.length, 3);
assert.equal(s.receipts[1][0], '2026-10-03', 'Israel date, sorted: 21:30Z on the 2nd is the 3rd in Israel');
assert.equal(s.receipts[2][5], 10);
assert.equal(s.expenses[1][3], 50);
assert.ok(!s.summary.some((row) => String(row[0] || '').includes('מס תשומות')), 'no VAT rows for an exempt dealer');
console.log('accountant pack: ok');
