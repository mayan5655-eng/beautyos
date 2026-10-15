// Grow webhook (/api/grow/webhook): address check, the three payload shapes, malformed bodies, and the onboarding
// matching rules - all with fake repos, so nothing here can reach Grow or a database.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GROW_IPS, clientIp, ipAllowed, ipCheckEnforced, allowedIps, classifyWebhook, readOnboarding, applyOnboarding, parseWebhookBody,
} from './lib/grow/webhook.ts';
import type { OnboardingRepo, MatchState } from './lib/grow/webhook.ts';
import { GROW_IPS as GROW_IPS_CFG, GROW_IPS_SOURCE } from './lib/grow/growIps.ts';
import { buildProcessFields, tenantRefOf, findCustomField } from './lib/grow/payload.ts';
import { applyNotification, applyNotificationByProcess, applyInvoiceByProcess, findProcessId } from './lib/grow/service.ts';
import type { GrowRepo, GrowPayment } from './lib/grow/service.ts';

const rd = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n');
let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };

const GROW_IP = GROW_IPS[0];
const h = (m: Record<string, string>) => ({ get: (k: string) => m[k.toLowerCase()] ?? null });

// ── the three shapes Grow sends ───────────────────────────────────────────────
const ONBOARDING = {
  err: '',
  status: 1,
  data: {
    name: 'דנה כהן', phone: '0501234567', api_key: 'SECRET-KEY-VALUE', user_id: 'u8f3a91c2', package_id: 12, package_name: 'Platform',
    tracking_code: 'TRK-1001', business_title: 'סטודיו דנה', tracking_status: { id: 3, message: 'ממתין לאישור' },
  },
};
const PAYMENT = { data: { processId: 'P1', transactionId: 'T1', sum: '250.00', statusCode: '2', asmachta: 'A9' } };
const INVOICE = { data: { processId: 'P1', invoiceUrl: 'https://docs.example.test/inv/123.pdf' } };

const pay = (over: Partial<GrowPayment> = {}): GrowPayment => ({
  id: 'pay-1', tenant_id: 'ten-1', status: 'created', amount: 250, process_id: 'P1', receipt_id: null,
  client_id: null, client_name: 'לקוחה', appointment_id: null, description: 'פנים', notify_token: 'tok-aaaaaaaaaaaaaaaa', ...over,
});

function fakeGrowRepo(rows: GrowPayment[]) {
  const log: string[] = [];
  const repo: GrowRepo = {
    async insertPayment() { throw new Error('unused'); },
    async updatePayment(id, patch) { log.push(`update ${id} ${Object.keys(patch).join(',')}`); const r = rows.find((x) => x.id === id); if (r) Object.assign(r, patch); },
    async markPaid(id) { const r = rows.find((x) => x.id === id && x.status === 'created'); if (!r) return null; r.status = 'paid'; return { ...r }; },
    async findByToken(t) { return rows.find((x) => x.notify_token === t) || null; },
    async findByProcessId(pid) { const m = rows.filter((x) => x.process_id === pid); return m.length === 1 ? m[0] : null; },
    async insertReceipt() { log.push('receipt'); return { id: 'rc-1' }; },
    async setReceiptDocument(id, url) { log.push(`doc ${id} ${url}`); },
  };
  return { repo, log };
}
const deps = (repo: GrowRepo) => ({ repo, creds: { apiKey: '', pageCode: '', apiBase: '' }, appUrl: 'https://kalmea.app', newToken: () => 'x'.repeat(24) });

function fakeOnboardingRepo(opts: { pending?: Record<string, string>; accounts?: Record<string, { user_id: string; enabled: boolean }> } = {}) {
  const updates: Record<string, unknown>[] = [];
  const accounts = { ...(opts.accounts || {}) };
  const matches: [string, MatchState, string | null][] = [];
  const consumed: string[] = [];
  const repo: OnboardingRepo = {
    async insertUpdate(row) { updates.push(row); return `up-${updates.length}`; },
    async findPendingByTrackingCode(code) { const t = (opts.pending || {})[code]; return t ? { tenant_id: t } : null; },
    async getAccount(t) { return accounts[t] || null; },
    async saveAccount(t, u, e) { accounts[t] = { user_id: u, enabled: e }; },
    async setMatch(id, s, t) { matches.push([id, s, t]); },
    async clearPending(t) { consumed.push(t); },
  };
  return { repo, updates, accounts, matches, consumed };
}

