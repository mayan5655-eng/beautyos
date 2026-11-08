// Gift vouchers (lib/giftVouchers.ts, lib/giftVoucherService.ts, the routes and the migration). Fake repos and a fake Supabase client:
// nothing here reaches Grow, WhatsApp or a database. The balance arithmetic itself lives in Postgres (gift_voucher_redeem); the
// migration's text is checked here, and its behaviour (double redeem, races, expiry, reversal) was run against a throwaway local
// Postgres 16 while building it (see the PR notes). Covers: issuance idempotency, double redeem, expiry, partial balance, no loyalty
// stamp on a voucher sale, income not double counted, and the honest degrade before the migration runs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import {
  giftVouchersVisible, voucherConfig, voucherStored, voucherOptions, resolveOption, newVoucherCode, normalizeCode, formatCode,
  newVoucherToken, isVoucherToken, voucherStatus, redeemProblem, usableAmount, expiryFrom, voucherItem, isVoucherSaleReceipt,
  publicVoucherView, voucherShareText, waShareLink, parseVoucherIntent, isMissingVoucherSchema, cleanMessage, CODE_ALPHABET,
  VOUCHER_ITEM_KIND, REFUSAL_HE, voucherRedeemNote, paidByVoucher, voucherOverUsed, VOUCHER_OVER_USED_HE,
} from './lib/giftVouchers.ts';
import { issueFromPayment, sellAtTill, readRpcOutcome, SALE_NOT_RECORDED_HE, SALE_IN_FLIGHT_HE, SALE_IN_FLIGHT_MS } from './lib/giftVoucherService.ts';
import type { VoucherRepo } from './lib/giftVoucherService.ts';
import { supabaseVoucherRepo } from './lib/giftVoucherRepo.ts';
import { loadVoucherShop } from './lib/giftVoucherShop.ts';
import { applyNotification } from './lib/grow/service.ts';
import type { GrowRepo, GrowPayment } from './lib/grow/service.ts';
import { monthlyReport } from './lib/monthlyReport.ts';
import { totalsOf } from './lib/till.ts';
import { tenantFlags } from './lib/featureFlags.ts';
import { isStampReceipt, loyaltyConfig, loyaltyState } from './lib/loyalty.js';
import { AUTOMATIONS_PROTECTED_KEYS } from './lib/settingsColumns.ts';

const rd = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n');
let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };
const rnd = (k: number) => new Uint8Array(randomBytes(k));
const T = '11111111-2222-4333-8444-555555555555';
const on = (gv: Record<string, unknown> = {}) => ({ automations: { feature_flags: { gift_vouchers: true }, gift_vouchers: { enabled: true, amounts: [200, 300, 500], ...gv } } });

// ── the flag and her setup ───────────────────────────────────────────────────
await ok('off by default: no flag, a false flag, a string flag', () => {
  assert.equal(giftVouchersVisible(null), false);
  assert.equal(giftVouchersVisible({ automations: {} }), false);
  assert.equal(giftVouchersVisible({ automations: { feature_flags: { gift_vouchers: false } } }), false);
  assert.equal(giftVouchersVisible({ automations: { feature_flags: { gift_vouchers: 'true' } } }), false);
  assert.equal(giftVouchersVisible(on()), true);
  assert.equal(voucherConfig({}).enabled, false, 'her selling switch is off until she turns it on');
});
await ok('the platform flag lives under feature_flags, which the settings save never takes from the browser', () => {
  assert.ok((AUTOMATIONS_PROTECTED_KEYS as readonly string[]).includes('feature_flags'));
  assert.equal(tenantFlags(on()).gift_vouchers, true);
});
await ok('config: defaults, clamps and junk', () => {
  const d = voucherConfig({ automations: { gift_vouchers: {} } });
  assert.deepEqual(d.amounts, [200, 300, 500]);
  assert.equal(d.validityMonths, 12);
  const c = voucherConfig({ automations: { gift_vouchers: { enabled: true, amounts: [300, '200', 5, 99999, 300, 'x'], validity_months: 999, note: '  שלום \n  לך  ', services: ['a', 'a', ''] } } });
  assert.deepEqual(c.amounts, [200, 300]);
  assert.equal(c.validityMonths, 12);
  assert.equal(c.note, 'שלום לך');
  assert.deepEqual(c.services, ['a']);
  assert.deepEqual(voucherStored(c), { enabled: true, amounts: [200, 300], services: ['a'], validity_months: 12, note: 'שלום לך' });
});
await ok('options are priced from her settings and price list, never from the browser', () => {
  const cfg = voucherConfig(on({ services: ['s1', 's2', 's3', 'gone'] }));
  const services = [{ id: 's1', name: 'טיפול פנים', price: 280 }, { id: 's2', name: 'כבוי', price: 300, active: false }, { id: 's3', name: 'חינם', price: 0 }];
  const opts = voucherOptions(cfg, services);
  assert.deepEqual(opts.map((o) => o.key), ['a:200', 'a:300', 'a:500', 's:s1']);
  assert.equal(resolveOption(cfg, services, 's:s1')?.amount, 280);
  assert.equal(resolveOption(cfg, services, 'a:1'), null, 'an amount she does not offer');
  assert.equal(resolveOption(cfg, services, 's:s2'), null, 'an inactive treatment');
  assert.equal(resolveOption(cfg, services, { amount: 1 }), null);
});

// ── codes and tokens ─────────────────────────────────────────────────────────
await ok('codes: 8 characters from an alphabet with no look-alikes, typed any way', () => {
  for (const ch of 'ILOU') assert.ok(!CODE_ALPHABET.includes(ch));
  const seen = new Set<string>();
  for (let i = 0; i < 2000; i++) { const c = newVoucherCode(rnd); assert.match(c, /^[0-9A-HJKMNP-TV-Z]{8}$/); seen.add(c); }
  assert.ok(seen.size > 1990, 'random, not sequential');
  assert.equal(normalizeCode('k7m4-x9q2'), 'K7M4X9Q2');
  assert.equal(normalizeCode(' K7M4 X9Q2 '), 'K7M4X9Q2');
  assert.equal(normalizeCode('K7M4-X9QO'), 'K7M4X9Q0', 'O read as zero');
  assert.equal(normalizeCode('K7M4-X9QI'), 'K7M4X9Q1', 'I read as one');
  assert.equal(normalizeCode('K7M4X9Q'), null);
  assert.equal(normalizeCode('https://kalmea.app/v/abc'), null);
  assert.equal(normalizeCode("K7M4' OR 1=1"), null);
  assert.equal(formatCode('K7M4X9Q2'), 'K7M4-X9Q2');
});
await ok('tokens: 192 random bits, hex', () => {
  const a = newVoucherToken(rnd), b = newVoucherToken(rnd);
  assert.ok(isVoucherToken(a) && isVoucherToken(b) && a !== b);
  assert.equal(a.length, 48);
  assert.equal(isVoucherToken('abc'), false);
  assert.equal(isVoucherToken(a.toUpperCase()), false);
});

