// A loyalty reward paid by a Grow link is consumed by the SERVER when Grow says it was paid (Vercel security review on PR #20,
// "late payers can reuse loyalty rewards"). Before this, only the owner's browser (GrowChargePanel onPaid, which stops polling after
// about four minutes) recorded it, so a link paid later left the card ready and the same reward could discount the next visit too.
//
// Proven here, with an in-memory database that has the same unique indexes as the real one:
//   * a late paid callback (no browser at all) writes exactly one redemption and one 🎁 mark, and the card is no longer ready;
//   * a retried callback (and the "first callback died before the receipt" retry) never redeems twice;
//   * the till's own onPaid write plus the server's are one redemption;
//   * before add_loyalty_2026-11-05.sql has run, creating the charge still works (the real repo drops the column) and the payment is
//     recorded as before;
//   * the charge route validates the intent (her client, 1..100) and never takes the tenant from the browser.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCharge, applyNotification, applyNotificationByProcess } from './lib/grow/service.ts';
import type { GrowRepo, GrowPayment, LoyaltyRedemptionRow } from './lib/grow/service.ts';
import { supabaseGrowRepo } from './lib/grow/repo.ts';
import { loyaltyConfig, loyaltyState, isRewardReceipt, itemsOf, parseLoyaltyIntent, rewardAtTill, loyaltyMarker } from './lib/loyalty.js';

let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };

const TENANT = '00000000-0000-4000-8000-0000000000aa'; // a test tenant, never a real one
const CLIENT = 'c1';
const SERVICES = ['טיפול פנים'];
const cfg = loyaltyConfig({ automations: { loyalty: { enabled: true, every: 5, reward: 'הטיפול השישי במתנה', reward_kind: 'pct', reward_pct: 50 } } });
const day = (d: number) => new Date(Date.UTC(2026, 10, 1, 9) - d * 86400000).toISOString();
const NOW = Date.UTC(2026, 10, 8, 12);
// Five paid visits: the card is full and the reward is ready.
const earned = () => Array.from({ length: 5 }, (_, i) => ({
  id: `old${i}`, client_id: CLIENT, appointment_id: `a${i}`, service: 'טיפול פנים', amount: 300, payment_method: 'מזומן',
  items: JSON.stringify([{ name: 'טיפול פנים', price: 300, qty: 1 }]), created_at: day(10 - i),
}));

/** The database as the Grow flow sees it, with receipts_grow_payment_uniq and loyalty_redemptions_one_per_receipt. */
function memoryDb(o: { columnMissing?: boolean } = {}) {
  const payments = new Map<string, GrowPayment & Record<string, unknown>>();
  const receipts: Record<string, unknown>[] = [];
  const redemptions: (LoyaltyRedemptionRow & { created_at: string })[] = [];
  let seq = 0;
  const repo: GrowRepo = {
    async insertPayment(row) {
      if (o.columnMissing && 'loyalty_redemption' in row) { const { loyalty_redemption: _l, ...rest } = row; row = rest; }
      const p = { id: `p${++seq}`, process_id: null, receipt_id: null, updated_at: null, ...row } as GrowPayment & Record<string, unknown>;
      payments.set(p.id, p); return { ...p };
    },
    async updatePayment(id, patch) { Object.assign(payments.get(id)!, patch); },
    async markPaid(id, patch) { const p = payments.get(id)!; if (p.status !== 'created') return null; Object.assign(p, patch); return { ...p }; },
    async findByToken(t) { const p = [...payments.values()].find((x) => x.notify_token === t); return p ? { ...p } : null; },
    async findByProcessId(pid) { const p = [...payments.values()].find((x) => x.process_id === pid); return p ? { ...p } : null; },
    async insertReceipt(row) {
      const dup = receipts.find((r) => r.grow_payment_id && r.grow_payment_id === row.grow_payment_id);
      if (dup) return { id: String(dup.id) }; // the repo hands back the first receipt on 23505
      const r = { id: `r${++seq}`, created_at: new Date(NOW).toISOString(), ...row }; receipts.push(r); return { id: r.id };
    },
    async setReceiptDocument() {},
    async loyaltyIntentOf(id) { return o.columnMissing ? null : (payments.get(id)?.loyalty_redemption ?? null); },
    async insertLoyaltyRedemption(row) {
      if (o.columnMissing) return 'missing';
      if (redemptions.some((x) => x.receipt_id === row.receipt_id)) return 'already';
      redemptions.push({ ...row, created_at: new Date(NOW).toISOString() }); return 'inserted';
    },
  };
  return { repo, payments, receipts, redemptions };
}