// ── address check ────────────────────────────────────────────────────────────
await ok('only Grow\'s published addresses pass; anything else, or no address, is refused', () => {
  assert.equal(ipAllowed(GROW_IP, {}), true);
  assert.equal(ipAllowed('::ffff:' + GROW_IP, {}), true);
  assert.equal(ipAllowed('8.8.8.8', {}), false);
  assert.equal(ipAllowed('', {}), false);
  assert.equal(new Set(GROW_IPS).size, GROW_IPS.length, 'no duplicates in the list');
  assert.ok(GROW_IPS.every((ip) => /^\d{1,3}(\.\d{1,3}){3}$/.test(ip)));
});

await ok('the address comes from Vercel\'s headers: x-real-ip first, then the first x-forwarded-for entry', () => {
  assert.equal(clientIp(h({ 'x-real-ip': '1.2.3.4', 'x-forwarded-for': '5.6.7.8' })), '1.2.3.4');
  assert.equal(clientIp(h({ 'x-forwarded-for': '5.6.7.8, 9.9.9.9' })), '5.6.7.8');
  assert.equal(clientIp(h({})), '');
});

await ok('enforced by default and in production; relaxed only with the flag AND outside production; list overridable', () => {
  assert.equal(ipCheckEnforced({}), true);
  assert.equal(ipCheckEnforced({ GROW_WEBHOOK_IP_CHECK: 'off' }), false); // sandbox / test
  assert.equal(ipCheckEnforced({ GROW_WEBHOOK_IP_CHECK: 'off', GROW_ENV: 'production' }), true); // cannot weaken live
  assert.equal(ipCheckEnforced({ GROW_ENV: 'production' }), true);
  assert.deepEqual([...allowedIps({ GROW_WEBHOOK_IPS: '10.0.0.1, 10.0.0.2' })], ['10.0.0.1', '10.0.0.2']);
  assert.equal(ipAllowed('10.0.0.1', { GROW_WEBHOOK_IPS: '10.0.0.1' }), true);
  assert.equal(ipAllowed(GROW_IP, { GROW_WEBHOOK_IPS: '10.0.0.1' }), false);
});

// ── dispatch by shape ──────────────────────────────────────────────────────────
await ok('payment, invoice and onboarding bodies are told apart; everything else is unknown', () => {
  assert.equal(classifyWebhook(ONBOARDING), 'onboarding');
  assert.equal(classifyWebhook(PAYMENT), 'payment');
  assert.equal(classifyWebhook(INVOICE), 'invoice');
  assert.equal(classifyWebhook({ hello: 'world' }), 'unknown');
  assert.equal(classifyWebhook({ data: { user_id: 'u8f3a91c2' } }), 'unknown'); // user_id alone is not enough
  assert.equal(classifyWebhook([]), 'unknown');
  assert.equal(classifyWebhook(null), 'unknown');
  assert.equal(classifyWebhook('x'), 'unknown');
});

await ok('a form-style payment (data[processId]) is still a payment', () => {
  assert.equal(classifyWebhook({ 'data[processId]': 'P1', 'data[transactionId]': 'T1', 'data[sum]': '250', 'data[statusCode]': '2' }), 'payment');
});

// ── malformed bodies ───────────────────────────────────────────────────────────
await ok('malformed bodies are refused or read as nothing, never thrown', () => {
  assert.equal(parseWebhookBody('', 'application/json'), null);
  assert.equal(parseWebhookBody('   ', 'application/json'), null);
  assert.equal(parseWebhookBody('{not json', 'application/json'), null);
  assert.equal(parseWebhookBody('[1,2,3]', 'application/json'), null);
  assert.equal(parseWebhookBody('"just a string"', 'application/json'), null);
  assert.equal(parseWebhookBody('x'.repeat(70 * 1024), 'application/json'), null);
  assert.equal(parseWebhookBody('plain words', 'text/plain'), null);
  assert.deepEqual(parseWebhookBody('{"a":1}', 'application/json'), { a: 1 });
  assert.deepEqual(parseWebhookBody('data%5BprocessId%5D=P1&x=2', 'application/x-www-form-urlencoded'), { 'data[processId]': 'P1', x: '2' });
});

