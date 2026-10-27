// The wallet checkout (card, Bit, Apple Pay, Google Pay on one page /pay/<token>): credentials, the link, the session, the policy on that page
// only, the refund and the status route. Fake fetch and in-memory repos: nothing reaches Grow or a database. The real thing against Grow's
// sandbox is scripts/smoke/grow-wallet.mjs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { walletCredentials, walletAsCreds, walletLink, startWalletSession, walletLinkState, paymentMethodLabel, LINK_LIFETIME_HOURS } from './lib/grow/wallet.ts';
import type { WalletCreds } from './lib/grow/wallet.ts';
import { createCharge, applyNotification } from './lib/grow/service.ts';
import type { GrowPayment } from './lib/grow/service.ts';
import { resolveGrow } from './lib/grow/adapter.ts';
import { buildCsp, securityHeaders, GROW_WALLET_ORIGINS } from './lib/securityHeaders.ts';

let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };
const src = (p: string) => readFileSync(new URL(`./${p}`, import.meta.url), 'utf8');

const TEST = { GROW_TOKEN_USER_ID_TEST: 'u1', GROW_TOKEN_API_KEY_TEST: 'k1', GROW_WALLET_PAGE_CODE_TEST: 'wp1' };
const T1 = '11111111-1111-1111-1111-111111111111';

function memory(now = () => new Date('2026-11-01T10:00:00Z')) {
  const rows = new Map<string, GrowPayment & Record<string, unknown>>();
  let seq = 0;
  const repo = {
    async insertPayment(row: Record<string, unknown>) { const p = { id: `id${++seq}aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`, process_id: null, receipt_id: null, created_at: now().toISOString(), ...row } as GrowPayment & Record<string, unknown>; rows.set(p.id, p); return p; },
    async updatePayment(id: string, patch: Record<string, unknown>) { Object.assign(rows.get(id)!, patch); },
    async markPaid(id: string, patch: Record<string, unknown>) { const p = rows.get(id); if (!p || p.status !== 'created') return null; Object.assign(p, patch); return p; },
    async findByToken(t: string) { return [...rows.values()].find((p) => p.notify_token === t) || null; },
    async findByProcessId(pid: string) { return [...rows.values()].find((p) => p.process_id === pid) || null; },
    async insertReceipt(row: Record<string, unknown>) { receipts.push(row); return { id: `r${receipts.length}` }; },
    async setReceiptDocument() {},
  };
  const receipts: Record<string, unknown>[] = [];
  return { rows, repo, receipts, now };
}

await ok('credentials: sandbox test triple, production keys, nothing else; the wallet never invents a page code', () => {
  const s = walletCredentials(TEST)!;
  assert.equal(s.env, 'sandbox'); assert.equal(s.sdkEnv, 'DEV'); assert.equal(s.pageCode, 'wp1'); assert.equal(s.userIdOverride, 'u1'); assert.match(s.apiBase, /^https:\/\/sandbox\./);
  assert.equal(walletCredentials({ ...TEST, GROW_WALLET_PAGE_CODE_TEST: '' }), null, 'no wallet page code, no wallet');
  assert.equal(walletCredentials({ GROW_WALLET_PAGE_CODE_TEST: 'x' }), null, 'a page code alone is not enough');
  const p = walletCredentials({ GROW_ENV: 'production', GROW_API_KEY: 'pk', GROW_WALLET_PAGE_CODE: 'pw' })!;
  assert.equal(p.env, 'production'); assert.equal(p.sdkEnv, 'PRODUCTION'); assert.equal(p.userIdOverride, undefined, 'production uses each cosmetician\'s own userId'); assert.match(p.apiBase, /^https:\/\/secure\./);
  assert.equal(walletCredentials({ GROW_ENV: 'production', ...TEST }), null, 'the sandbox values never serve production');
  assert.equal(walletAsCreds(null), null);
});

await ok('the adapter offers the wallet only in live mode; mock mode and a missing page code have none', () => {
  assert.equal(resolveGrow({ GROW_MODE: 'live', ...TEST }, 'https://kalmea.app').wallet?.pageCode, 'wp1');
  assert.equal(resolveGrow({ GROW_MODE: 'live', ...TEST }, 'https://kalmea.app').configured, true);
  assert.equal(resolveGrow({ GROW_MODE: 'live' }, 'https://kalmea.app').wallet ?? null, null);
  assert.equal(resolveGrow({}, 'http://localhost:3000').wallet ?? null, null);
});

