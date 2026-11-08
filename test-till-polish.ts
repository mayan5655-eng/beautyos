// Till polish (2026-11-08):
//   12. billing fails CLOSED: an error while looking up an in-flight subscription charge never starts a new charge;
//    9. a gift voucher can be sold from "תשלום חדש", through the SAME sale form as the vouchers panel;
//   10. deposits have one place, Settings > תשלומים, and the other screens link there;
//   11. the till is in tabs (תשלומים / שוברי מתנה / מוצרים), a tab only for a feature that is on.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { saveCard, runDue, OpenAttemptLookupError } from './lib/billing/service.ts';
import type { BillingRepo, Subscription, PaymentRecord, TenantRow, Deps } from './lib/billing/service.ts';
import { supabaseBillingRepo } from './lib/billing/repo.ts';
import { newMockToken, createMockAdapters } from './lib/billing/adapter.ts';
import { tillTabsOf, activeTillTab } from './lib/tillTabs.ts';
import { screenFromSearch } from './lib/screenLink.ts';

let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const T = '33333333-3333-3333-3333-333333333333';

// ── 12. billing fail-closed ─────────────────────────────────────────────────
function world(opts: { lookupFails: 'period' | 'any' | 'none' }) {
  let now = new Date('2026-11-10T06:00:00Z');
  const tenants = new Map<string, TenantRow>();
  const subs = new Map<string, Subscription>();
  const payments: PaymentRecord[] = [];
  let seq = 0;
  const repo: BillingRepo = {
    async getSub(t) { return [...subs.values()].find((s) => s.tenant_id === t) || null; },
    async listSubs() { return [...subs.values()]; },
    async insertSub(row) { const s = { id: `s${++seq}`, ...row } as Subscription; subs.set(s.id, s); return s; },
    async updateSub(id, patch) { Object.assign(subs.get(id)!, patch); },
    async claimAttempt(id, previous, at) { const s = subs.get(id)!; if ((s.last_attempt_at ?? null) !== previous) return false; s.last_attempt_at = at; return true; },
    async hasSucceeded(subId, period) { return payments.some((p) => p.subscription_id === subId && p.period_start === period && p.status === 'succeeded'); },
    async insertPayment(row) { const p = { id: `p${++seq}`, created_at: now.toISOString(), ...row } as PaymentRecord; payments.push(p); return p; },
    async updatePayment(id, patch) { Object.assign(payments.find((p) => p.id === id)!, patch); },
    async findOpenAttempt(_subId, period) {
      if (opts.lookupFails === 'any' || (opts.lookupFails === 'period' && period !== null)) throw new Error('findOpenAttempt: connection reset');
      if (opts.lookupFails === 'period' && period === null) return null;
      return null;
    },
    async pendingInvoices() { return []; },
    async getTenant(id) { return tenants.get(id) || null; },
    async setPlanStatus(id, status) { tenants.get(id)!.plan_status = status; },
  };
  const adapters = createMockAdapters('https://preview.kalmea.test', (t) => `signed:${t}`);
  let charges = 0;
  const payments_ = { ...adapters.payments, charge: async (i: Parameters<typeof adapters.payments.charge>[0]) => { charges++; return adapters.payments.charge(i); } };
  const deps = (): Deps => ({ repo, payments: payments_, invoicing: adapters.invoicing, now: () => now });
  return { repo, tenants, subs, payments, deps, charges: () => charges, at: (iso: string) => { now = new Date(iso); } };
}

await ok('runDue: the open-attempt lookup errors -> NO charge, no ledger row, the business is counted as not charged', async () => {
  for (const mode of ['period', 'any'] as const) {
    const w = world({ lookupFails: mode });
    w.tenants.set(T, { id: T, name: 'עסק', plan_status: 'active', trial_ends_at: null, plan_price: 349 });
    await w.repo.insertSub({ tenant_id: T, price: 349, status: 'active', next_charge_at: '2026-11-10T05:00:00.000Z', token_ref: newMockToken('ok'), card_last4: '4242', card_brand: 'Visa', failed_attempts: 0, past_due_since: null, last_attempt_at: null, canceled_at: null, ends_at: null });
    const sum = await runDue(w.deps());
    assert.equal(w.charges(), 0, `${mode}: the provider was never called`);
    assert.equal(w.payments.length, 0, `${mode}: no pending row, so no identifier was drawn`);
    assert.equal(sum.charged, 0);
    const sub = (await w.repo.getSub(T))!;
    assert.equal(sub.last_attempt_at, null, `${mode}: the attempt was not even claimed, the next run retries cleanly`);
    assert.equal(sub.status, 'active', 'not marked past due for a failure that was ours');
  }
});