// ── payments ─────────────────────────────────────────────────────────────────
await ok('payment without a secret in the URL: found by process id, amount must still match', async () => {
  const rows = [pay()];
  const { repo, log } = fakeGrowRepo(rows);
  const r = await applyNotificationByProcess(PAYMENT, deps(repo));
  assert.equal(r.status, 'paid');
  assert.ok(log.includes('receipt'));
  // wrong amount: not paid, no receipt
  const rows2 = [pay({ id: 'pay-2' })];
  const f2 = fakeGrowRepo(rows2);
  const bad = await applyNotificationByProcess({ processId: 'P1', transactionId: 'T9', sum: '999', statusCode: '2' }, deps(f2.repo));
  assert.equal(bad.status, 'mismatch');
  assert.ok(!f2.log.includes('receipt'));
});

await ok('payment with the per-payment secret keeps working; a wrong secret is ignored', async () => {
  const rows = [pay()];
  const { repo } = fakeGrowRepo(rows);
  const flat = { processId: 'P1', transactionId: 'T1', sum: '250', statusCode: '2' };
  assert.equal((await applyNotification(flat, 'wrong-token-wrong-token', deps(repo))).status, 'unknown-token');
  assert.equal((await applyNotification(flat, 'tok-aaaaaaaaaaaaaaaa', deps(repo))).status, 'paid');
  // a duplicate does not create a second receipt
  assert.equal((await applyNotification(flat, 'tok-aaaaaaaaaaaaaaaa', deps(repo))).status, 'already');
});

await ok('an unknown or ambiguous process id is ignored, not guessed', async () => {
  const f = fakeGrowRepo([pay({ id: 'a' }), pay({ id: 'b' })]); // two rows share P1
  assert.equal((await applyNotificationByProcess({ processId: 'P1', transactionId: 'T1', sum: '250', statusCode: '2' }, deps(f.repo))).status, 'unknown-token');
  const g = fakeGrowRepo([pay()]);
  assert.equal((await applyNotificationByProcess({ processId: 'NOPE', transactionId: 'T1', sum: '250', statusCode: '2' }, deps(g.repo))).status, 'unknown-token');
});

// ── invoices ─────────────────────────────────────────────────────────────────
await ok('invoice without a secret is attached to the payment named by its process id', async () => {
  const rows = [pay({ receipt_id: 'rc-9' })];
  const { repo, log } = fakeGrowRepo(rows);
  assert.equal(findProcessId(INVOICE), 'P1');
  const r = await applyInvoiceByProcess(INVOICE, deps(repo));
  assert.equal(r.status, 'stored');
  assert.ok(log.some((l) => l.startsWith('doc rc-9 https://docs.example.test/inv/123.pdf')));
  assert.equal((await applyInvoiceByProcess({ url: 'https://x.test/a.pdf' }, deps(repo))).status, 'unmatched');
});

// ── onboarding ───────────────────────────────────────────────────────────────
await ok('onboarding payload is reduced to safe fields: no api_key, no phone, user_id only when well formed', () => {
  const u = readOnboarding(ONBOARDING)!;
  assert.equal(u.userId, 'u8f3a91c2');
  assert.equal(u.trackingCode, 'TRK-1001');
  assert.equal(u.businessTitle, 'סטודיו דנה');
  assert.equal(u.trackingStatusMessage, 'ממתין לאישור');
  assert.equal(u.hadApiKey, true);
  const flat = JSON.stringify(u);
  assert.ok(!flat.includes('SECRET-KEY-VALUE'));
  assert.ok(!flat.includes('0501234567'));
  assert.equal(readOnboarding({ data: { user_id: 'bad id!', tracking_code: 'T' } })!.userId, null);
  assert.equal(readOnboarding({ nothing: true }), null);
});

await ok('an update with no matching pending onboarding is stored as unmatched and attached to nobody', async () => {
  const f = fakeOnboardingRepo({ pending: { 'OTHER-CODE': 'ten-9' } });
  const r = await applyOnboarding(readOnboarding(ONBOARDING)!, f.repo, () => new Date('2026-10-14T08:00:00Z'));
  assert.equal(r.status, 'unmatched');
  assert.equal(f.updates.length, 1);
  assert.equal(f.updates[0].match_state, 'unmatched');
  assert.deepEqual(f.accounts, {});
  assert.deepEqual(f.consumed, []);
  assert.ok(!JSON.stringify(f.updates[0]).includes('SECRET-KEY-VALUE'));
  assert.ok(!JSON.stringify(f.updates[0]).includes('0501234567'));
  assert.equal(f.updates[0].had_api_key, true);
});