const growFetch = (async () => new Response(JSON.stringify({ status: 1, err: '', data: { processId: 4242, processToken: 't', url: 'https://pay.test/p' } }), { status: 200 })) as unknown as typeof fetch;
const creds = { apiKey: 'KEY', pageCode: 'CARD', apiBase: 'https://grow.test/api' };
let tok = 0;
const depsFor = (repo: GrowRepo) => ({ repo, creds, fetchImpl: growFetch, appUrl: 'https://k.test', newToken: () => String(++tok).padStart(48, 'x'), now: () => new Date(NOW) });
const paidCb = (tx = '9') => ({ 'data[processId]': '4242', 'data[transactionId]': tx, 'data[sum]': '150', 'data[statusCode]': '2', 'data[transactionTypeId]': '1' });

/** The till applies the ready reward and makes a Grow link for the discounted visit, as app/beautyos.jsx + GrowChargePanel do. */
async function chargeWithReward(repo: GrowRepo) {
  const r = rewardAtTill(cfg, [{ name: 'טיפול פנים', price: 300 }]);
  const intent = parseLoyaltyIntent({ reward: cfg.reward, stampsUsed: r.marker.loyalty_every })!;
  const res = await createCharge({
    tenantId: TENANT, userId: 'her', amount: 150, description: 'טיפול פנים', clientName: 'דנה כהן', phone: '0501234567', clientId: CLIENT,
    loyalty: { client_id: CLIENT, ...intent },
  }, depsFor(repo));
  assert.equal(res.ok, true);
  return res as { ok: true; paymentId: string };
}
const card = (db: ReturnType<typeof memoryDb>) => loyaltyState({
  config: cfg, clientId: CLIENT, receipts: [...earned(), ...db.receipts], redemptions: db.redemptions, serviceNames: SERVICES, now: NOW,
});

await ok('the card is ready before the visit (the setup this file relies on)', () => {
  assert.equal(card(memoryDb()).ready, true);
});

await ok('a LATE webhook-paid reward payment (no browser) gives exactly one redemption and the card is no longer ready', async () => {
  for (const via of ['notify', 'webhook'] as const) {
    const db = memoryDb();
    const { paymentId } = await chargeWithReward(db.repo);
    const stored = db.payments.get(paymentId)!.loyalty_redemption as Record<string, unknown>;
    assert.deepEqual(stored, { client_id: CLIENT, reward: cfg.reward, stamps_used: 5 }, 'the intent is stored with the payment');
    const p = db.payments.get(paymentId)!;
    const r = via === 'notify' ? await applyNotification(paidCb(), p.notify_token, depsFor(db.repo)) : await applyNotificationByProcess(paidCb(), depsFor(db.repo));
    assert.equal(r.status, 'paid', via);
    assert.equal(db.receipts.length, 1);
    assert.equal(db.redemptions.length, 1, `${via}: one ledger row`);
    assert.deepEqual({ ...db.redemptions[0], created_at: undefined }, { tenant_id: TENANT, client_id: CLIENT, receipt_id: db.receipts[0].id, reward: cfg.reward, every: 5, stamps_used: 5, created_at: undefined });
    const marks = itemsOf(db.receipts[0]).filter((i) => i.loyalty_reward === true);
    assert.equal(marks.length, 1, 'one 🎁 mark on the receipt');
    assert.deepEqual(marks[0], loyaltyMarker({ id: `loyalty-${paymentId}`, reward: cfg.reward, stampsUsed: 5 }), 'the till\'s marker shape');
    assert.equal(marks[0].price, 0);
    assert.match(String(db.receipts[0].note), /🎁 מתנת כרטיסיית נאמנות/);
    const s = card(db);
    assert.equal(s.ready, false, `${via}: the reward cannot be given again`);
    assert.equal(s.stamps, 0);
    assert.equal(s.history.filter((h: { kind: string }) => h.kind === 'redeem').length, 1, 'the mark and the row are one redemption');
    // Counting from the receipt alone (the ledger not read): still the reward visit, still not ready.
    assert.equal(isRewardReceipt(db.receipts[0]), true);
    assert.equal(loyaltyState({ config: cfg, clientId: CLIENT, receipts: [...earned(), ...db.receipts], serviceNames: SERVICES, now: NOW }).ready, false);
  }
});

