// Paid add-on packs (lib/pricing.ts ADDON_PACKS): the prices live in one place, a pack is credited only for a charge the provider confirmed,
// the quota it buys is enforced on the server (count cap AND dollar ceiling), and with packs OFF nothing changes at all.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeCapDb } from './testkit/capDb.js';
import { ADDON_PACKS, ADDON_PACK_KEYS, addonPacksEnabled, addonButtonHe, addonPackForCallSite } from './lib/pricing.ts';
import { capWithPacks, checkAiAllowance, MONTHLY_CALL_CAPS, tenantMonthlyUsdCeiling } from './lib/ai/callCaps.ts';
import { capRefusalHe } from './lib/ai/capMessages.ts';
import { addonPackForMessage } from './lib/addonOffer.ts';
import { periodMonth, emptyPurchased, totalUsd } from './lib/addonQuota.ts';
import { buyAddon, type Deps, type PaymentRecord } from './lib/billing/service.ts';
import { getQuotaStatus, DEFAULT_MONTHLY_LIMIT } from './lib/skinScanQuota.ts';

let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };

await ok('the four packs and their prices, as decided with Shaked', () => {
  assert.deepEqual(ADDON_PACK_KEYS.sort(), ['advisor', 'posts', 'reels', 'skinscan']);
  assert.deepEqual([ADDON_PACKS.posts.units, ADDON_PACKS.posts.price, ADDON_PACKS.posts.included], [10, 29, 9]);
  assert.deepEqual([ADDON_PACKS.reels.units, ADDON_PACKS.reels.price, ADDON_PACKS.reels.included], [10, 29, 6]);
  assert.deepEqual([ADDON_PACKS.advisor.units, ADDON_PACKS.advisor.price, ADDON_PACKS.advisor.included], [100, 39, 60]);
  assert.deepEqual([ADDON_PACKS.skinscan.units, ADDON_PACKS.skinscan.price, ADDON_PACKS.skinscan.included], [100, 19, 50]);
  assert.equal(addonButtonHe(ADDON_PACKS.reels), '+10 רילסים עם AI ב-29 ₪');
  assert.equal(addonPackForCallSite('marketing/reel')?.key, 'reels');
  assert.equal(addonPackForCallSite('whatsapp-webhook'), null);
});

await ok('the flag: off unless exactly "1"', () => {
  assert.equal(addonPacksEnabled({}), false);
  assert.equal(addonPacksEnabled({ NEXT_PUBLIC_ADDON_PACKS: 'true' }), false);
  assert.equal(addonPacksEnabled({ NEXT_PUBLIC_ADDON_PACKS: '1' }), true);
});

await ok('caps: OFF keeps the old ceilings; ON is included + bought; features without a pack never change', () => {
  const bought = emptyPurchased();
  bought.reels.units = 20;
  assert.deepEqual(capWithPacks('marketing/reel', bought, false), { cap: MONTHLY_CALL_CAPS['marketing/reel'], purchased: 0 });
  assert.deepEqual(capWithPacks('marketing/reel', bought, true), { cap: 6 + 20, purchased: 20 });
  assert.deepEqual(capWithPacks('advisor', emptyPurchased(), true), { cap: 60, purchased: 0 });
  assert.deepEqual(capWithPacks('whatsapp-webhook', bought, true), { cap: MONTHLY_CALL_CAPS['whatsapp-webhook'], purchased: 0 });
  bought.advisor.usd = 7;
  assert.equal(totalUsd(bought), 7);
});

await ok('the month is Israel\'s: 23:30 UTC on 31 October is already 1 November', () => {
  assert.equal(periodMonth(new Date('2026-10-15T09:00:00Z')), '2026-10-01');
  assert.equal(periodMonth(new Date('2026-10-31T22:30:00Z')), '2026-11-01');
});

await ok('a refusal is matched to its pack by its own wording, and only with packs on', () => {
  assert.equal(addonPackForMessage(capRefusalHe('calls', 'marketing/reel'), true)?.key, 'reels');
  assert.equal(addonPackForMessage(capRefusalHe('calls', 'designs/generate') + ' התבניות בגלריה פתוחות לך.', true)?.key, 'posts');
  assert.equal(addonPackForMessage(capRefusalHe('calls', 'advisor'), true)?.key, 'advisor');
  assert.equal(addonPackForMessage(capRefusalHe('calls', 'marketing/reel'), false), null);
  assert.equal(addonPackForMessage(capRefusalHe('dollars', 'marketing/reel'), true), null, 'the dollar ceiling is not a pack');
  assert.equal(addonPackForMessage(capRefusalHe('unreadable', 'advisor'), true), null, 'an unreadable counter is not a pack');
  assert.equal(addonPackForMessage('משהו אחר', true), null);
});