await ok('a tracking code with no correlation field at all is never matched by name or phone', async () => {
  const f = fakeOnboardingRepo({ pending: { 'TRK-1001': 'ten-1' } });
  const noCode = { ...ONBOARDING, data: { ...ONBOARDING.data, tracking_code: '' } };
  const r = await applyOnboarding(readOnboarding(noCode)!, f.repo);
  assert.equal(r.status, 'unmatched');
  assert.deepEqual(f.accounts, {});
});

await ok('an exact tracking-code match saves the userId on that tenant, switched OFF, and consumes the pending row', async () => {
  const f = fakeOnboardingRepo({ pending: { 'TRK-1001': 'ten-1' } });
  const r = await applyOnboarding(readOnboarding(ONBOARDING)!, f.repo);
  assert.equal(r.status, 'matched');
  assert.deepEqual(f.accounts['ten-1'], { user_id: 'u8f3a91c2', enabled: false });
  assert.deepEqual(f.matches, [['up-1', 'matched', 'ten-1']]);
  assert.deepEqual(f.consumed, ['ten-1']);
});

await ok('a tenant already connected to a different Grow business is a conflict for a person to resolve', async () => {
  const f = fakeOnboardingRepo({ pending: { 'TRK-1001': 'ten-1' }, accounts: { 'ten-1': { user_id: 'someoneelse1', enabled: true } } });
  const r = await applyOnboarding(readOnboarding(ONBOARDING)!, f.repo);
  assert.equal(r.status, 'conflict');
  assert.equal(f.accounts['ten-1'].user_id, 'someoneelse1');
  assert.equal(f.accounts['ten-1'].enabled, true);
  assert.deepEqual(f.consumed, []);
});

await ok('the same userId arriving again keeps her existing on/off choice', async () => {
  const f = fakeOnboardingRepo({ pending: { 'TRK-1001': 'ten-1' }, accounts: { 'ten-1': { user_id: 'u8f3a91c2', enabled: true } } });
  assert.equal((await applyOnboarding(readOnboarding(ONBOARDING)!, f.repo)).status, 'matched');
  assert.equal(f.accounts['ten-1'].enabled, true);
});

// ── the route and the surfaces around it ─────────────────────────────────────────
await ok('the route exists, checks the address first, answers 403/400/405 and never logs a body or an id', () => {
  const r = rd('app/api/grow/webhook/route.ts');
  assert.ok(r.indexOf('ipCheckEnforced()') < r.indexOf('readBody(request)') , 'address check comes before the body is read');
  assert.match(r, /status: 403/);
  assert.match(r, /status: 400/);
  assert.match(r, /status: 405/);
  assert.match(r, /applyNotificationByProcess/);
  assert.match(r, /applyInvoiceByProcess/);
  assert.match(r, /applyOnboarding/);
  for (const line of r.split('\n').filter((l) => /console\.(log|warn|error)/.test(l))) {
    assert.doesNotMatch(line, /raw|body|user_?id|api_?key|update/i, line);
  }
});

await ok('the existing per-payment routes are untouched and still the ones createCharge hands to Grow', () => {
  const s = rd('lib/grow/service.ts');
  assert.match(s, /\/api\/grow\/notify\?t=\$\{payment\.notify_token\}/);
  assert.match(s, /\/api\/grow\/invoice\?t=\$\{payment\.notify_token\}/);
});

await ok('the onboarding SQL: server-only tables, nothing granted to the browser roles, no api_key column', () => {
  const sql = rd('supabase/migrations/add_grow_onboarding.sql');
  assert.match(sql, /enable row level security/g);
  assert.match(sql, /revoke all on public\.grow_onboarding_updates from anon, authenticated/);
  assert.match(sql, /revoke all on public\.grow_onboarding_pending from anon, authenticated/);
  assert.doesNotMatch(sql, /\bgrant\b/i);
  assert.doesNotMatch(sql, /api_key\s+text/i);
  assert.doesNotMatch(sql, /\bphone\b\s+text/i);
});