await ok('a retried webhook does not redeem twice, nor does the "first callback died before the receipt" retry', async () => {
  const db = memoryDb();
  const { paymentId } = await chargeWithReward(db.repo);
  const tokn = db.payments.get(paymentId)!.notify_token;
  assert.equal((await applyNotification(paidCb(), tokn, depsFor(db.repo))).status, 'paid');
  assert.equal((await applyNotification(paidCb(), tokn, depsFor(db.repo))).status, 'already');
  assert.equal((await applyNotificationByProcess(paidCb(), depsFor(db.repo))).status, 'already');
  // The first callback "died" after the receipt and the ledger row but before receipt_id reached the payment: a retry minutes later
  // finishes the job, and meets both unique indexes.
  Object.assign(db.payments.get(paymentId)!, { receipt_id: null, updated_at: new Date(NOW - 10 * 60_000).toISOString() });
  assert.equal((await applyNotification(paidCb(), tokn, depsFor(db.repo))).status, 'paid');
  assert.equal(db.receipts.length, 1);
  assert.equal(db.redemptions.length, 1);
  assert.equal(itemsOf(db.receipts[0]).filter((i) => i.loyalty_reward === true).length, 1);
  assert.equal(card(db).ready, false);
});

await ok('the till (onPaid) plus the webhook together are ONE redemption', async () => {
  const db = memoryDb();
  const { paymentId } = await chargeWithReward(db.repo);
  await applyNotification(paidCb(), db.payments.get(paymentId)!.notify_token, depsFor(db.repo));
  // onPaid fires only once receipt_id is on the payment, which the server sets AFTER its ledger row: the browser's insert of the
  // same receipt meets loyalty_redemptions_one_per_receipt (23505), which recordLoyaltyRedemption treats as success.
  const rid = String(db.payments.get(paymentId)!.receipt_id);
  assert.equal(await db.repo.insertLoyaltyRedemption!({ tenant_id: TENANT, client_id: CLIENT, receipt_id: rid, reward: cfg.reward, every: 5, stamps_used: 5 }), 'already');
  assert.equal(db.redemptions.length, 1);
  // Even with a second row for the same receipt (as a database without the index would hold), the card counts one reward.
  const s = loyaltyState({ config: cfg, clientId: CLIENT, receipts: [...earned(), ...db.receipts], redemptions: [...db.redemptions, { ...db.redemptions[0] }], serviceNames: SERVICES, now: NOW });
  assert.equal(s.history.filter((h: { kind: string }) => h.kind === 'redeem').length, 1);
  assert.equal(s.ready, false);
  // The service writes the ledger row before receipt_id (so the browser always loses the race) and the till keeps 23505 as success.
  const svc = readFileSync('lib/grow/service.ts', 'utf8');
  assert.ok(svc.indexOf('await recordRedemption(') < svc.indexOf("await d.repo.updatePayment(p.id, { receipt_id: r.id })"), 'ledger before receipt_id');
  const jsx = readFileSync('app/beautyos.jsx', 'utf8');
  assert.match(jsx, /error\.code === "23505"\) \{[^}]*return true; \}/, 'the till treats a duplicate as success');
  const panel = jsx.slice(jsx.indexOf('<GrowChargePanel '), jsx.indexOf('onPaid=', jsx.indexOf('<GrowChargePanel ')));
  assert.ok(panel.includes('loyalty={loyaltyRewardLive?{reward:loyaltyCfg.reward,stampsUsed:'), 'the till sends the reward with the charge');
  assert.match(readFileSync('app/GrowChargePanel.jsx', 'utf8'), /loyalty: loyalty \|\| null/);
});