// ── status, expiry, partial balance ─────────────────────────────────────────
const now = new Date('2026-11-08T10:00:00Z');
const V = (o: Record<string, unknown> = {}) => ({ id: 'v1', tenant_id: T, code: 'K7M4X9Q2', token: 'a'.repeat(48), kind: 'amount', initial_amount: 300, balance: 300, status: 'active', expires_at: '2027-11-08T21:59:59Z', ...o });
await ok('status: active, used, expired, void (void wins, then used, then expired)', () => {
  assert.equal(voucherStatus(V(), now), 'active');
  assert.equal(voucherStatus(V({ balance: 0 }), now), 'used');
  assert.equal(voucherStatus(V({ expires_at: '2026-11-08T09:59:59Z' }), now), 'expired');
  assert.equal(voucherStatus(V({ status: 'void', balance: 0 }), now), 'void');
});
await ok('expired and used-up vouchers are refused with a clear Hebrew sentence', () => {
  assert.equal(redeemProblem(V({ expires_at: '2026-01-01T00:00:00Z' }), 50, now), 'expired');
  assert.equal(redeemProblem(V({ balance: 0 }), 50, now), 'used');
  assert.equal(redeemProblem(V({ status: 'void' }), 50, now), 'void');
  assert.equal(redeemProblem(null, 50, now), 'not_found');
  assert.equal(redeemProblem(V({ balance: 40 }), 50, now), 'insufficient');
  assert.equal(redeemProblem(V(), 0, now), 'bad_amount');
  assert.equal(redeemProblem(V(), 300, now), null);
  for (const k of ['expired', 'used', 'void', 'not_found', 'insufficient']) { assert.ok(/[֐-׿]/.test(REFUSAL_HE[k])); assert.ok(!/[–—]/.test(REFUSAL_HE[k]), 'no long dashes in copy'); }
});
await ok('partial redemption: never more than the balance, never more than what is due, agorot kept', () => {
  assert.equal(usableAmount(300, 180), 180);
  assert.equal(usableAmount(120, 180), 120);
  assert.equal(usableAmount(12.5, 100), 12.5);
  assert.equal(usableAmount(300, 0), 0);
  assert.equal(usableAmount(-5, 100), 0);
});
await ok('expiry: months later, the end of the day, clamped to a short month', () => {
  assert.equal(expiryFrom(new Date('2026-11-08T10:00:00Z'), 12), '2027-11-08T21:59:59Z');
  assert.equal(expiryFrom(new Date('2027-01-31T10:00:00Z'), 1), '2027-02-28T21:59:59Z');
  assert.equal(expiryFrom(new Date('2026-08-31T10:00:00Z'), 6), '2027-02-28T21:59:59Z');
  assert.equal(expiryFrom(new Date('2027-12-15T10:00:00Z'), 3), '2028-03-15T21:59:59Z');
});

// ── issuance: only from a paid payment, once ─────────────────────────────────
function memRepo() {
  const vouchers: Record<string, any>[] = [];
  const ledger: Record<string, any>[] = [];
  const receipts: Record<string, any>[] = [{ id: 'r-grow', grow_payment_id: 'pay-1', items: '[]', service: 'שובר מתנה · ₪300' }];
  let collideNext = 0;
  let failReceipt = false;
  const repo: VoucherRepo = {
    async insertVoucher(row) {
      await new Promise((r) => setTimeout(r, 1)); // let concurrent callers interleave
      if (collideNext > 0) { collideNext--; return { status: 'duplicate-code' }; }
      if (row.grow_payment_id && vouchers.some((v) => v.grow_payment_id === row.grow_payment_id)) return { status: 'already' };
      if (row.sale_key && vouchers.some((v) => v.tenant_id === row.tenant_id && v.sale_key === row.sale_key)) return { status: 'already' };
      if (vouchers.some((v) => v.tenant_id === row.tenant_id && v.code === row.code)) return { status: 'duplicate-code' };
      const v = { id: `v${vouchers.length + 1}`, created_at: new Date().toISOString(), ...row };
      vouchers.push(v);
      return { status: 'inserted', row: v };
    },
    async findByPayment(id) { return vouchers.find((v) => v.grow_payment_id === id) || null; },
    async findBySaleKey(t, k) { return vouchers.find((v) => v.tenant_id === t && v.sale_key === k) || null; },
    async insertLedger(row) { if (!ledger.some((l) => l.voucher_id === row.voucher_id && l.idem_key === row.idem_key)) ledger.push(row); },
    async receiptIdForPayment(id) { return receipts.find((r) => r.grow_payment_id === id)?.id || null; },
    async setReceiptItems(id, items, service) { const r = receipts.find((x) => x.id === id); if (r) { r.items = JSON.stringify(items); r.service = service; } },
    async insertReceipt(row) { if (failReceipt) throw new Error('db down'); const r = { id: `r${receipts.length + 1}`, ...row }; receipts.push(r); return { id: r.id, row: r }; },
    async setVoucherReceipt(id, rid) { const v = vouchers.find((x) => x.id === id); if (v && !v.receipt_id) v.receipt_id = rid; },
    async findSaleReceipt(t, code) { const r = receipts.find((x) => String(x.note || '').includes(`קוד ${code}`)); return r ? { id: r.id } : null; },
    async voidVoucher(id, reason) { const v = vouchers.find((x) => x.id === id); if (v && v.status === 'active') { v.status = 'void'; v.void_reason = reason; } },
  };
  return { repo, vouchers, ledger, receipts, collide: (k: number) => { collideNext = k; }, breakReceipts: () => { failReceipt = true; }, fixReceipts: () => { failReceipt = false; } };
}
const intent = (o: Record<string, unknown> = {}) => ({ token: 'b'.repeat(48), kind: 'amount', service_name: null, amount: 300, buyer_name: 'מיכל לוי', recipient_name: 'דנה', message: 'מזל טוב', validity_months: 12, ...o });
const paid = { id: 'pay-1', tenant_id: T, status: 'paid', amount: 300, payer_phone: '972521111111' };