await ok('a wallet charge writes the row and returns the Kalmea link; Grow is not asked', async () => {
  const m = memory();
  let calls = 0;
  const r = await createCharge({ tenantId: T1, userId: 'u', amount: 120, description: 'טיפול פנים', clientName: 'דנה כהן', phone: '0501234567', wallet: true },
    { repo: m.repo as never, creds: { apiKey: 'k', pageCode: 'p', apiBase: 'https://x.invalid' }, appUrl: 'https://kalmea.app/', newToken: () => 'a'.repeat(48), fetchImpl: (async () => { calls++; return new Response('{}'); }) as typeof fetch });
  assert.ok(r.ok); assert.equal(r.ok && r.url, `https://kalmea.app/pay/${'a'.repeat(48)}`); assert.equal(r.ok && r.url, walletLink('https://kalmea.app', 'a'.repeat(48)));
  assert.equal(calls, 0);
  const row = [...m.rows.values()][0];
  assert.equal(row.status, 'created'); assert.equal(row.tenant_id, T1); assert.equal(row.payer_phone, '0501234567'); assert.equal(row.process_id, null);
});

function sessionDeps(m: ReturnType<typeof memory>, answer: unknown, creds: Partial<WalletCreds> = {}) {
  const sent: FormData[] = [];
  const c: WalletCreds = { apiKey: 'k1', pageCode: 'wp1', apiBase: 'https://sandbox.invalid/api', env: 'sandbox', sdkEnv: 'DEV', ...creds };
  return { sent, deps: { repo: m.repo as never, creds: c, appUrl: 'https://kalmea.app', userIdFor: (async () => 'owner-uid') as (t: string) => Promise<string | null>, now: m.now, fetchImpl: (async (_u: unknown, init?: RequestInit) => { sent.push(init!.body as FormData); return new Response(JSON.stringify(answer)); }) as typeof fetch } };
}
async function makePayment(m: ReturnType<typeof memory>, token = 'b'.repeat(48)) {
  const r = await createCharge({ tenantId: T1, userId: 'u', amount: 50, description: 'מקדמה · בקשת תשלום', clientName: 'דנה כהן', phone: '0501234567', wallet: true }, { repo: m.repo as never, creds: { apiKey: 'k', pageCode: 'p', apiBase: 'https://x.invalid' }, appUrl: 'https://kalmea.app', newToken: () => token });
  return { token, id: r.ok ? r.paymentId : '' };
}