await ok('a payment with no reward, or whose stored intent names another client, gets no mark and no row', async () => {
  const db = memoryDb();
  const res = await createCharge({ tenantId: TENANT, userId: 'her', amount: 150, description: 'טיפול פנים', clientName: 'דנה', phone: '0501234567', clientId: CLIENT }, depsFor(db.repo));
  assert.equal(res.ok, true);
  assert.equal('loyalty_redemption' in db.payments.get((res as { paymentId: string }).paymentId)!, false);
  await applyNotification(paidCb(), db.payments.get((res as { paymentId: string }).paymentId)!.notify_token, depsFor(db.repo));
  assert.equal(db.receipts[0].items, '[]');
  assert.equal(db.redemptions.length, 0);

  const db2 = memoryDb();
  const { paymentId } = await chargeWithReward(db2.repo);
  db2.payments.get(paymentId)!.loyalty_redemption = { client_id: 'someone-else', reward: 'x', stamps_used: 5 };
  await applyNotification(paidCb(), db2.payments.get(paymentId)!.notify_token, depsFor(db2.repo));
  assert.equal(db2.receipts[0].items, '[]');
  assert.equal(db2.redemptions.length, 0);
  // createCharge itself never stores an intent for a client other than the payment's.
  const db3 = memoryDb();
  await createCharge({ tenantId: TENANT, userId: 'her', amount: 150, description: 'x', clientName: 'דנה', phone: '0501234567', clientId: CLIENT, loyalty: { client_id: 'c2', reward: 'x', stamps_used: 5 } }, depsFor(db3.repo));
  assert.equal('loyalty_redemption' in [...db3.payments.values()][0], false);
});

await ok('the intent is validated: stamps_used a whole number 1..100, the reward text trimmed', () => {
  assert.deepEqual(parseLoyaltyIntent({ reward: ' מתנה ', stampsUsed: 5 }), { reward: 'מתנה', stamps_used: 5 });
  assert.deepEqual(parseLoyaltyIntent({ reward: '', stamps_used: '10' }), { reward: 'הטיפול הבא במתנה', stamps_used: 10 });
  assert.equal(parseLoyaltyIntent({ reward: 'x'.repeat(200), stampsUsed: 100 })!.reward.length, 80);
  for (const bad of [0, 101, 2.5, -1, '5x', '', null, true, NaN, Infinity]) assert.equal(parseLoyaltyIntent({ reward: 'x', stampsUsed: bad }), null, String(bad));
  for (const bad of [null, undefined, 'x', 5, [1]]) assert.equal(parseLoyaltyIntent(bad), null, String(bad));
});