await ok('issuance is idempotent: called twice, and twice at the same moment, there is one voucher', async () => {
  const m = memRepo();
  const a = await issueFromPayment(paid, intent(), { repo: m.repo, randomBytes: rnd, now: () => now });
  const b = await issueFromPayment(paid, intent(), { repo: m.repo, randomBytes: rnd, now: () => now });
  assert.equal(a.status, 'issued'); assert.equal(b.status, 'already');
  const m2 = memRepo();
  const both = await Promise.all([1, 2, 3].map(() => issueFromPayment(paid, intent(), { repo: m2.repo, randomBytes: rnd, now: () => now })));
  assert.equal(m2.vouchers.length, 1);
  assert.deepEqual(both.map((x) => x.status).sort(), ['already', 'already', 'issued']);
  assert.equal(m.vouchers.length, 1);
  const v = m.vouchers[0];
  assert.equal(v.balance, 300); assert.equal(v.initial_amount, 300); assert.equal(v.sold_via, 'online'); assert.equal(v.grow_payment_id, 'pay-1');
  assert.equal(v.token, 'b'.repeat(48), 'the token the buyer was sent back to');
  assert.equal(v.expires_at, '2027-11-08T21:59:59Z');
  assert.equal(m.ledger.filter((l) => l.kind === 'issue').length, 1);
});
await ok('issuance refuses a payment that is not paid, has no intent, or whose intent disagrees with what was paid', async () => {
  const m = memRepo();
  for (const status of ['created', 'failed', 'cancelled']) assert.equal((await issueFromPayment({ ...paid, status }, intent(), { repo: m.repo, randomBytes: rnd })).status, 'not-paid');
  assert.equal((await issueFromPayment(paid, null, { repo: m.repo, randomBytes: rnd })).status, 'no-intent');
  assert.equal((await issueFromPayment(paid, { ...intent(), token: 'short' }, { repo: m.repo, randomBytes: rnd })).status, 'no-intent');
  assert.equal((await issueFromPayment(paid, intent({ amount: 500 }), { repo: m.repo, randomBytes: rnd })).status, 'amount-mismatch');
  assert.equal(m.vouchers.length, 0);
});
await ok('a code collision is retried with a fresh code, never reported as issued twice', async () => {
  const m = memRepo(); m.collide(2);
  const r = await issueFromPayment(paid, intent(), { repo: m.repo, randomBytes: rnd });
  assert.equal(r.status, 'issued'); assert.equal(m.vouchers.length, 1);
});
await ok('the Grow receipt of an online voucher is marked as a voucher sale (not a visit)', async () => {
  const m = memRepo();
  await issueFromPayment(paid, intent(), { repo: m.repo, randomBytes: rnd });
  const r = m.receipts.find((x) => x.id === 'r-grow')!;
  const items = JSON.parse(r.items);
  assert.equal(items.length, 1); assert.equal(items[0].kind, VOUCHER_ITEM_KIND); assert.equal(items[0].price, 300);
  assert.ok(isVoucherSaleReceipt(r));
  assert.equal(m.vouchers[0].receipt_id, 'r-grow');
});