// ── server enforcement through the real checkAiAllowance ────────────────────
const T = '11111111-1111-1111-1111-111111111111';
const NOW = new Date('2026-10-15T09:00:00Z');
const usage = (count: number, site: string, usd = 0.01) => Array.from({ length: count }, (_, i) => ({ id: `u${String(i).padStart(6, '0')}`, tenant_id: T, call_site: site, created_at: '2026-10-10T08:00:00Z', cost_usd: usd }));
const allow = (db: any) => ({ client: db, now: NOW, alert: async () => {}, noCache: true, alertThrottle: new Map<string, number>() });

await ok('packs ON: the 7th reel is refused at 6 included; a bought pack of 10 lets it through', async () => {
  process.env.NEXT_PUBLIC_ADDON_PACKS = '1';
  try {
    const none = makeCapDb({ ai_usage: usage(6, 'marketing/reel'), billing_addons: [] });
    const a = await checkAiAllowance(T, 'marketing/reel', allow(none));
    assert.equal(a.allowed, false);
    assert.equal(a.reason, 'calls');
    assert.equal(a.callsCap, 6);
    const pack = { tenant_id: T, pack: 'reels', units: 10, usd_allowance: 1.5, period_month: '2026-10-01' };
    const withPack = makeCapDb({ ai_usage: usage(6, 'marketing/reel'), billing_addons: [pack] });
    const b = await checkAiAllowance(T, 'marketing/reel', allow(withPack));
    assert.equal(b.allowed, true);
    assert.equal(b.callsCap, 16);
    assert.equal(b.usdCap, tenantMonthlyUsdCeiling() + 1.5, 'the dollar ceiling grows by what the pack can cost');
    const lastMonth = makeCapDb({ ai_usage: usage(6, 'marketing/reel'), billing_addons: [{ ...pack, period_month: '2026-09-01' }] });
    assert.equal((await checkAiAllowance(T, 'marketing/reel', allow(lastMonth))).allowed, false, 'a pack does not roll over');
    const other = makeCapDb({ ai_usage: usage(6, 'marketing/reel'), billing_addons: [{ ...pack, tenant_id: '22222222-2222-2222-2222-222222222222' }] });
    assert.equal((await checkAiAllowance(T, 'marketing/reel', allow(other))).allowed, false, 'another business\'s pack never counts');
  } finally { delete process.env.NEXT_PUBLIC_ADDON_PACKS; }
});

await ok('packs OFF: 6 reels are nowhere near the old ceiling, nothing is read from billing_addons', async () => {
  const db = makeCapDb({ ai_usage: usage(6, 'marketing/reel') });
  const a = await checkAiAllowance(T, 'marketing/reel', allow(db));
  assert.equal(a.allowed, true);
  assert.equal(a.callsCap, MONTHLY_CALL_CAPS['marketing/reel']);
  assert.equal(a.usdCap, tenantMonthlyUsdCeiling());
});

await ok('skin scans: OFF keeps the 200 ceiling; ON is 50 included plus the packs bought', async () => {
  const db = makeCapDb({ ai_usage: usage(60, 'skin-scan') }) as any;
  const off = await getQuotaStatus(T, { db, now: NOW });
  assert.deepEqual([off.limit, off.exceeded], [DEFAULT_MONTHLY_LIMIT, false]);
  process.env.NEXT_PUBLIC_ADDON_PACKS = '1';
  try {
    const none = await getQuotaStatus(T, { db, now: NOW, purchasedUnits: 0 });
    assert.deepEqual([none.limit, none.exceeded], [50, true]);
    const one = await getQuotaStatus(T, { db, now: NOW, purchasedUnits: 100 });
    assert.deepEqual([one.limit, one.exceeded, one.remaining], [150, false, 90]);
  } finally { delete process.env.NEXT_PUBLIC_ADDON_PACKS; }
});

// ── buying a pack ────────────────────────────────────────────────────────────
function shop(opts: { card?: boolean; charge?: any; lookup?: any; addons?: boolean } = {}) {
  const payments: PaymentRecord[] = [];
  const addons: any[] = [];
  const charges: any[] = [];
  let id = 0;
  const repo: any = {
    getSub: async () => ({ id: 'sub1', tenant_id: T, price: 499, status: 'active', token_ref: opts.card === false ? null : 'tok_1', card_last4: '4242' }),
    getTenant: async () => ({ id: T, name: 'בדיקה', phone: '0500000000' }),
    insertPayment: async (r: any) => { const p = { ...r, id: `p${++id}`, created_at: NOW.toISOString() }; payments.push(p); return p; },
    updatePayment: async (pid: string, patch: any) => { Object.assign(payments.find((p) => p.id === pid)!, patch); },
    ...(opts.addons === false ? {} : { insertAddon: async (r: any) => { addons.push(r); } }),
  };
  const d: Deps = {
    repo,
    payments: { createCardSession: async () => ({ url: '' }), charge: async (i: any) => { charges.push(i); return opts.charge ?? { ok: true, providerPaymentId: 'pp1' }; }, ...(opts.lookup ? { lookup: async () => opts.lookup } : {}) } as any,
    invoicing: { issueInvoice: async () => ({ ok: true, number: '1', url: 'https://example.test/doc' }) } as any,
    now: () => NOW,
    newIdentifier: () => 123456,
  };
  return { d, payments, addons, charges };
}