await ok('the charge route takes the client from the checked id and the tenant from the session, never from the body', () => {
  const s = readFileSync('app/api/grow/charge/route.ts', 'utf8');
  assert.ok(s.indexOf('parseLoyaltyIntent(b.loyalty)') > s.indexOf("'הלקוחה או התור לא נמצאו'"), 'validated after her client was checked');
  assert.match(s, /loyalty = \{ client_id: clientId, \.\.\.intent \}/);
  assert.match(s, /if \(!intent \|\| !clientId\) return NextResponse\.json\(\{ success: false/);
  assert.ok(!/b\.tenant/.test(s), 'no tenant from the body');
  assert.match(s, /tenantId: c\.tenantId/);
});

// ── before add_loyalty_2026-11-05.sql has run ────────────────────────────────
/** A Supabase client stand-in for supabaseGrowRepo: grow_payments has no loyalty_redemption column, loyalty_redemptions no table. */
function fakeSupabase() {
  const inserts: Record<string, unknown>[] = [];
  const missingCol = { code: 'PGRST204', message: "Could not find the 'loyalty_redemption' column of 'grow_payments' in the schema cache" };
  const from = (table: string) => {
    let op = ''; let row: Record<string, unknown> = {}; let cols = '';
    const result = () => {
      if (table === 'grow_payments' && op === 'insert') {
        if ('loyalty_redemption' in row) return { data: null, error: missingCol };
        inserts.push(row); return { data: { id: 'p1', ...row }, error: null };
      }
      if (table === 'grow_payments' && op === 'select' && /loyalty_redemption/.test(cols)) return { data: null, error: { code: '42703', message: 'column grow_payments.loyalty_redemption does not exist' } };
      if (table === 'loyalty_redemptions') return { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.loyalty_redemptions' in the schema cache" } };
      return { data: null, error: null };
    };
    const b: Record<string, unknown> = {
      insert(r: Record<string, unknown>) { op = 'insert'; row = r; return b; },
      select(c: string) { if (!op) op = 'select'; cols = c; return b; },
      eq() { return b; }, single: async () => result(), maybeSingle: async () => result(),
      then(res: (v: unknown) => void, rej: (e: unknown) => void) { return Promise.resolve(result()).then(res, rej); },
    };
    return b;
  };
  return { db: { from } as never, inserts };
}

await ok('before the migration: charge creation with a reward still works (the column is dropped), and the paid path does not fail', async () => {
  const f = fakeSupabase();
  const repo = supabaseGrowRepo(f.db);
  const p = await repo.insertPayment({ tenant_id: TENANT, status: 'created', amount: 150, client_id: CLIENT, notify_token: 'x'.repeat(48), loyalty_redemption: { client_id: CLIENT, reward: 'x', stamps_used: 5 } });
  assert.equal(p.id, 'p1');
  assert.equal(f.inserts.length, 1);
  assert.equal('loyalty_redemption' in f.inserts[0], false, 'stored without the column');
  assert.equal(await repo.loyaltyIntentOf!('p1'), null, 'no column: no intent, no error');
  assert.equal(await repo.insertLoyaltyRedemption!({ tenant_id: TENANT, client_id: CLIENT, receipt_id: 'r1', reward: 'x', every: 5, stamps_used: 5 }), 'missing');

  // The whole flow on a database without the column: the charge is created, the paid callback writes the receipt as before.
  const db = memoryDb({ columnMissing: true });
  const { paymentId } = await chargeWithReward(db.repo);
  const r = await applyNotification(paidCb(), db.payments.get(paymentId)!.notify_token, depsFor(db.repo));
  assert.equal(r.status, 'paid');
  assert.equal(db.receipts.length, 1);
  assert.equal(db.receipts[0].items, '[]', 'no intent known: today\'s receipt, no mark');
  assert.equal(db.redemptions.length, 0);
});

await ok('a repo that cannot read the intent still writes the receipt (the payment is never lost for the reward)', async () => {
  const db = memoryDb();
  const { paymentId } = await chargeWithReward(db.repo);
  db.repo.loyaltyIntentOf = async () => { throw new Error('boom'); };
  const err = console.error; console.error = () => {};
  try { assert.equal((await applyNotification(paidCb(), db.payments.get(paymentId)!.notify_token, depsFor(db.repo))).status, 'paid'); } finally { console.error = err; }
  assert.equal(db.receipts.length, 1);
});

await ok('the migration adds the column inside the transaction, nullable jsonb, with a verify query; the repo SELECT does not name it', () => {
  const sql = readFileSync('supabase/migrations/add_loyalty_2026-11-05.sql', 'utf8');
  const body = sql.slice(sql.indexOf('begin;'), sql.indexOf('commit;'));
  assert.match(body, /alter table public\.grow_payments add column if not exists loyalty_redemption jsonb;/);
  assert.match(sql, /column_name = 'loyalty_redemption'/);
  const repo = readFileSync('lib/grow/repo.ts', 'utf8');
  assert.ok(!/const SELECT = '[^']*loyalty_redemption/.test(repo), 'a missing column in SELECT would fail every callback');
});

console.log(`\n${n} loyalty-grow tests passed`);