// The whole Grow path: the verified callback flips the payment, writes the receipt, and afterPaid issues the voucher. A repeated
// callback (Grow sends to two URLs) never reaches afterPaid again, and calling the issuer again is a no-op anyway.
await ok('two Grow callbacks for one purchase: one receipt, one voucher', async () => {
  const m = memRepo(); m.receipts.length = 0;
  const p: GrowPayment = { id: 'pay-1', tenant_id: T, status: 'created', amount: 300, process_id: 'P1', receipt_id: null, client_id: null, client_name: 'מיכל לוי', appointment_id: null, description: 'שובר מתנה · ₪300', notify_token: 'tok-aaaaaaaaaaaaaaaaaaaa', updated_at: now.toISOString() };
  const grow: GrowRepo = {
    async insertPayment() { throw new Error('unused'); },
    async updatePayment(id, patch) { Object.assign(p, patch); },
    async markPaid(id, patch) { if (p.status !== 'created') return null; Object.assign(p, patch); return { ...p }; },
    async findByToken(t) { return t === p.notify_token ? { ...p } : null; },
    async insertReceipt(row) { const r = { id: `r${m.receipts.length + 1}`, ...row }; m.receipts.push(r); return { id: r.id }; },
    async setReceiptDocument() {},
  };
  const afterPaid = async (fp: GrowPayment) => { await issueFromPayment({ ...fp, payer_phone: '972521111111' }, intent(), { repo: m.repo, randomBytes: rnd }); };
  const deps = { repo: grow, creds: { apiKey: 'k', pageCode: 'c', apiBase: 'https://x.test' }, appUrl: 'https://k.test', newToken: () => 'n', now: () => now, afterPaid };
  const raw = { 'data[processId]': 'P1', 'data[transactionId]': 'TX1', 'data[sum]': '300', 'data[statusCode]': '2', 'data[asmachta]': 'A1', 'data[customFields][cField1]': 'pay1' };
  const r1 = await applyNotification(raw, p.notify_token, deps);
  const r2 = await applyNotification(raw, p.notify_token, deps);
  assert.equal(r1.status, 'paid'); assert.equal(r2.status, 'already');
  assert.equal(m.receipts.length, 1); assert.equal(m.vouchers.length, 1);
  // a forged callback with another amount does not issue anything
  const m3 = memRepo();
  const p3 = { ...p, status: 'created' as const };
  const grow3: GrowRepo = { ...grow, async markPaid() { return null; }, async findByToken() { return { ...p3 }; } };
  const r3 = await applyNotification({ ...raw, 'data[sum]': '1' }, p.notify_token, { ...deps, repo: grow3, afterPaid: async () => { await issueFromPayment({ ...p3, status: 'paid' }, intent(), { repo: m3.repo, randomBytes: rnd }); } });
  assert.equal(r3.status, 'mismatch'); assert.equal(m3.vouchers.length, 0);
});
await ok('the paid hook only looks for a voucher on payments the purchase route opened, and never undoes a deposit path', () => {
  const src = rd('app/api/grow/_cancel.ts');
  assert.match(src, /startsWith\(VOUCHER_SERVICE_PREFIX\)\) try \{\s*const v = await ensureVoucherForPayment/);
  const buy = rd('app/api/vouchers/buy/route.ts');
  assert.match(buy, /description: `\$\{VOUCHER_SERVICE_PREFIX\} · \$\{title\}`/);
  // the intent is written before the buyer has the link, only onto a still-open payment of this tenant
  assert.match(buy, /update\(\{ gift_voucher: intent \}\)\.eq\('id', result\.paymentId\)\.eq\('tenant_id', t\)\.eq\('status', 'created'\)/);
  // the price is the server's
  assert.match(buy, /shop\.options\.find\(\(o\) => o\.key === String\(b\.option/);
  assert.doesNotMatch(buy, /amount: Number\(b\.amount/);
  // the issuer reads the status from the database, not from the caller
  assert.match(rd('lib/giftVoucherIssue.ts'), /select\('id, tenant_id, status, amount, payer_phone, gift_voucher'\)/);
});

// ── the till sale ───────────────────────────────────────────────────────────
const sale = (o: Record<string, unknown> = {}) => ({ tenantId: T, userId: 'u1', saleKey: 'sale-key-0001', kind: 'amount' as const, serviceName: null, amount: 300, validityMonths: 12, paymentMethod: 'מזומן', buyerName: 'רונית', buyerPhone: null, recipientName: 'שירן', message: '', clientId: null, ...o });
await ok('a till sale writes a voucher and its receipt, once per sale key', async () => {
  const m = memRepo(); m.receipts.length = 0;
  const a = await sellAtTill(sale(), { repo: m.repo, randomBytes: rnd, now: () => now });
  const b = await sellAtTill(sale(), { repo: m.repo, randomBytes: rnd, now: () => now });
  assert.equal(a.status, 'sold'); assert.equal(b.status, 'already');
  assert.equal(m.vouchers.length, 1); assert.equal(m.receipts.length, 1);
  const r = m.receipts[0];
  assert.equal(r.amount, 300); assert.equal(r.appointment_id, null); assert.equal(r.payment_method, 'מזומן');
  assert.ok(isVoucherSaleReceipt(r));
  assert.equal(JSON.parse(r.items)[0].kind, 'voucher');
  assert.equal(m.vouchers[0].receipt_id, r.id);
  assert.ok(isVoucherToken(m.vouchers[0].token));
});
await ok('a till sale whose receipt cannot be written leaves no live voucher behind (voided with the reason, not deleted)', async () => {
  const m = memRepo(); m.breakReceipts();
  const r = await sellAtTill(sale({ saleKey: 'sale-key-0002' }), { repo: m.repo, randomBytes: rnd });
  assert.equal(r.status, 'failed');
  assert.equal(m.vouchers.length, 1); assert.equal(m.vouchers[0].status, 'void'); assert.ok(m.vouchers[0].void_reason);
});

// Vercel review on PR #25, finding 1: a retry with the same sale key must never hand over a voucher whose money was not recorded.
await ok('review #1: retrying a till sale after its receipt failed answers a failure, never the voided voucher', async () => {
  const m = memRepo(); m.breakReceipts();
  const first = await sellAtTill(sale({ saleKey: 'sale-key-0003' }), { repo: m.repo, randomBytes: rnd, now: () => now });
  assert.equal(first.status, 'failed');
  m.fixReceipts();
  const retry = await sellAtTill(sale({ saleKey: 'sale-key-0003' }), { repo: m.repo, randomBytes: rnd, now: () => now });
  assert.equal(retry.status, 'failed');
  assert.equal((retry as { message?: string }).message, SALE_NOT_RECORDED_HE);
  assert.ok(!('voucher' in retry));
  assert.equal(m.vouchers.length, 1); assert.equal(m.vouchers[0].status, 'void');
  assert.equal(m.receipts.filter((r) => r.amount === 300).length, 0, 'no money recorded, no voucher live');
  // a NEW sale key sells properly
  const fresh = await sellAtTill(sale({ saleKey: 'sale-key-0004' }), { repo: m.repo, randomBytes: rnd, now: () => now });
  assert.equal(fresh.status, 'sold');
});
await ok('review #1: a retry while the first sale is half written: linked if its receipt exists, "wait" if fresh, voided if it died', async () => {
  // receipt written, link lost
  const m = memRepo(); m.receipts.length = 0;
  const done = await sellAtTill(sale({ saleKey: 'sale-key-0005' }), { repo: m.repo, randomBytes: rnd, now: () => now });
  assert.equal(done.status, 'sold');
  m.vouchers[0].receipt_id = null;
  const again = await sellAtTill(sale({ saleKey: 'sale-key-0005' }), { repo: m.repo, randomBytes: rnd, now: () => now });
  assert.equal(again.status, 'already'); assert.equal(m.vouchers[0].receipt_id, m.receipts[0].id); assert.equal(m.receipts.length, 1, 'no second receipt');
  // no receipt yet, created a moment ago: the first request may still be writing it
  const m2 = memRepo();
  m2.vouchers.push({ id: 'vx', tenant_id: T, code: 'ABCD2345', status: 'active', sale_key: 'sale-key-0006', receipt_id: null, created_at: new Date(now.getTime() - 10_000).toISOString() });
  const wait = await sellAtTill(sale({ saleKey: 'sale-key-0006' }), { repo: m2.repo, randomBytes: rnd, now: () => now });
  assert.equal(wait.status, 'failed'); assert.equal((wait as { message?: string }).message, SALE_IN_FLIGHT_HE); assert.equal(m2.vouchers[0].status, 'active');
  // no receipt, long ago: the first request died; voided now, and said
  const later = await sellAtTill(sale({ saleKey: 'sale-key-0006' }), { repo: m2.repo, randomBytes: rnd, now: () => new Date(now.getTime() + SALE_IN_FLIGHT_MS) });
  assert.equal(later.status, 'failed'); assert.equal(m2.vouchers[0].status, 'void');
  // a complete sale retried: the same voucher, no new receipt
  const m3 = memRepo(); m3.receipts.length = 0;
  await sellAtTill(sale({ saleKey: 'sale-key-0007' }), { repo: m3.repo, randomBytes: rnd, now: () => now });
  const r3 = await sellAtTill(sale({ saleKey: 'sale-key-0007' }), { repo: m3.repo, randomBytes: rnd, now: () => now });
  assert.equal(r3.status, 'already'); assert.equal(m3.receipts.length, 1);
  // the route turns a failed retry into a 409 with the sentence, and the panel takes a fresh key
  assert.match(rd('app/api/vouchers/route.ts'), /if \(r\.status === 'failed' && r\.message\) return json\(\{ success: false, retryWithNewSale: true, error: r\.message \}, 409\);/);
  assert.match(rd('app/GiftVouchersPanel.jsx'), /if \(j\?\.retryWithNewSale \|\| r\.status >= 500\) setSaleKey\(newKey\(\)\)/);
});

// Vercel review on PR #25, finding 2: the voucher balance taken must equal what the receipt credits.
await ok('review #2: a till whose total dropped below the redeemed amount cannot be saved', () => {
  assert.equal(voucherOverUsed({ amount: 180 }, 100), true);
  assert.equal(voucherOverUsed({ amount: 180 }, 180), false);
  assert.equal(voucherOverUsed({ amount: 180 }, 280), false);
  assert.equal(voucherOverUsed({ amount: 180 }, 179.999), false, 'agorot rounding is not a block');
  assert.equal(voucherOverUsed(null, 0), false);
  assert.ok(/[\u0590-\u05FF]/.test(VOUCHER_OVER_USED_HE) && !/[\u2013\u2014]/.test(VOUCHER_OVER_USED_HE));
  const j = rd('app/beautyos.jsx');
  const fn = j.slice(j.indexOf('const handleSaveReceipt = async () => {'));
  const block = fn.indexOf('if (voucherOverUsed(voucherAdj, voucherDue)) { toast(VOUCHER_OVER_USED_HE, "error"); return; }');
  assert.ok(block > 0, 'the block is in handleSaveReceipt');
  assert.ok(block < fn.indexOf('supabase.from("receipts").insert'), 'before any receipt is written');
  // when not blocked, the receipt credits exactly what was taken: voucherUsed = min(redeemed, due) = redeemed
  assert.match(j, /const voucherUsed = voucherAdj \? Math\.min\(Number\(voucherAdj\.amount\) \|\| 0, voucherDue\) : 0;/);
  // the Grow card panel needs a total above zero, and an over-used voucher leaves the total at zero
  assert.match(j, /&&cashierTotal>0&&\(<GrowChargePanel/);
  assert.match(rd('app/VoucherRedeemTill.jsx'), /const over = voucherOverUsed\(applied, due\);/);
});

// Vercel review on PR #25, findings 3 and 4: how the owner route reads the flag, and the plan gate before any read.
await ok('review #3: the flag is read from the whole settings row, so a database without settings.feature_flags still works', () => {
  const route = rd('app/api/vouchers/route.ts');
  assert.match(route, /db\.from\('settings'\)\.select\('\*'\)\.eq\('tenant_id', tenantId\)/);
  assert.doesNotMatch(route, /select\('automations, feature_flags'\)/);
  // a row with no feature_flags column at all, flag in automations: on
  assert.equal(giftVouchersVisible({ automations: { feature_flags: { gift_vouchers: true } } }), true);
  // a dedicated column, when present, wins key by key (lib/featureFlags.ts tenantFlags)
  assert.equal(giftVouchersVisible({ automations: { feature_flags: { gift_vouchers: true } }, feature_flags: { gift_vouchers: false } }), false);
});
await ok('review #4: the plan gate runs before ANY service-role read in the owner route, GET included, demo exempt', () => {
  const route = rd('app/api/vouchers/route.ts');
  const whoFn = route.slice(route.indexOf('async function who()'), route.indexOf('export async function GET'));
  const gate = whoFn.indexOf('const guard = await requireActiveTenant(session);');
  assert.ok(gate > 0);
  assert.ok(gate < whoFn.indexOf('const db = admin();'), 'before the service-role client exists');
  assert.match(whoFn, /if \(!isDemoTenantId\(tenantId\)\) \{\s*const guard = await requireActiveTenant\(session\);\s*if \(!guard\.ok\) return \{ error: guard\.response \} as const;/);
  // GET and POST both go through who() before touching the database
  for (const h of ['export async function GET', 'export async function POST']) {
    const body = route.slice(route.indexOf(h), route.indexOf(h) + 400);
    assert.ok(body.indexOf('await who()') > 0 && (body.indexOf('db.') === -1 || body.indexOf('await who()') < body.indexOf('db.')));
  }
  // the buy and public routes are not owner reads: the shop refuses a closed business itself (lib/giftVoucherShop.ts tenantIsBlocked)
  assert.match(rd('lib/giftVoucherShop.ts'), /if \(await tenantIsBlocked\(db, tenantId\)/);
});

// ── no loyalty stamp, no treatment, no double income ────────────────────────
await ok('a voucher sale receipt is not a visit: the real loyalty rule gives it no stamp', () => {
  const r = { client_id: 'c1', amount: 300, service: 'שובר מתנה: ₪300', appointment_id: null, items: JSON.stringify([voucherItem({ title: '₪300', amount: 300, code: 'K7M4X9Q2' })]) };
  assert.ok(isVoucherSaleReceipt(r));
  assert.ok(!isVoucherSaleReceipt({ items: JSON.stringify([{ name: 'טיפול פנים', price: 280 }]) }));
  assert.ok(!isVoucherSaleReceipt({ items: JSON.stringify([voucherItem({ title: '₪300', amount: 300 }), { name: 'קרם', price: 80 }]) }), 'a mixed receipt is not only a voucher sale');
  assert.ok(isVoucherSaleReceipt({ items: '[]', service: 'שובר מתנה · ₪300' }), 'a Grow receipt before its items were marked');
  // The real loyalty rule (lib/loyalty.js, PR #20): a voucher sale earns no stamp, with or without her service list.
  assert.equal(isStampReceipt(r, { serviceNames: ['טיפול פנים'] }), false);
  assert.equal(isStampReceipt(r, {}), false);
  assert.equal(isStampReceipt({ ...r, items: '[]', client_id: null, service: 'שובר מתנה · ₪300' }, {}), false, 'an online sale: no client, not a visit');
  assert.equal(isStampReceipt({ ...r, items: '[]', service: 'שובר מתנה: ₪300' }, { serviceNames: ['טיפול פנים'] }), false);
});
await ok('loyalty: a visit paid with a voucher IS a visit and earns its stamp, even at ₪0; the stamp is counted once', () => {
  const visit = (amount: number, note: string) => ({ id: `v${amount}`, client_id: 'c1', amount, appointment_id: 'ap1', service: 'טיפול פנים', payment_method: 'מזומן', note, items: JSON.stringify([{ name: 'טיפול פנים', price: 280, qty: 1 }]), created_at: '2026-11-05T09:00:00Z' });
  assert.equal(voucherRedeemNote('K7M4X9Q2', 280), 'שובר מתנה K7M4-X9Q2: ₪280 נוכה');
  assert.equal(isStampReceipt(visit(0, voucherRedeemNote('K7M4X9Q2', 280)), { serviceNames: ['טיפול פנים'] }), true, 'fully paid by the voucher');
  assert.equal(isStampReceipt(visit(80, `הערה · ${voucherRedeemNote('K7M4X9Q2', 200)}`), { serviceNames: ['טיפול פנים'] }), true, 'partly');
  assert.equal(isStampReceipt(visit(0, 'שובר מתנה בלי קוד'), { serviceNames: ['טיפול פנים'] }), false, 'free text is not a payment');
  assert.ok(paidByVoucher({ note: voucherRedeemNote('K7M4X9Q2', 12.5) }));
  // a sale and the visit it pays for: one stamp (the visit), never two
  const cfg = loyaltyConfig({ automations: { loyalty: { enabled: true, every: 5, reward: 'מתנה' } } });
  const sale = { id: 's1', client_id: 'c1', amount: 300, appointment_id: null, service: 'שובר מתנה: ₪300', items: JSON.stringify([voucherItem({ title: '₪300', amount: 300 })]), created_at: '2026-11-01T09:00:00Z' };
  const st = loyaltyState({ config: cfg, clientId: 'c1', receipts: [sale, visit(0, voucherRedeemNote('K7M4X9Q2', 280))], serviceNames: ['טיפול פנים'] });
  assert.equal(st.stamps, 1);
});
await ok('income: the sale counts once, the redemption is not new income, and the report does not call it a treatment', () => {
  const at = (d: string) => `2026-11-0${d}T09:00:00Z`;
  const receipts = [
    { id: 'r1', created_at: at('2'), amount: 300, service: 'שובר מתנה: ₪300', items: JSON.stringify([voucherItem({ title: '₪300', amount: 300 })]) },
    // the friend's visit: a ₪280 facial, ₪200 of it from the voucher, ₪80 paid on the day
    { id: 'r2', created_at: at('5'), amount: 80, service: 'טיפול פנים', items: JSON.stringify([{ name: 'טיפול פנים', price: 280, qty: 1 }]), note: 'שובר מתנה K7M4-X9Q2: ₪200 נוכה' },
  ];
  const rep = monthlyReport({ receipts, status: 'exempt', vatRate: 18, now: new Date('2026-11-06T12:00:00Z') });
  assert.equal(rep.income, 380, '300 when sold + 80 on the day; the ₪200 from the voucher is not counted again');
  assert.equal(rep.count, 1, 'one treatment');
  assert.equal(rep.top?.name, 'טיפול פנים');
  assert.equal(totalsOf(receipts).total, 380);
  const onlySale = monthlyReport({ receipts: [receipts[0]], status: 'exempt', vatRate: 18, now: new Date('2026-11-06T12:00:00Z') });
  assert.equal(onlySale.count, 0);
  assert.ok(onlySale.sentences.some((s) => /רק מכירת שוברי מתנה/.test(s)));
});
await ok('the till takes the voucher off what she is paid, like credit (one place, after deposit and credit)', () => {
  const j = rd('app/beautyos.jsx');
  assert.match(j, /const voucherDue = Math\.max\(0, Math\.round\(\(growBase - growDepositUsed - growCreditUsed\) \* 100\) \/ 100\);/);
  assert.match(j, /const cashierTotal = Math\.max\(0, Math\.round\(\(cashierSubtotal - cashierDiscountIls - packageCredit - growDepositUsed - growCreditUsed - voucherUsed\) \* 100\) \/ 100\);/);
  assert.match(j, /growMark\("\/api\/vouchers", \{ action: "attach", ledgerId: voucherAdj\.ledgerId, receiptId \}/);
});

// ── double redemption: decided in the database, never in the browser ──────
await ok('redemption is one conditional UPDATE plus a unique ledger key, callable by the service role only', () => {
  const sql = rd('supabase/migrations/add_gift_vouchers_2026-11-08.sql');
  assert.match(sql, /where g\.id = p_voucher and g\.tenant_id = p_tenant and g\.status = 'active' and g\.expires_at > now\(\) and g\.balance >= round\(p_amount, 2\)/);
  assert.match(sql, /create unique index if not exists gift_voucher_ledger_idem_uniq on public\.gift_voucher_ledger \(voucher_id, idem_key\)/);
  assert.match(sql, /create unique index if not exists gift_voucher_ledger_reverse_uniq/);
  assert.match(sql, /exception when unique_violation then/);
  assert.match(sql, /revoke all on function public\.gift_voucher_redeem\(uuid, uuid, numeric, text, uuid\) from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.gift_voucher_redeem\(uuid, uuid, numeric, text, uuid\) to service_role;/);
  assert.match(sql, /constraint gift_vouchers_balance_le_initial check \(balance <= initial_amount\)/);
  assert.match(sql, /check \(balance >= 0\)/);
  assert.match(sql, /create unique index if not exists gift_vouchers_payment_uniq on public\.gift_vouchers \(grow_payment_id\)/);
  // no write grant to the browser roles, no anon anything
  assert.match(sql, /revoke all on public\.gift_vouchers from anon, authenticated;/);
  assert.doesNotMatch(sql, /grant (insert|update|delete)[^;]* on public\.gift_vouchers/i);
  assert.doesNotMatch(sql, /to anon/);
  // the trial gate and the same-business triggers
  assert.match(sql, /_require_active_insert/); assert.match(sql, /_require_active_select/);
  assert.match(sql, /create trigger gift_vouchers_same_tenant/); assert.match(sql, /create trigger gift_voucher_ledger_same_tenant/);
});
await ok('the routes never compute a balance: the only balance writes are the two database functions', () => {
  for (const f of ['app/api/vouchers/route.ts', 'app/api/vouchers/buy/route.ts', 'app/api/vouchers/public/route.ts', 'lib/giftVoucherRepo.ts', 'lib/giftVoucherService.ts', 'app/VoucherRedeemTill.jsx', 'app/GiftVouchersPanel.jsx']) {
    const src = rd(f);
    assert.doesNotMatch(src, /update\(\{[^}]*\bbalance\b/, `${f} writes a balance`);
  }
  const route = rd('app/api/vouchers/route.ts');
  assert.match(route, /db\.rpc\('gift_voucher_redeem', \{ p_tenant: tenantId,/);
  assert.match(route, /const tenantId = await callerTenantId\(session\);/);
  assert.doesNotMatch(route, /b\.tenantId|body\.tenantId/);
});
await ok('the database answer is read the same way for every outcome', () => {
  assert.deepEqual(readRpcOutcome([{ result: 'ok', ledger_id: 'l1', balance: '40.00' }]), { result: 'ok', ledgerId: 'l1', balance: 40 });
  assert.deepEqual(readRpcOutcome([{ result: 'already', ledger_id: 'l1', balance: 40 }]), { result: 'already', ledgerId: 'l1', balance: 40 });
  assert.deepEqual(readRpcOutcome(null), { result: 'failed', ledgerId: null, balance: null });
  assert.equal(readRpcOutcome({ result: 'expired', ledger_id: null, balance: 100 }).result, 'expired');
});
await ok('every write route is plan gated, refuses the demo businesses, and the code lookup is rate limited', () => {
  const route = rd('app/api/vouchers/route.ts');
  const writes = route.indexOf("// Everything below writes.");
  assert.ok(writes > 0 && route.indexOf("action === 'redeem'") > writes && route.indexOf("action === 'sell'") > writes && route.indexOf("action === 'void'") > writes);
  assert.match(route.slice(writes, writes + 300), /isDemoTenantId\(tenantId\)\) return json\(\{ success: false, demo: true/);
  assert.match(route, /checkIpLimit\(request, 'voucher-lookup'\)/);
  assert.match(route, /checkTenantLimit\(tenantId, 'voucher-lookup'\)/);
  assert.match(rd('app/api/vouchers/buy/route.ts'), /checkIpLimit\(request, 'voucher-buy'\)/);
  assert.match(rd('app/api/vouchers/public/route.ts'), /checkIpLimit\(request, 'voucher-view'\)/);
});

// ── the public page shows display fields only ──────────────────────────────
await ok('the public voucher view: no phone, no ids, no tenant, the buyer first name only', () => {
  const pv = publicVoucherView(V({ buyer_name: 'מיכל לוי', buyer_phone: '972521111111', recipient_name: 'דנה', message: 'מזל טוב\n\n\nאוהבת', grow_payment_id: 'pay-1', receipt_id: 'r1' }) as never, 'מחכה לך', now);
  assert.deepEqual(Object.keys(pv).sort(), ['balance', 'code', 'expiresAt', 'fromName', 'initial', 'kind', 'message', 'note', 'recipientName', 'serviceName', 'status', 'title'].sort());
  const s = JSON.stringify(pv);
  for (const leak of ['972521111111', 'pay-1', 'r1', T, 'לוי']) assert.ok(!s.includes(leak), `leaks ${leak}`);
  assert.equal(pv.fromName, 'מיכל'); assert.equal(pv.code, 'K7M4-X9Q2'); assert.equal(pv.message, 'מזל טוב\nאוהבת');
  const view = rd('lib/giftVoucherView.ts');
  assert.match(view, /publicVoucherView\(row, note, now\)/);
  assert.doesNotMatch(view, /voucher: row\b/);
});
await ok('the share link is wa.me with no number (she picks the friend) and nothing is sent automatically', () => {
  const t = voucherShareText({ businessName: 'סטודיו נועה', recipientName: 'דנה', url: 'https://k.test/v/x' });
  assert.match(t, /^דנה, יש לך מתנה/); assert.ok(t.includes('https://k.test/v/x'));
  assert.match(waShareLink(t), /^https:\/\/wa\.me\/\?text=/);
  for (const f of ['app/api/vouchers/route.ts', 'app/api/vouchers/buy/route.ts', 'lib/giftVoucherService.ts', 'lib/giftVoucherIssue.ts', 'app/api/grow/_cancel.ts']) {
    const src = rd(f);
    const voucherPart = f.endsWith('_cancel.ts') ? src.slice(src.indexOf('A gift voucher bought online'), src.indexOf('A deposit she asked for')) : src;
    assert.doesNotMatch(voucherPart, /sendWhatsApp|greenApi|sendMessage|waCloud/i, `${f} sends something`);
  }
});
await ok('the intent stored on a payment is re-validated before use', () => {
  assert.equal(parseVoucherIntent({ ...intent(), amount: 99999 }), null);
  assert.equal(parseVoucherIntent({ ...intent(), token: 'B'.repeat(48) }), null);
  const p = parseVoucherIntent({ ...intent(), buyer_name: '<b>x</b>'.repeat(20), message: 'a\u0000b' });
  assert.ok(p && p.buyer_name.length <= 60 && !p.message.includes('\u0000'));
  assert.equal(cleanMessage('1\n2\n3\n4\n5'), '1\n2\n3');
});

// ── before the migration runs ──────────────────────────────────────────────
function fakeDb(handler: (table: string, filters: string[]) => { data?: unknown; error?: unknown; count?: number }) {
  return {
    from(table: string) {
      const filters: string[] = [];
      const q: any = {
        select() { return q; }, eq(c: string, v: unknown) { filters.push(`${c}=${v}`); return q; }, or() { return q; }, limit() { return q; },
        is() { return q; }, not() { return q; }, gte() { return q; }, in() { return q; }, order() { return q; }, insert() { return q; }, update() { return q; },
        maybeSingle() { return Promise.resolve(handler(table, filters)); }, single() { return Promise.resolve(handler(table, filters)); },
        then(res: (v: unknown) => unknown, rej: (e: unknown) => unknown) { return Promise.resolve(handler(table, filters)).then(res, rej); },
      };
      return q;
    },
    rpc() { return Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.gift_voucher_redeem' } }); },
  };
}
const MISSING = { code: 'PGRST205', message: "Could not find the table 'public.gift_vouchers' in the schema cache" };
await ok('pre-migration: the missing table is recognised in every shape PostgREST and Postgres use', () => {
  for (const e of [MISSING, { code: '42P01', message: 'relation "public.gift_vouchers" does not exist' }, { code: '42703', message: 'column grow_payments.gift_voucher does not exist' }, { code: 'PGRST202', message: 'x' }]) assert.ok(isMissingVoucherSchema(e));
  assert.equal(isMissingVoucherSchema({ code: '23505', message: 'duplicate' }), false);
  assert.equal(isMissingVoucherSchema(null), false);
});
await ok('pre-migration: a till sale answers "missing" and writes no receipt', async () => {
  const db = fakeDb((table) => (table === 'gift_vouchers' ? { data: null, error: MISSING } : { data: null, error: null }));
  const repo = supabaseVoucherRepo(db as never);
  assert.equal((await repo.insertVoucher({})).status, 'missing');
  let receiptWritten = false;
  const r = await sellAtTill(sale(), { repo: { ...repo, async insertReceipt() { receiptWritten = true; return { id: 'x', row: {} }; } }, randomBytes: rnd });
  assert.equal(r.status, 'missing'); assert.equal(receiptWritten, false);
});
await ok('pre-migration: the public page does not offer online purchase, and says why', async () => {
  const db = fakeDb((table) => {
    if (table === 'settings') return { data: { tenant_id: T, ...on() }, error: null };
    if (table === 'service_prices') return { data: [], error: null };
    if (table === 'tenants') return { data: { slug: 'studio-noa' }, error: null };
    if (table === 'gift_vouchers') return { data: null, error: MISSING };
    return { data: null, error: null };
  });
  const s = await loadVoucherShop(db as never, T, { GROW_UI_ENABLED: 'true' }, 'http://localhost');
  assert.equal(s.visible, true); assert.equal(s.online, false); assert.equal(s.reason, 'no-migration');
});
await ok('no Grow for her business: visible, but not offered online', async () => {
  const db = fakeDb((table) => {
    if (table === 'settings') return { data: { tenant_id: T, ...on() }, error: null };
    if (table === 'service_prices') return { data: [], error: null };
    if (table === 'tenants') return { data: { slug: 'studio-noa' }, error: null };
    if (table === 'gift_vouchers') return { data: null, error: null, count: 0 };
    if (table === 'grow_accounts') return { data: null, error: null };
    return { data: null, error: null };
  });
  assert.equal((await loadVoucherShop(db as never, T, { GROW_UI_ENABLED: '' }, 'http://localhost')).reason, 'no-grow');
  assert.equal((await loadVoucherShop(db as never, T, { GROW_UI_ENABLED: 'true' }, 'http://localhost')).reason, 'no-grow', 'switched on for the platform, not connected for her');
  const off = fakeDb((table) => (table === 'settings' ? { data: { tenant_id: T, automations: {} }, error: null } : { data: null, error: null }));
  const s = await loadVoucherShop(off as never, T, { GROW_UI_ENABLED: 'true' }, 'http://localhost');
  assert.equal(s.visible, false); assert.equal(s.reason, 'off');
});
await ok('pre-migration: the screens say so in a sentence; the till widget and the list render nothing that would fail', () => {
  const panel = rd('app/GiftVouchersPanel.jsx');
  assert.match(panel, /data\?\.needsMigration && <p data-testid="voucher-needs-migration"/);
  assert.match(panel, /data\?\.ready && !selling && <button/);
  assert.match(rd('app/VoucherRedeemTill.jsx'), /if \(j\.needsMigration\) \{ setErr\(j\.error\); return; \}/);
  const route = rd('app/api/vouchers/route.ts');
  assert.ok((route.match(/isMissingVoucherSchema\(/g) || []).length >= 6, 'every action degrades');
  // everything is behind the flag in the dashboard
  const j = rd('app/beautyos.jsx');
  assert.match(j, /giftVouchersVisible\(settings\)&&\(<VoucherRedeemTill/);
  assert.match(j, /inG\("business"\)&&giftVouchersVisible\(settings\)&&\(<GiftVoucherSettings/);
  assert.match(panel, /if \(!visible\) return null;/);
});
await ok('the migration is in the referenced-tables list (the nightly check tells her when it has not run)', async () => {
  const { REFERENCED_TABLES } = await import('./lib/referencedTables.js' as string);
  assert.ok(REFERENCED_TABLES.includes('gift_vouchers') && REFERENCED_TABLES.includes('gift_voucher_ledger'));
});
await ok('product copy: Hebrew, no long dashes', () => {
  for (const f of ['app/GiftVouchersPanel.jsx', 'app/VoucherRedeemTill.jsx', 'app/GiftVoucherSettings.jsx', 'app/v/[token]/VoucherView.tsx', 'app/[slug]/gift/GiftPurchase.tsx', 'app/GiftVoucherLink.tsx', 'lib/giftVouchers.ts', 'app/api/vouchers/route.ts', 'app/api/vouchers/buy/route.ts']) {
    const src = rd(f);
    const strings = src.match(/(['"`])(?:(?!\1)[^\\\n]|\\.)*[֐-׿](?:(?!\1)[^\\\n]|\\.)*\1/g) || [];
    for (const s of strings) assert.ok(!/[–—]/.test(s), `${f}: long dash in ${s.slice(0, 60)}`);
  }
});

console.log(`\n${n} gift voucher checks passed`);
