// Money-path hardening from the 2026-11-03 architecture review: failures alert instead of only logging, a lost subscription card
// makes Grow retry, a failed deposit/credit read is not "nothing paid", the drift check covers the payment columns and the unique
// indexes, and a paid Grow payment without a receipt is reported.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { throttled, moneyAlert } from './lib/moneyAlert.js';
import { REFERENCED_COLUMNS, REQUIRED_INDEXES } from './lib/referencedTables.js';

const rd = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n');
let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };

await ok('money alerts are throttled per key: the first goes out, repeats within an hour do not, another key does', () => {
  const t0 = 1_000_000;
  assert.equal(throttled('k:a', t0), false);
  assert.equal(throttled('k:a', t0 + 59 * 60 * 1000), true);
  assert.equal(throttled('k:b', t0 + 1), false);
  assert.equal(throttled('k:a', t0 + 61 * 60 * 1000), false, 'after the hour it alerts again');
});

await ok('a money alert never throws, and off Vercel it only logs (no database, no push)', async () => {
  const prev = process.env.VERCEL; delete process.env.VERCEL;
  const r = await moneyAlert('test:source', `unique message ${Date.now()}`, { id: 'x' });
  assert.deepEqual(r, { skipped: 'no_db' });
  if (prev !== undefined) process.env.VERCEL = prev;
});