await ok('the admin list is read-only, masks the id and is gated by the admin page', () => {
  const c = rd('app/dashboard/admin/GrowOnboarding.tsx');
  assert.match(c, /maskUserId/);
  assert.doesNotMatch(c, /\.(insert|update|delete|upsert)\(/);
  assert.doesNotMatch((c.match(/.select('([^']*)')/) || [])[1] || 'x', /api_key|phone/);
  assert.doesNotMatch(c, /'use client'|"use client"/);
  const p = rd('app/dashboard/admin/page.tsx');
  assert.ok(p.indexOf('requirePlatformAdmin()') < p.indexOf('<GrowOnboarding'));
});

// ── cFields: our tenant id travels with the payment and comes back ────────────────
await ok('the charge carries the tenant id in cField2 (no hyphens) next to the payment id in cField1', () => {
  const f = Object.fromEntries(buildProcessFields({
    userId: 'u123', pageCode: 'pc', sum: 250, description: 'פנים', fullName: 'דנה כהן', phone: '0501234567',
    successUrl: 'https://x.test/ok', cancelUrl: 'https://x.test/no', notifyUrl: 'https://x.test/n?t=abc', paymentRef: 'aaaa-bbbb',
    tenantRef: '448E9E45-2251-4572-B665-886C5BC7A4C8',
  }));
  assert.equal(f.cField1, 'aaaabbbb');
  assert.equal(f.cField2, '448e9e4522514572b665886c5bc7a4c8');
  assert.equal(tenantRefOf('ten-1'), 'ten1');
});

await ok('a payment whose cField2 names another tenant is a mismatch; the right one, or none (older payments), is accepted', async () => {
  const mk = () => fakeGrowRepo([pay({ tenant_id: '448e9e45-2251-4572-b665-886c5bc7a4c8' })]);
  const base = { processId: 'P1', transactionId: 'T1', sum: '250', statusCode: '2' };
  const wrong = await applyNotificationByProcess({ data: { ...base, customFields: { cField2: 'deadbeef' } } }, deps(mk().repo));
  assert.equal(wrong.status, 'mismatch');
  const right = await applyNotificationByProcess({ ...base, cField2: '448e9e4522514572b665886c5bc7a4c8' }, deps(mk().repo));
  assert.equal(right.status, 'paid');
  const nested = await applyNotificationByProcess({ data: { ...base, customFields: { cField2: '448e9e4522514572b665886c5bc7a4c8' } } }, deps(mk().repo));
  assert.equal(nested.status, 'paid');
  const none = await applyNotificationByProcess(base, deps(mk().repo));
  assert.equal(none.status, 'paid');
});

await ok('an invoice whose cField2 names another tenant is not attached; the right one is', async () => {
  const mk = () => fakeGrowRepo([pay({ receipt_id: 'rc-9', tenant_id: 'ten-1' })]);
  const f1 = mk();
  const bad = await applyInvoiceByProcess({ ...INVOICE, data: { ...INVOICE.data, customFields: { cField2: 'other' } } }, deps(f1.repo));
  assert.equal(bad.status, 'mismatch');
  assert.ok(!f1.log.some((l) => l.startsWith('doc ')));
  const f2 = mk();
  const good = await applyInvoiceByProcess({ ...INVOICE, data: { ...INVOICE.data, customFields: { cField2: 'ten1' } } }, deps(f2.repo));
  assert.equal(good.status, 'stored');
  assert.equal(findCustomField({ 'data[customFields][cField2]': 'abc' }, 'cField2'), 'abc');
  assert.equal(findCustomField({ nothing: 1 }, 'cField2'), '');
});

await ok('the address list lives in its config file with its source, and the webhook uses exactly that list', () => {
  assert.equal(GROW_IPS_CFG.length, 29);
  assert.equal(new Set(GROW_IPS_CFG).size, 29);
  assert.deepEqual([...GROW_IPS], [...GROW_IPS_CFG]);
  assert.match(GROW_IPS_SOURCE, /developers\.grow\.business\/reference\/ip-address/);
  assert.doesNotMatch(rd('lib/grow/webhook.ts'), /'3\.123\.194\.128'/); // not duplicated there
});

console.log(`${n} passed`);