await ok('a confirmed charge credits the pack for this month, at the configured price', async () => {
  const s = shop();
  const r = await buyAddon(s.d, T, ADDON_PACKS.reels);
  assert.equal(r.ok, true);
  assert.equal(s.charges.length, 1);
  assert.equal(s.charges[0].amount, 29);
  assert.equal(s.charges[0].uniqueIdentifier, 123456);
  assert.equal(s.payments[0].kind, 'addon');
  assert.equal(s.payments[0].status, 'succeeded');
  assert.deepEqual(s.addons, [{ tenant_id: T, pack: 'reels', units: 10, usd_allowance: 1.5, price: 29, period_month: '2026-10-01', payment_id: 'p1' }]);
});

await ok('no saved card: nothing is charged and nothing is credited', async () => {
  const s = shop({ card: false });
  const r = await buyAddon(s.d, T, ADDON_PACKS.posts);
  assert.deepEqual([r.ok, !r.ok && r.reason], [false, 'no-card']);
  assert.equal(s.charges.length + s.payments.length + s.addons.length, 0);
});

await ok('a declined card: the payment is failed and nothing is credited', async () => {
  const s = shop({ charge: { ok: false, code: 'declined', error: 'refused' } });
  const r = await buyAddon(s.d, T, ADDON_PACKS.advisor);
  assert.deepEqual([r.ok, !r.ok && r.reason], [false, 'declined']);
  assert.equal(s.payments[0].status, 'failed');
  assert.equal(s.addons.length, 0);
});

await ok('a lost answer that the provider says was paid is credited once; an unsettled one credits nothing', async () => {
  const paid = shop({ charge: { ok: false, code: 'unreachable', error: 'timeout' }, lookup: { ok: true, found: true, status: 'paid', providerPaymentId: 'pp9' } });
  assert.equal((await buyAddon(paid.d, T, ADDON_PACKS.skinscan)).ok, true);
  assert.equal(paid.charges.length, 1, 'never charged again with a new identifier');
  assert.equal(paid.addons.length, 1);
  const unknown = shop({ charge: { ok: false, code: 'duplicate', error: 'seen' }, lookup: { ok: true, found: true, status: 'pending' } });
  const r = await buyAddon(unknown.d, T, ADDON_PACKS.skinscan);
  assert.deepEqual([r.ok, !r.ok && r.reason], [false, 'pending']);
  assert.equal(unknown.payments[0].status, 'unknown');
  assert.equal(unknown.addons.length, 0);
});

await ok('a repo without billing_addons support cannot sell a pack', async () => {
  const s = shop({ addons: false });
  const r = await buyAddon(s.d, T, ADDON_PACKS.reels);
  assert.deepEqual([r.ok, !r.ok && r.reason], [false, 'unavailable']);
  assert.equal(s.charges.length, 0);
});

await ok('wiring: the purchase route, the migration and the buttons exist and stay behind the flag', () => {
  const route = readFileSync('app/api/billing/addon/route.ts', 'utf8');
  assert.match(route, /if \(!addonPacksEnabled\(\)\) return/);
  assert.match(route, /isDemoTenantId/);
  const sql = readFileSync('supabase/migrations/add_billing_addons.sql', 'utf8');
  assert.match(sql, /'subscription', 'manual', 'addon'/);
  assert.match(sql, /billing_addons_one_per_payment/);
  assert.doesNotMatch(sql, /for (insert|update|delete)/i, 'only the service role writes packs');
  const card = readFileSync('app/BillingCard.jsx', 'utf8');
  assert.match(card, /Array\.isArray\(s\.addons\)/);
  assert.match(card, /addon-confirm-/, 'a pack is charged only after an explicit "yes"');
  const gen = readFileSync('app/design/Generate.jsx', 'utf8');
  assert.match(gen, /atCap && addonPacksEnabled\(\)/);
  for (const k of ADDON_PACK_KEYS) for (const f of ['app/BillingCard.jsx', 'app/beautyos.jsx', 'app/design/Generate.jsx']) {
    assert.doesNotMatch(readFileSync(f, 'utf8'), new RegExp(`ב-${ADDON_PACKS[k].price} ₪`), `${f} hard-codes a pack price`);
  }
});

console.log(`addons: ${n} ok`);