await ok('saveCard on a blocked business: the lookup errors -> an error goes back to the route, nothing is charged', async () => {
  const w = world({ lookupFails: 'any' });
  w.tenants.set(T, { id: T, name: 'עסק', plan_status: 'expired', trial_ends_at: null, plan_price: 349 });
  await assert.rejects(saveCard(w.deps(), T, { tokenRef: newMockToken('ok'), last4: '4242', brand: 'Visa' }), (e: unknown) => e instanceof OpenAttemptLookupError);
  assert.equal(w.charges(), 0);
  assert.equal(w.payments.length, 0);
});

await ok('the lookup works -> the charge goes through as before (the guard does not block the normal path)', async () => {
  const w = world({ lookupFails: 'none' });
  w.tenants.set(T, { id: T, name: 'עסק', plan_status: 'active', trial_ends_at: null, plan_price: 349 });
  await w.repo.insertSub({ tenant_id: T, price: 349, status: 'active', next_charge_at: '2026-11-10T05:00:00.000Z', token_ref: newMockToken('ok'), card_last4: '4242', card_brand: 'Visa', failed_attempts: 0, past_due_since: null, last_attempt_at: null, canceled_at: null, ends_at: null });
  const sum = await runDue(w.deps());
  assert.equal(sum.charged, 1); assert.equal(w.charges(), 1);
});

await ok('the Supabase repo: a read error in findOpenAttempt THROWS (it used to answer "nothing open")', async () => {
  // A chainable fake of the query builder whose result is an error.
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'order', 'limit', 'is']) q[m] = () => q;
  q.then = (res: (v: unknown) => void) => res({ data: null, error: { message: 'timeout' } });
  const db = { from: () => q } as unknown as Parameters<typeof supabaseBillingRepo>[0];
  const repo = supabaseBillingRepo(db);
  await assert.rejects(repo.findOpenAttempt!('s1', '2026-11-10'), /findOpenAttempt: timeout/);
  await assert.rejects(repo.findOpenAttempt!('s1', null), /findOpenAttempt: timeout/);
  const src = read('lib/billing/repo.ts');
  assert.ok(!/if \(error\) return null;/.test(src.slice(src.indexOf('async findOpenAttempt'), src.indexOf('async insertPayment'))), 'no fail-open branch left');
});

