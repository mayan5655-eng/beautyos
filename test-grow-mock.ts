// Grow in MOCK mode, end to end with no network and no database: connect -> charge -> (mock payment page) -> callback -> payment
// stored -> receipt in the revenue reports -> Grow's own receipt link. Plus: forged and replayed callbacks, the feature flag, the
// production refusal of mock mode, and that no second (Morning) legal receipt can be filed for a Grow payment.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { growMode, growUiEnabled, resolveGrow, mockNotification, mockInvoice, MOCK_API_BASE } from './lib/grow/adapter.ts';
import { createCharge, applyNotification, applyNotificationByProcess, applyInvoiceByProcess, approveTransaction } from './lib/grow/service.ts';
import type { GrowRepo, GrowPayment } from './lib/grow/service.ts';
import { findInvoiceNumber, parseProcessResponse } from './lib/grow/payload.ts';
import { ipAllowed, GROW_IPS } from './lib/grow/webhook.ts';
import { monthSummary, liveReceipts } from './lib/till.ts';

let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const TENANT = '448e9e45-2251-4572-b665-886c5bc7a4c8';
const OTHER = '00000000-0000-0000-0000-000000000009';
const ORIGIN = 'https://preview.kalmea.test';

function memoryRepo() {
  const payments = new Map<string, GrowPayment & Record<string, unknown>>();
  const receipts: Record<string, unknown>[] = [];
  let seq = 0;
  const repo: GrowRepo = {
    async insertPayment(row) { const p = { id: `p${++seq}`, process_id: null, receipt_id: null, ...row } as GrowPayment & Record<string, unknown>; payments.set(p.id, p); return p; },
    async updatePayment(id, patch) { Object.assign(payments.get(id)!, patch); },
    async markPaid(id, patch) { const p = payments.get(id)!; if (p.status !== 'created') return null; Object.assign(p, patch); return p; },
    async findByToken(t) { return [...payments.values()].find((p) => p.notify_token === t) || null; },
    async findByProcessId(pid) { const m = [...payments.values()].filter((p) => p.process_id === pid); return m.length === 1 ? m[0] : null; },
    async insertReceipt(row) { receipts.push({ ...row, id: `r${receipts.length + 1}`, created_at: new Date().toISOString() }); return { id: `r${receipts.length}` }; },
    async setReceiptDocument(id, url, number) {
      const r = receipts.find((x) => x.id === id)!;
      Object.assign(r, { legal_status: 'issued', legal_provider: 'grow', legal_doc_url: url, ...(number ? { legal_doc_number: number } : {}) });
    },
  };
  return { repo, payments, receipts };
}

// ── mode, flag, production guard ─────────────────────────────────────────────
await ok('mock is the default mode; live only when asked for', () => {
  assert.equal(growMode({}), 'mock');
  assert.equal(growMode({ GROW_MODE: 'MOCK' }), 'mock');
  assert.equal(growMode({ GROW_MODE: 'live' }), 'live');
  assert.equal(growMode({ GROW_MODE: 'prod' }), 'mock', 'anything unrecognised falls back to the harmless mode');
});

await ok('the Grow screens are OFF unless GROW_UI_ENABLED is switched on', () => {
  assert.equal(growUiEnabled({}), false);
  assert.equal(growUiEnabled({ GROW_UI_ENABLED: 'false' }), false);
  assert.equal(growUiEnabled({ GROW_UI_ENABLED: 'true' }), true);
  assert.equal(growUiEnabled({ GROW_UI_ENABLED: '1' }), true);
});

await ok('mock mode needs no keys and has no network; it is refused on Vercel production', () => {
  const m = resolveGrow({}, ORIGIN);
  assert.equal(m.mode, 'mock'); assert.equal(m.configured, true); assert.equal(m.creds?.apiBase, MOCK_API_BASE); assert.ok(m.fetchImpl);
  const prod = resolveGrow({ VERCEL_ENV: 'production' }, ORIGIN);
  assert.equal(prod.configured, false); assert.equal(prod.creds, null); assert.equal(prod.fetchImpl, undefined);
  assert.equal(resolveGrow({ VERCEL_ENV: 'preview' }, ORIGIN).configured, true, 'previews can run the mock');
});

await ok('live mode: not configured without keys, real network (no fetch override) with them', () => {
  const none = resolveGrow({ GROW_MODE: 'live' }, ORIGIN);
  assert.equal(none.configured, false); assert.equal(none.creds, null);
  const live = resolveGrow({ GROW_MODE: 'live', GROW_API_KEY: 'k', GROW_PAGE_CODE: 'p' }, ORIGIN);
  assert.equal(live.configured, true); assert.equal(live.fetchImpl, undefined); assert.equal(live.creds?.apiKey, 'k');
  assert.equal(resolveGrow({ GROW_MODE: 'live', GROW_API_KEY: 'k', GROW_PAGE_CODE: 'p', GROW_ENV: 'production' }, ORIGIN).configured, false, 'live production needs the API base from Grow');
});