await ok('opening the link calls createPaymentProcess NOW with the wallet page code, her userId, the callback URLs and the apiKey as a body field, and saves the process id', async () => {
  const m = memory(); const { token, id } = await makePayment(m);
  const { sent, deps } = sessionDeps(m, { status: 1, err: '', data: { processId: 4242, processToken: 'pt', authCode: 'ac%123' } });
  const s = await startWalletSession(token, deps);
  assert.ok(s.ok && s.authCode === 'ac%123' && s.processId === '4242' && s.sdkEnv === 'DEV' && s.amount === 50);
  const f = sent[0];
  assert.equal(f.get('apiKey'), 'k1'); assert.equal(f.get('pageCode'), 'wp1'); assert.equal(f.get('userId'), 'owner-uid'); assert.equal(f.get('sum'), '50.00');
  assert.equal(f.get('notifyUrl'), `https://kalmea.app/api/grow/notify?t=${token}`); assert.equal(f.get('invoiceNotifyUrl'), `https://kalmea.app/api/grow/invoice?t=${token}`);
  assert.equal(f.get('cField2'), '11111111111111111111111111111111', 'the business is in the callback, so it can be checked');
  assert.match(String(f.get('successUrl')), /^https:\/\//);
  assert.equal(m.rows.get(id)!.process_id, '4242');
  const again = await startWalletSession(token, sessionDeps(m, { status: 1, data: { processId: 4343, authCode: 'ac2' } }).deps);
  assert.ok(again.ok); assert.equal(m.rows.get(id)!.process_id, '4343', 'a reload opens a new process; the callback is matched to the last one');
});

await ok('sandbox: every call is for the one Grow test business (userIdOverride), production: only her own enabled account', async () => {
  const m = memory(); const { token } = await makePayment(m);
  const a = sessionDeps(m, { status: 1, data: { processId: 1, authCode: 'a' } }, { userIdOverride: 'TESTUSER' });
  await startWalletSession(token, a.deps); assert.equal(a.sent[0].get('userId'), 'TESTUSER');
  const b = sessionDeps(m, { status: 1, data: { processId: 1, authCode: 'a' } }); b.deps.userIdFor = async () => null;
  const r = await startWalletSession(token, b.deps);
  assert.ok(!r.ok && r.code === 'not-connected'); assert.equal(b.sent.length, 0, 'Grow is not asked for a business without an enabled account');
});

await ok('the link is closed when unknown, paid, failed or older than its lifetime; none of those ask Grow', async () => {
  const m = memory(); const { token, id } = await makePayment(m);
  const never = sessionDeps(m, { status: 1, data: { processId: 1, authCode: 'a' } });
  const r1 = await startWalletSession('c'.repeat(48), never.deps); assert.ok(!r1.ok && r1.code === 'unknown');
  const r2 = await startWalletSession('not a token', never.deps); assert.ok(!r2.ok && r2.code === 'unknown');
  m.rows.get(id)!.status = 'failed'; const r3 = await startWalletSession(token, never.deps); assert.ok(!r3.ok && r3.code === 'closed');
  m.rows.get(id)!.status = 'paid'; const r4 = await startWalletSession(token, never.deps); assert.ok(!r4.ok && r4.code === 'paid');
  m.rows.get(id)!.status = 'created';
  const late = { ...never.deps, now: () => new Date(m.now().getTime() + (LINK_LIFETIME_HOURS + 1) * 3600_000) };
  const r5 = await startWalletSession(token, late); assert.ok(!r5.ok && r5.code === 'expired');
  assert.equal((await walletLinkState(token, { repo: m.repo as never, now: late.now })).state, 'expired');
  assert.equal(never.sent.length, 0);
});

await ok('Grow answering with a url instead of an authCode (a page code that is not a wallet code) or an error is refused, not shown as a wallet', async () => {
  const m = memory(); const { token } = await makePayment(m);
  const a = await startWalletSession(token, sessionDeps(m, { status: 1, data: { processId: 9, url: 'https://pay.example/x' } }).deps);
  assert.ok(!a.ok && a.code === 'grow-refused');
  const b = await startWalletSession(token, sessionDeps(m, { status: 0, err: { message: 'nope' } }).deps);
  assert.ok(!b.ok && b.code === 'grow-refused');
  assert.equal([...m.rows.values()][0].process_id, null, 'no process id is saved for a refused session');
});

await ok('a paid wallet payment: receipt with the method Grow reported (card, Bit, Apple Pay, Google Pay), token stored for a refund, a second callback adds nothing', async () => {
  for (const [typeId, label] of [['1', 'אשראי'], ['6', 'ביט'], ['13', 'Apple Pay'], ['14', 'Google Pay'], ['', 'אשראי'], ['99', 'אשראי']] as const) {
    const m = memory(); const { token, id } = await makePayment(m, `${typeId || 'e'}${'d'.repeat(47)}`.slice(0, 48));
    m.rows.get(id)!.process_id = '777';
    const body = { 'data[processId]': '777', 'data[transactionId]': '9001', 'data[transactionToken]': 'tt-secret', 'data[sum]': '50', 'data[statusCode]': '2', 'data[transactionTypeId]': typeId, 'data[asmachta]': '5551', 'data[customFields][cField2]': '11111111111111111111111111111111' };
    const deps = { repo: m.repo as never, creds: { apiKey: 'k', pageCode: 'p', apiBase: 'https://x.invalid' }, appUrl: 'https://kalmea.app', newToken: () => 'z' };
    const r = await applyNotification(body, m.rows.get(id)!.notify_token, deps);
    assert.equal(r.status, 'paid'); assert.equal(m.receipts[0].payment_method, label); assert.equal(paymentMethodLabel(typeId), label);
    assert.equal(m.rows.get(id)!.transaction_id, '9001'); assert.equal(m.rows.get(id)!.transaction_token, 'tt-secret');
    assert.equal((await applyNotification(body, m.rows.get(id)!.notify_token, deps)).status, 'already'); assert.equal(m.receipts.length, 1);
    void token;
  }
});

await ok('the strict policy is unchanged everywhere else; Grow\'s hosts are added on the payment page only, named one by one (no https: wildcard)', () => {
  const strict = buildCsp({ dev: false, env: {} });
  assert.ok(!/meshulam|grow|creditguard|pay\.google/.test(strict), 'no Grow origin on any other page');
  assert.match(strict, /frame-src 'none'/);
  const g = buildCsp({ dev: false, env: {}, grow: true });
  for (const o of GROW_WALLET_ORIGINS) assert.ok(g.includes(o), o);
  for (const d of ['script-src', 'connect-src', 'frame-src', 'style-src', 'font-src']) assert.ok(!new RegExp(`${d}[^;]*(^| )https:( |$)`).test(g), `${d}: no bare https: source`);
  assert.ok(!/default-src[^;]*https/.test(g), 'default-src stays self');
  assert.match(g, /frame-ancestors 'none'/); assert.match(g, /object-src 'none'/); assert.match(g, /base-uri 'self'/);
  const h = Object.fromEntries(securityHeaders({ dev: false, grow: true }).map((x) => [x.key, x.value]));
  assert.match(h['Permissions-Policy'], /payment=\(self "https:\/\/pay\.google\.com"\)/);
  assert.match(Object.fromEntries(securityHeaders({ dev: false }).map((x) => [x.key, x.value]))['Permissions-Policy'], /payment=\(\)/);
  const cfg = src('next.config.ts');
  assert.match(cfg, /source: "\/pay\/:token\*",\s*headers: securityHeaders\(\{ dev: process\.env\.NODE_ENV !== "production", grow: true \}\)/);
  assert.ok(cfg.indexOf('source: "/:path*"') < cfg.indexOf('source: "/pay/:token*"'), 'the page rule comes after the global one, so it overrides');
});

await ok('wiring: public page, tenant-scoped refund, notify approves with the wallet page code, status offers the wallet, nothing deleted', () => {
  assert.match(src('lib/supabase/middleware.ts'), /'\/pay',/);
  const refund = src('app/api/grow/refund/route.ts');
  assert.ok(/\.eq\('id', paymentId\)\.eq\('tenant_id', c\.tenantId\)/.test(refund), 'the payment is looked up by id AND her tenant');
  assert.ok(/status !== 'paid'/.test(refund) && /\^מקדמה/.test(refund), 'only paid, never a deposit');
  assert.ok(!/delete\(/.test(refund), 'nothing is deleted');
  for (const f of ['app/api/grow/notify/route.ts', 'app/api/grow/webhook/route.ts']) assert.ok(/approveCredsFor\(p, grow\)/.test(src(f)), `${f}: approved with the page the payment was opened on`);
  assert.ok(/wallet: !!grow\.wallet/.test(src('app/api/grow/charge/route.ts')) && /wallet: !!grow\.wallet/.test(src('app/api/grow/payment-request/route.ts')));
  assert.ok(/methods: grow\.wallet \? \['wallet'\]/.test(src('app/api/grow/status/route.ts')));
  const wr = src('app/api/grow/wallet/route.ts');
  assert.ok(/growUiEnabled\(process\.env, found\.payment\.tenant_id\)/.test(wr) && /growUiEnabled\(process\.env, payment\.tenant_id\)/.test(wr), 'off for a business that is not enabled');
  assert.ok(!/tenant_id.*body|body.*tenant/i.test(wr), 'the business comes from the payment, never from the browser');
  const page = src('app/pay/[token]/PayClient.jsx');
  assert.ok(/state === 'paid'[\s\S]*setPhase\('paid'\)/.test(page) && !/onSuccess: \(\) => setPhase\('paid'\)/.test(page), 'thanks only after our own record says paid');
  assert.match(src('app/pay/[token]/page.tsx'), /index: false/);
});

await ok('the migration adds a status and one server-only column, no table, and the gate is untouched', () => {
  const sql = src('supabase/migrations/add_grow_wallet.sql').split(/\r?\n/).filter((l) => !/^\s*--/.test(l)).join(' ');
  assert.ok(/add column if not exists transaction_token text/.test(sql) && /'refunded'/.test(sql));
  assert.ok(!/create table/i.test(sql) && !/drop table/i.test(sql) && !/grant\s/i.test(sql), 'no table, nothing granted to the browser');
  assert.ok(/markPaid/.test(src('lib/grow/repo.ts')) && /transaction_token/.test(src('lib/grow/repo.ts')), 'recording a payment still works before the migration runs');
});

console.log(`grow wallet: ${n} ok`);