await ok('a money alert with a db records to ops_events through raiseOpsAlert', async () => {
  const rows: unknown[] = [];
  const db = { from: (t: string) => ({ insert: (row: unknown) => { rows.push({ t, row }); return { select: () => ({ single: async () => ({ data: { id: 1 }, error: null }), maybeSingle: async () => ({ data: { id: 1 }, error: null }) }), then: (f: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(f) }; }, update: () => ({ eq: async () => ({ error: null }) }) }) };
  await moneyAlert('test:db', `with db ${Date.now()}`, { paymentId: 'p1' }, { db, severity: 'warning' });
  assert.ok(rows.some((r) => (r as { t: string }).t === 'ops_events'), 'written to the admin panel log');
});

await ok('every money failure site raises an alert, not only a log line', () => {
  const sites: Array<[string, string[]]> = [
    ['lib/grow/service.ts', ["'grow:receipt'", "'grow:double-payment'", "'grow:after-paid'", "'grow:approve'"]],
    ['app/api/grow/webhook/route.ts', ["'grow:ip-refused'", "'grow:webhook'"]],
    ['app/api/grow/notify/route.ts', ["'grow:ip-refused'", "'grow:notify'"]],
    ['app/api/grow/invoice/route.ts', ["'grow:ip-refused'", "'grow:invoice'"]],
    ['app/api/grow/_cancel.ts', ["'grow:credit'", "'grow:deposit-token'"]],
    ['app/api/grow/release-holds/route.ts', ["'grow:release-holds'"]],
    ['lib/billing/service.ts', ["'billing:unknown'", "'billing:run'"]],
    ['app/api/billing/charge-due/route.ts', ["'billing:run'"]],
    ['app/api/billing/grow-notify/route.ts', ["'billing:grow-notify'"]],
  ];
  for (const [file, keys] of sites) {
    const src = rd(file);
    for (const k of keys) assert.ok(src.includes(`moneyAlert(${k}`), `${file}: ${k}`);
  }
});

await ok('subscription card: a failed save answers 503 BEFORE the approve, so Grow retries and the card is not lost', () => {
  const r = rd('app/api/billing/grow-notify/route.ts');
  const fail = r.indexOf("saveCard after Grow token failed");
  const ret = r.indexOf('return done(503)', fail);
  assert.ok(fail > 0 && ret > fail, '503 in the saveCard catch');
  assert.ok(ret < r.indexOf('approveTransaction`'), 'returned before approveTransaction is called');
});

await ok('the till: a failed deposit or credit read is a 503, and the till says to check instead of showing nothing', () => {
  for (const f of ['app/api/grow/deposit/route.ts', 'app/api/grow/credit/route.ts']) {
    const src = rd(f);
    assert.ok(src.includes("{ success: false, error: 'lookup_failed' }, { status: 503 }"), f);
    assert.ok(!/lookup failed[^\n]*\n\s*return NextResponse\.json\(\{ success: true/.test(src), `${f}: no success on failure`);
  }
  const c = rd('app/GrowCashierCredit.jsx');
  assert.ok(c.includes('data-testid="deposit-lookup-failed"') && c.includes('.catch(failed)'));
  assert.ok(c.includes('!lookupFailed) return null'), 'the warning shows even when nothing else would');
});

await ok('schema drift: every column the Grow repo selects is checked, plus the unique indexes that stop a double charge', () => {
  const repo = rd('lib/grow/repo.ts');
  const select = repo.match(/const SELECT = '([^']+)'/)![1].split(',').map((s) => s.trim()).filter((c) => c !== 'id');
  for (const col of select) assert.ok(REFERENCED_COLUMNS.grow_payments.includes(col), `grow_payments.${col}`);
  assert.ok(REFERENCED_COLUMNS.receipts.includes('grow_payment_id'));
  assert.ok(REFERENCED_COLUMNS.billing_payments.includes('unique_identifier'));
  assert.deepEqual([...REQUIRED_INDEXES].sort(), ['billing_payments_one_success_per_period', 'billing_payments_unique_identifier_key', 'receipts_grow_payment_uniq']);
  const inv = rd('lib/invariants.js');
  assert.ok(inv.includes("'missing_money_indexes'") && inv.includes("o.kind === 'index'"));
  for (const i of REQUIRED_INDEXES) assert.ok(/create unique index if not exists/.test(rd(i.startsWith('receipts') ? 'supabase/migrations/add_audit_hardening_2026-10-18.sql' : i.includes('unique_identifier') ? 'supabase/migrations/add_kalmea_billing_grow.sql' : 'supabase/migrations/add_kalmea_billing.sql')) , i);
});

await ok('a NOT NULL violation is not mistaken for a missing column (no silent reduced insert)', () => {
  const repo = rd('lib/grow/repo.ts');
  const body = repo.match(/const isMissingColumn = ([^\n]+)/)![1];
  const fn = new Function(`return ${body.replace(/: \{[^)]*\} \| null\)/, ')').replace(/\(e: [^)]*\)/, '(e)')}`)() as (e: unknown) => boolean;
  assert.equal(fn({ code: '23502', message: 'null value in column "amount" violates not-null constraint' }), false);
  assert.equal(fn({ code: '42703', message: 'column "x" does not exist' }), true);
  assert.equal(fn({ code: 'PGRST204', message: "Could not find the 'transaction_token' column" }), true);
});

await ok('a paid Grow payment with no receipt is reported after an hour, whatever Grow\'s document says', () => {
  const inv = rd('lib/invariants.js');
  const i = inv.indexOf("safe('grow_paid_without_receipt'");
  assert.ok(i > 0);
  const block = inv.slice(i, inv.indexOf('});', i));
  assert.ok(block.includes(".eq('status', 'paid').is('receipt_id', null).lt('paid_at', since)") && !block.includes("invoice_url"));
});

await ok('deposit-request credit names its payment, works before the migration, and a retry is not a second credit', () => {
  const c = rd('app/api/grow/_cancel.ts');
  assert.ok(c.includes('grow_payment_id: p.id') && c.includes("error.code === 'PGRST204'") && c.includes("error.code === '23505'"));
  const sql = rd('supabase/migrations/grow_money_hardening_2026-11-03.sql');
  assert.ok(sql.includes('grow_payments_process_id_idx') && sql.includes('client_credits_grow_payment_uniq'));
  assert.ok(!/drop |delete |truncate /i.test(sql.replace(/^--.*$/gm, '')), 'nothing removed');
});

await ok('Grow HTTP calls have a bounded wait, and the billing run has a time budget under its limit', () => {
  assert.ok(rd('lib/grow/ops.ts').includes('signal: AbortSignal.timeout(20_000)'));
  assert.ok(rd('lib/grow/service.ts').includes('signal: AbortSignal.timeout(10_000)'));
  const cron = rd('app/api/billing/charge-due/route.ts');
  assert.ok(cron.includes('export const maxDuration = 300;') && cron.includes('budgetMs: 240_000'));
  assert.ok(rd('lib/billing/repo.ts').includes("readAllRows(db, 'billing_subscriptions'"), 'every subscription, paged');
});

console.log(`money hardening: ${n} ok`);