// ── the whole flow ──────────────────────────────────────────────────────────
const phone = '0501234567';
const start = async (m: ReturnType<typeof memoryRepo>, origin = ORIGIN) => {
  const grow = resolveGrow({}, origin);
  const deps = { repo: m.repo, creds: grow.creds!, fetchImpl: grow.fetchImpl, appUrl: origin, newToken: () => Math.random().toString(36).slice(2).padEnd(24, 'x') + Date.now().toString(36) };
  const r = await createCharge({ tenantId: TENANT, userId: 'GROWUSER1', amount: 260, description: 'טיפול פנים', clientName: 'דנה כהן', phone, clientId: 'c1' }, deps);
  return { grow, deps, r };
};

await ok('charge: a payment row is written first, the mock returns a payment page on OUR origin, nobody is charged', async () => {
  const m = memoryRepo();
  const { r } = await start(m);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.ok(r.url.startsWith(`${ORIGIN}/api/grow/mock-pay?p=mockproc`), r.url);
  const p = [...m.payments.values()][0];
  assert.equal(p.status, 'created'); assert.equal(Number(p.amount), 260); assert.ok(p.process_id);
  assert.equal(m.receipts.length, 0, 'no receipt until the callback says it was paid');
});

await ok('local development: the mock page may be plain http on localhost, nothing else', async () => {
  const m = memoryRepo();
  const { r } = await start(m, 'http://localhost:3000');
  assert.equal(r.ok, true);
  assert.equal(parseProcessResponse({ status: 1, data: { processId: 'x', url: 'http://evil.example/pay' } }).ok, false);
  assert.equal(parseProcessResponse({ status: 1, data: { processId: 'x', url: 'http://localhost:3000/pay' } }).ok, true);
});

await ok('connect -> charge -> callback -> payment stored -> receipt -> shows in the revenue report -> Grow receipt link', async () => {
  const m = memoryRepo();
  const { deps, grow } = await start(m);
  const p = [...m.payments.values()][0];
  let approved = 0;
  const approve = async (note: Parameters<typeof approveTransaction>[0]) => { approved++; await approveTransaction(note, grow.creds!, grow.fetchImpl); };

  const res = await applyNotificationByProcess(mockNotification(p, 'success'), deps, approve);
  assert.equal(res.status, 'paid');
  assert.equal(p.status, 'paid'); assert.ok(p.transaction_id); assert.ok(p.paid_at); assert.equal(approved, 1);
  assert.equal(m.receipts.length, 1);
  const rc = m.receipts[0];
  assert.equal(rc.payment_method, 'אשראי'); assert.equal(rc.amount, 260); assert.equal(rc.tenant_id, TENANT); assert.equal(rc.client_id, 'c1');
  assert.equal(rc.legal_provider, 'grow', 'marked as Grow-issued from the first moment');

  const inv = await applyInvoiceByProcess(mockInvoice(p, ORIGIN, '77001'), deps);
  assert.equal(inv.status, 'stored');
  assert.ok(String(rc.legal_doc_url).startsWith('https://'));
  assert.equal(rc.legal_doc_number, '77001'); assert.equal(rc.legal_status, 'issued');
  assert.equal(p.invoice_url, rc.legal_doc_url);

  // the existing reports read receipts: the Grow payment is in the month total, under the card method
  const now = new Date();
  const sum = monthSummary(liveReceipts(m.receipts as never[], []), now.getMonth(), now.getFullYear());
  assert.equal(sum.total, 260);
  assert.deepEqual(sum.byMethod.map((b) => [b.method, b.total]), [['אשראי', 260]]);
});

await ok('a failed card changes nothing: no receipt, no money in the reports', async () => {
  const m = memoryRepo();
  const { deps } = await start(m);
  const p = [...m.payments.values()][0];
  const res = await applyNotificationByProcess(mockNotification(p, 'fail'), deps);
  assert.equal(res.status, 'not-paid');
  assert.equal(m.receipts.length, 0); assert.equal(p.status, 'created');
});

await ok('idempotent: the same callback twice records one payment and one receipt', async () => {
  const m = memoryRepo();
  const { deps } = await start(m);
  const p = [...m.payments.values()][0];
  const note = mockNotification(p, 'success', 'tx-1');
  assert.equal((await applyNotificationByProcess(note, deps)).status, 'paid');
  assert.equal((await applyNotificationByProcess(note, deps)).status, 'already');
  assert.equal((await applyNotificationByProcess(note, deps)).status, 'already');
  assert.equal(m.receipts.length, 1);
  await applyInvoiceByProcess(mockInvoice(p, ORIGIN), deps);
  await applyInvoiceByProcess(mockInvoice(p, ORIGIN), deps);
  assert.equal(m.receipts.length, 1, 'a repeated invoice notification does not add a receipt either');
});