await ok('every caller of findOpenAttempt goes through the guarded lookup', () => {
  const svc = read('lib/billing/service.ts');
  const calls = svc.match(/repo\.findOpenAttempt\(/g) || [];
  assert.equal(calls.length, 2, 'the period and any-period lookups, on one guarded line');
  const guarded = svc.slice(svc.indexOf('let open: PaymentRecord | null = null;'), svc.indexOf('throw new OpenAttemptLookupError'));
  assert.equal((guarded.match(/repo\.findOpenAttempt\(/g) || []).length, 2);
  // The routes: runDue catches per business (alert, next business); grow-notify answers 503 so Grow retries; mock-card shows an error.
  assert.match(read('app/api/billing/grow-notify/route.ts'), /return done\(503\)/);
  assert.match(read('app/api/billing/mock-card/route.ts'), /catch \(e\)/);
});

// ── 11. till tabs ───────────────────────────────────────────────────────────
await ok('till tabs: payments always; vouchers and products only when on; a chosen tab that disappears falls back to payments', () => {
  assert.deepEqual(tillTabsOf({}).map((t) => t.k), ['pay']);
  assert.deepEqual(tillTabsOf({ vouchers: true, products: true }).map((t) => t.k), ['pay', 'vouchers', 'products']);
  assert.deepEqual(tillTabsOf({ products: true }).map((t) => t.l), ['תשלומים', 'מוצרים']);
  assert.equal(activeTillTab('vouchers', tillTabsOf({ vouchers: true })), 'vouchers');
  assert.equal(activeTillTab('vouchers', tillTabsOf({ products: true })), 'pay');
  assert.equal(activeTillTab('nonsense', tillTabsOf({})), 'pay');
});

await ok('till screen: a tab bar only with more than one tab, panels stay mounted (hidden), payments panel holds the money views', () => {
  const app = read('app/beautyos.jsx');
  assert.match(app, /tillTabsOf\(\{vouchers:giftVouchersVisible\(settings\)&&vouchersAvail,products:productsApi\.visible/);
  assert.match(app, /\{tabs\.length>1&&\(\n <div role="tablist" aria-label="אזורי הקופה" data-testid="till-tabs"/);
  assert.match(app, /hidden=\{cur!=="vouchers"\}>\n <GiftVouchersPanel /);
  assert.match(app, /hidden=\{cur!=="products"\}>\n <ProductsPanel /);
  const pay = app.slice(app.indexOf('hidden={cur!=="pay"}'), app.indexOf('{/* WHATSAPP CENTER */}'));
  assert.ok(/<GrowPaymentRequests /.test(pay) && /todayAppts\.length>0/.test(pay) && /אישורי תשלום/.test(pay));
  // "תשלום חדש" stays above the tabs, reachable from every tab.
  const cashier = app.slice(app.indexOf('{activeTab==="cashier"&&('), app.indexOf('data-testid="till-tabs"'));
  assert.match(cashier, /✦ תשלום חדש/);
});

// ── 9. sell a voucher from "תשלום חדש" ──────────────────────────────────────
await ok('"תשלום חדש" offers "מכירת שובר מתנה" only while selling is on, on a fresh payment; it opens the panel\'s own sale form', () => {
  const app = read('app/beautyos.jsx');
  assert.match(app, /\{giftVouchersSelling\(settings\)&&vouchersAvail&&!cashierAppt&&cashierItems\.length===0&&\(\n <button type="button" data-testid="cashier-sell-voucher" onClick=\{openVoucherSale\}/);
  assert.match(app, /const openVoucherSale = \(\) => \{ setShowCashier\(false\); setActiveTab\("cashier"\); setTillTab\("vouchers"\); setVoucherSellReq\(n=>n\+1\); \};/);
  assert.match(app, /<GiftVouchersPanel [^\n]*sellRequest=\{voucherSellReq\}/);
  // No second sale path: the dashboard never posts a voucher sale itself.
  assert.ok(!/action: ?["']sell["']/.test(app), 'the sale is only in GiftVouchersPanel');
  const panel = read('app/GiftVouchersPanel.jsx');
  assert.match(panel, /if \(!sellRequest \|\| sellRequest === handledSell\.current \|\| !data\?\.ready \|\| !sellingOn\) return;/);
  assert.match(panel, /useEffect\(\(\) => \{ onAvailable\?\.\(!hidden\); \}, \[hidden, onAvailable\]\);/);
  // The hooks come before the panel's early returns (rules of hooks).
  assert.ok(panel.indexOf('const handledSell = useRef(0);') < panel.indexOf('if (!visible || data?.needsMigration) return null;'));
  // The marketing card's "מכירה בקופה" lands on the vouchers tab too.
  assert.match(app, /setActiveTab\("cashier"\);setTillTab\("vouchers"\);\}\}/);
});

// ── 10. one place for deposits ─────────────────────────────────────────────
await ok('Settings > תשלומים is the one place for deposits; booking rules and the Grow card link there; same stored fields', () => {
  const app = read('app/beautyos.jsx');
  assert.match(app, /\{k:"booking",l:"יומן ושירותים"\},\{k:"payments",l:"תשלומים"\}/);
  assert.equal(screenFromSearch('?tab=settings&section=payments').section, 'payments', 'the section has its own link');
  assert.match(app, /\{inG\("payments"\)&&\(\(\)=>\{/);
  assert.match(app, /<PaymentsSettings rules=\{r\} setRule=\{setRule\}/);
  // The deposit input is no longer in the booking rules: only a summary and a link.
  assert.ok(!/aria-label="מקדמה"/.test(app), 'no deposit input left in the dashboard');
  assert.match(app, /data-testid="booking-deposit-link"[\s\S]{0,400}setSettingsGroup\("payments"\)/);
  assert.match(app, /<GrowCard [^\n]*onOpenPolicy=\{\(\)=>setSettingsGroup\("payments"\)\}/);
  const ps = read('app/PaymentsSettings.jsx');
  assert.match(ps, /aria-label="מקדמה"/);
  assert.match(ps, /setRule\(\{ deposit_amount:/);
  assert.match(ps, /setRule\(\{ deposit_note:/);
  assert.match(ps, /<CancelPolicyCard /);
  assert.match(ps, /loaded && connected &&/, 'the Grow deposit shows only while connected');
  const grow = read('app/GrowCard.jsx');
  assert.match(grow, /\{onOpenPolicy \? \(/);
  assert.match(grow, /<CancelPolicyCard /, 'kept for any caller without the link (nothing removed)');
  for (const f of ['app/PaymentsSettings.jsx', 'app/GrowCard.jsx', 'app/ServiceDepositToggle.jsx', 'lib/tillTabs.ts']) assert.ok(!/—/.test(read(f).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')), `${f}: no em dash in copy`);
});

console.log(`\n${n} till-polish tests passed`);