await ok('forged callbacks are rejected: wrong secret, wrong amount, wrong business, unknown process', async () => {
  const m = memoryRepo();
  const { deps } = await start(m);
  const p = [...m.payments.values()][0];
  assert.equal((await applyNotification(mockNotification(p, 'success'), 'not-the-secret-not-the-secret', deps)).status, 'unknown-token');
  assert.equal((await applyNotification(mockNotification(p, 'success'), '', deps)).status, 'unknown-token');
  const cheap = { ...mockNotification(p, 'success'), 'data[sum]': '1' };
  assert.equal((await applyNotificationByProcess(cheap, deps)).status, 'mismatch');
  const stolen = mockNotification({ ...p, tenant_id: OTHER }, 'success');
  assert.equal((await applyNotificationByProcess(stolen, deps)).status, 'mismatch');
  const stranger = { ...mockNotification(p, 'success'), 'data[processId]': 'mockproc-unknown' };
  assert.equal((await applyNotificationByProcess(stranger, deps)).status, 'unknown-token');
  assert.equal(m.receipts.length, 0); assert.equal(p.status, 'created');
  // with the right secret it does go through
  assert.equal((await applyNotification(mockNotification(p, 'success'), p.notify_token, deps)).status, 'paid');
});

await ok('the webhook route refuses an address that is not Grow\'s before it touches the database', () => {
  assert.equal(ipAllowed('203.0.113.9', {}), false);
  assert.equal(ipAllowed('', {}), false);
  assert.equal(ipAllowed(GROW_IPS[0], {}), true);
  const route = read('app/api/grow/webhook/route.ts');
  const guard = route.indexOf('ipAllowed(ip)');
  assert.ok(guard > 0 && guard < route.indexOf('admin()'), 'the address check runs before the service-role client is created');
});

await ok('the invoice number is read from the usual spellings, empty when absent', () => {
  assert.equal(findInvoiceNumber({ data: { documentNumber: 'A-9' } }), 'A-9');
  assert.equal(findInvoiceNumber({ data: { invoice_number: 123 } }), '123');
  assert.equal(findInvoiceNumber({ data: { url: 'https://x.test' } }), '');
});

// ── wiring (source pins) ─────────────────────────────────────────────────────
await ok('every signed-in Grow route is behind the flag; the callbacks Grow calls are not', () => {
  assert.ok(/export async function caller\(\) \{\n  const off = uiOff\(\);/.test(read('app/api/grow/_shared.ts')), 'caller() refuses first when the flag is off');
  for (const f of ['notify', 'invoice', 'webhook']) assert.ok(!/uiOff|growUiEnabled/.test(read(`app/api/grow/${f}/route.ts`)), `${f} is a callback and must always record a real payment`);
  for (const f of ['charge', 'account', 'status', 'request']) assert.ok(/caller\(\)/.test(read(`app/api/grow/${f}/route.ts`)), `${f} goes through caller()`);
  assert.ok(/mode !== 'mock' \|\| !grow\.configured/.test(read('app/api/grow/mock-pay/route.ts')), 'the mock payment page is 404 unless mock mode is allowed here');
});

await ok('the card renders nothing when the flag is off, and the cashier option needs a connected account', () => {
  const card = read('app/GrowCard.jsx');
  assert.ok(card.includes('if (!s || s.hidden) return null;'));
  assert.ok(card.includes('אין לי עדיין Grow') && card.includes('/api/grow/request') && card.includes("'DELETE'"), 'has the "no Grow yet" request and the disconnect button');
  const panel = read('app/GrowChargePanel.jsx');
  assert.ok(panel.includes('j.account?.connected && j.account.enabled') && panel.includes('wa.me/') && panel.includes("import('qrcode')"), 'cashier: only when connected, with WhatsApp and QR');
});

await ok('a Grow payment never gets a second legal receipt from Morning', () => {
  const svc = read('lib/legalReceipts/service.js');
  const a = svc.indexOf('receipt.legal_provider === "grow"');
  assert.ok(a > 0 && a < svc.indexOf('const creds = credsOf(account)'), 'issueForReceipt stops for Grow receipts before any provider call');
});

await ok('the new tables are in the trial gate, migrations only add things, and .env.example has placeholders only', () => {
  const gate = read('trial-gate-policies.sql');
  for (const t of ['grow_accounts', 'grow_payments', 'grow_signup_requests']) assert.ok(gate.includes(`'${t}'`), `${t} is gated`);
  const gateMig = read('supabase/migrations/add_grow_trial_gate.sql');
  assert.ok(gateMig.includes("'grow_accounts', 'grow_payments', 'grow_signup_requests'"));
  const sql = read('supabase/migrations/add_grow_signup_requests.sql');
  assert.ok(/revoke all on public\.grow_signup_requests from anon, authenticated/.test(sql) && /enable row level security/.test(sql));
  for (const f of ['add_grow_signup_requests', 'add_grow_trial_gate', 'add_grow_payments']) assert.ok(!/drop table|truncate|delete from/i.test(read(`supabase/migrations/${f}.sql`)), `${f} only adds`);
  const env = read('.env.example');
  assert.ok(/^GROW_MODE=mock$/m.test(env) && /^GROW_UI_ENABLED=false$/m.test(env) && /^GROW_API_KEY=$/m.test(env), 'default mock, UI off, no key');
});

console.log(`grow mock: ${n} ok`);
