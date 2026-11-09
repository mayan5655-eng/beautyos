// Grow ops for the platform admin (2026-11-09):
//   1. attaching an UNMATCHED Grow onboarding update to a business by hand (/api/admin/grow-onboarding), through the webhook's own
//      attach code (lib/grow/webhook.ts attachOnboardingToTenant), admin-only, rate-limited, logged to ops_events;
//   2. grow_payments.origin: which page opened a Grow payment, stored when the column exists, inferred when it does not, and shown in
//      the till's Grow panel.
// Fake repos and a fake database only: nothing here reaches Grow or Supabase.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { applyOnboarding, attachOnboardingToTenant, adminAttachOnboarding, onboardingFromRow, readOnboarding } from './lib/grow/webhook.ts';
import type { AdminAttachRepo, StoredOnboardingRow, MatchState } from './lib/grow/webhook.ts';
import { toAttachRow, searchTenants } from './lib/grow/adminOnboarding.ts';
import { RATE_POLICIES } from './lib/rateLimit.ts';
import { createCharge } from './lib/grow/service.ts';
import type { GrowRepo, GrowPayment } from './lib/grow/service.ts';
import { supabaseGrowRepo } from './lib/grow/repo.ts';
import { paymentOriginOf, originLabelHe, PAYMENT_ORIGINS, ORIGIN_HE, isPaymentOrigin, VOUCHER_PREFIX, BOOKING_VISIT_PREFIX } from './lib/grow/paymentOrigin.ts';
import { VOUCHER_SERVICE_PREFIX } from './lib/giftVouchers.ts';
import { requestDescription } from './lib/grow/paymentRequest.ts';

const rd = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n');
let passed = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); passed++; console.log('ok -', name); };

// ── fake onboarding repo ───────────────────────────────────────────────────
function fakeRepo(rows: StoredOnboardingRow[], opts: { pending?: Record<string, string>; accounts?: Record<string, { user_id: string; enabled: boolean }> } = {}) {
  const log: string[] = [];
  const accounts = { ...(opts.accounts || {}) };
  const repo: AdminAttachRepo = {
    async getUpdate(id) { return rows.find((r) => r.id === id) || null; },
    async insertUpdate(row) { const id = `u${rows.length + 1}`; rows.push({ id, matched_tenant_id: null, ...(row as object) } as StoredOnboardingRow); log.push('insert'); return id; },
    async findPendingByTrackingCode(code) { const t = opts.pending?.[code]; return t ? { tenant_id: t } : null; },
    async getAccount(t) { return accounts[t] || null; },
    async saveAccount(t, userId, enabled) { accounts[t] = { user_id: userId, enabled }; log.push(`save:${t}:${userId}:${enabled}`); },
    async setMatch(id, state: MatchState, t) { const r = rows.find((x) => x.id === id); if (r) { r.match_state = state; r.matched_tenant_id = t; } log.push(`match:${id}:${state}:${t}`); },
    async clearPending(t) { log.push(`clear:${t}`); },
    async setPendingStatus(t, s) { log.push(`status:${t}:${s}`); },
    async saveApiKey(t) { log.push(`key:${t}`); },
    async ensurePending(t, code) { log.push(`pending:${t}:${code}`); },
  };
  return { repo, log, accounts };
}

const row = (over: Partial<StoredOnboardingRow> = {}): StoredOnboardingRow => ({
  id: '11111111-1111-4111-8111-111111111111', user_id: 'u8f3a91c2', tracking_code: null, business_title: 'סטודיו דנה', name: 'דנה',
  package_id: '12', package_name: 'Platform', tracking_status_id: '3', tracking_status_message: '', grow_status: '1', grow_error: null,
  had_api_key: true, match_state: 'unmatched', matched_tenant_id: null, ...over,
});
const T = '22222222-2222-4222-8222-222222222222';

// ── 1. admin attach ──────────────────────────────────────────────────────────
await ok('attach of an approved unmatched update connects her business, exactly like a webhook match (no key: none is stored)', async () => {
  const { repo, log, accounts } = fakeRepo([row()]);
  const r = await adminAttachOnboarding(row().id, T, repo);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.result.status, 'matched');
  assert.equal(r.result.registration, 'approved');
  assert.deepEqual(accounts[T], { user_id: 'u8f3a91c2', enabled: true });
  assert.deepEqual(log, [`pending:${T}:admin-${row().id}`, `save:${T}:u8f3a91c2:true`, `status:${T}:approved`, `match:${row().id}:matched:${T}`, `clear:${T}`]);
  assert.ok(!log.some((l) => l.startsWith('key:')), 'the admin path never stores a key');
});

await ok('the same writes as the webhook path for the same update', async () => {
  const raw = { err: '', status: 1, data: { user_id: 'u8f3a91c2', tracking_code: 'TRK-9', business_title: 'סטודיו דנה', tracking_status: { id: 3, message: '' } } };
  const viaHook = fakeRepo([], { pending: { 'TRK-9': T } });
  await applyOnboarding(readOnboarding(raw)!, viaHook.repo);
  const viaAdmin = fakeRepo([row({ id: 'u1', tracking_code: 'TRK-9' })]);
  await adminAttachOnboarding('u1', T, viaAdmin.repo);
  // The admin path first makes sure her pending row exists (the webhook matched one, so it has it); the rest is identical.
  assert.deepEqual(viaAdmin.log[0], `pending:${T}:TRK-9`);
  assert.deepEqual(viaHook.log.filter((l) => l !== 'insert'), viaAdmin.log.slice(1));
});

await ok('an update without a business id attaches its status only, and switches nothing on', async () => {
  const { repo, log, accounts } = fakeRepo([row({ user_id: null, tracking_status_message: 'ממתין לאישור' })]);
  const r = await adminAttachOnboarding(row().id, T, repo);
  assert.ok(r.ok && r.result.status === 'matched' && r.result.registration === 'waiting');
  assert.equal(accounts[T], undefined);
  assert.deepEqual(log, [`pending:${T}:admin-${row().id}`, `status:${T}:waiting`, `match:${row().id}:matched:${T}`], 'her card gets a pending row first, so the waiting status lands');
});

await ok('a rejected update attaches as rejected', async () => {
  const { repo, accounts } = fakeRepo([row({ user_id: null, tracking_status_message: 'הבקשה נדחתה' })]);
  const r = await adminAttachOnboarding(row().id, T, repo);
  assert.ok(r.ok && r.result.registration === 'rejected');
  assert.equal(accounts[T], undefined);
});

await ok('a business already on a different Grow account is a conflict and keeps its connection', async () => {
  const { repo, accounts } = fakeRepo([row()], { accounts: { [T]: { user_id: 'other999', enabled: true } } });
  const r = await adminAttachOnboarding(row().id, T, repo);
  assert.ok(r.ok && r.result.status === 'conflict');
  assert.deepEqual(accounts[T], { user_id: 'other999', enabled: true });
});

await ok('only an unmatched update can be attached; an unknown id is not found', async () => {
  const { repo, log } = fakeRepo([row({ match_state: 'matched' }), row({ id: 'c', match_state: 'conflict' })]);
  assert.deepEqual(await adminAttachOnboarding(row().id, T, repo), { ok: false, code: 'not-unmatched' });
  assert.deepEqual(await adminAttachOnboarding('c', T, repo), { ok: false, code: 'not-unmatched' });
  assert.deepEqual(await adminAttachOnboarding('nope', T, repo), { ok: false, code: 'not-found' });
  assert.deepEqual(log, []);
});

await ok('a stored row goes back through the same bounds as a live update', () => {
  const u = onboardingFromRow(row({ user_id: 'bad id with spaces', business_title: '<b>x</b>', had_api_key: null }));
  assert.equal(u.userId, null);
  assert.ok(!/[<>]/.test(u.businessTitle));
  assert.equal(u.hadApiKey, false);
});

await ok('the webhook and the admin route share ONE attach path', () => {
  const src = rd('lib/grow/webhook.ts');
  assert.ok(src.includes('return attachOnboardingToTenant(updateId, u, pending.tenant_id, repo, sealApiKey);'));
  assert.equal(src.match(/repo\.saveAccount\(/g)?.length, 1, 'saveAccount is written in one place only');
  assert.equal(typeof attachOnboardingToTenant, 'function');
  const route = rd('app/api/admin/grow-onboarding/route.ts');
  assert.ok(route.includes('adminAttachOnboarding('));
  assert.ok(!/saveAccount|grow_accounts/.test(route), 'the route never writes the account itself');
});

await ok('the admin route: admin first (404), rate-limited, demo refused, every outcome logged to ops_events', () => {
  const route = rd('app/api/admin/grow-onboarding/route.ts');
  const body = route.slice(route.indexOf('export async function POST'));
  const first = body.indexOf('requirePlatformAdmin()');
  assert.ok(first > 0 && first < body.indexOf('request.json'), 'admin check before reading the body');
  assert.ok(first < body.indexOf("checkIpLimit(request, 'admin-grow-attach')"));
  assert.ok(body.includes("checkTenantLimit(adminCheck.userId, 'admin-grow-attach')"));
  assert.ok(body.includes('if (!adminCheck.ok) return notFound()'));
  assert.ok(body.includes('isDemoTenantId(tenantId)'));
  assert.ok(body.includes("source: 'grow:onboarding-attached'"));
  assert.ok((body.match(/await log\(/g) || []).length >= 3, 'not-found / already, success and failure all logged');
  assert.ok(!/user_id|api_key|business_title/.test(body.slice(body.indexOf('const log'))), 'the log carries ids and outcome only');
  assert.ok(RATE_POLICIES['admin-grow-attach'].perTenant.limit > 0);
});

await ok('the webhook names the stored update in its ops_events line, so the admin can find it', () => {
  const w = rd('app/api/grow/webhook/route.ts');
  assert.ok(w.includes('updateId: r.updateId'));
});

await ok('the panel shows the business id masked, never raw, and no key', () => {
  const a = toAttachRow({ id: 'x', received_at: '2026-11-09T10:00:00Z', user_id: 'u8f3a91c2', tracking_code: null, business_title: 'סטודיו', name: null, package_name: null, tracking_status_message: null, grow_status: '1', grow_error: null, had_api_key: true });
  assert.ok(!JSON.stringify(a).includes('u8f3a91c2'));
  assert.ok(a.businessCode.length > 0);
  assert.equal(a.hadKey, true);
  assert.ok(a.receivedAt.length > 0);
  const ui = rd('app/dashboard/admin/GrowUnmatched.tsx');
  assert.ok(ui.includes(".eq('match_state', 'unmatched')"));
  assert.ok(!/api_key[^_]/.test(ui.replace(/had_api_key/g, '')), 'no api_key column is read');
  assert.ok(rd('app/dashboard/admin/page.tsx').includes('<GrowUnmatched db={db} />'));
  assert.ok(rd('app/dashboard/admin/GrowAttach.tsx').includes("fetch('/api/admin/grow-onboarding'"));
});

await ok('tenant search: by name or id prefix, empty finds nothing, capped', () => {
  const ts = Array.from({ length: 20 }, (_, i) => ({ id: `${i}aaa-id`, name: `סטודיו ${i}` }));
  assert.deepEqual(searchTenants(ts, ''), []);
  assert.equal(searchTenants(ts, 'סטודיו').length, 8);
  assert.deepEqual(searchTenants(ts, '19aaa').map((t) => t.id), ['19aaa-id']);
  assert.deepEqual(searchTenants([{ id: 'a', name: 'Dana Studio' }], 'dana').length, 1);
});

// ── 2. payment origin ────────────────────────────────────────────────────────
function memRepo() {
  const inserted: Record<string, unknown>[] = [];
  const repo = {
    async insertPayment(r: Record<string, unknown>) { inserted.push(r); return { id: 'p1', notify_token: 'tok-aaaaaaaaaaaaaaaaaaaa', ...r } as unknown as GrowPayment; },
  } as unknown as GrowRepo;
  return { repo, inserted };
}
const chargeDeps = (repo: GrowRepo) => ({ repo, creds: { apiKey: '', pageCode: '', apiBase: 'https://grow.invalid' }, appUrl: 'https://kalmea.test', newToken: () => 'tok-aaaaaaaaaaaaaaaaaaaa', fetchImpl: (() => { throw new Error('no network in tests'); }) as unknown as typeof fetch });

await ok('createCharge stores the origin it is given, and never an unknown one', async () => {
  const a = memRepo();
  const r = await createCharge({ tenantId: 't', userId: 'u1234', amount: 100, description: 'פנים', clientName: 'דנה', phone: '0501234567', wallet: true, origin: 'till' }, chargeDeps(a.repo));
  assert.equal(r.ok, true);
  assert.equal(a.inserted[0].origin, 'till');
  const b = memRepo();
  await createCharge({ tenantId: 't', userId: 'u1234', amount: 100, description: 'פנים', clientName: 'דנה', phone: '0501234567', wallet: true, origin: 'evil' as never }, chargeDeps(b.repo));
  assert.equal('origin' in b.inserted[0], false);
  const c = memRepo();
  await createCharge({ tenantId: 't', userId: 'u1234', amount: 100, description: 'פנים', clientName: 'דנה', phone: '0501234567', wallet: true }, chargeDeps(c.repo));
  assert.equal('origin' in c.inserted[0], false);
});

// A fake supabase client for grow_payments inserts: refuses the columns in `missing` the way PostgREST does.
function fakeDb(missing: string[], other?: { code: string; message: string }) {
  const tries: Record<string, unknown>[] = [];
  const db = {
    from() {
      return {
        insert(r: Record<string, unknown>) {
          tries.push(r);
          return { select() { return { async single() {
            if (other) return { data: null, error: other };
            const bad = missing.find((c) => c in r);
            if (bad) return { data: null, error: { code: 'PGRST204', message: `Could not find the '${bad}' column of 'grow_payments' in the schema cache` } };
            return { data: { id: 'p1', ...r }, error: null };
          } }; } };
        },
      };
    },
  };
  return { db, tries };
}

await ok('before the migration runs the payment is still created, dropping only origin', async () => {
  const { db, tries } = fakeDb(['origin']);
  const p = await supabaseGrowRepo(db as never).insertPayment({ tenant_id: 't', amount: 5, origin: 'till', loyalty_redemption: { reward: 'x' } });
  assert.equal(p.id, 'p1');
  assert.equal(tries.length, 2);
  assert.equal('origin' in tries[1], false);
  assert.equal('loyalty_redemption' in tries[1], true, 'the loyalty intent is kept when only origin is missing');
});

await ok('with both optional columns missing, both are dropped; a non-column error still throws', async () => {
  const both = fakeDb(['origin', 'loyalty_redemption']);
  await supabaseGrowRepo(both.db as never).insertPayment({ tenant_id: 't', amount: 5, origin: 'till', loyalty_redemption: { reward: 'x' } });
  assert.deepEqual(Object.keys(both.tries[both.tries.length - 1]).sort(), ['amount', 'tenant_id']);
  const nn = fakeDb([], { code: '23502', message: 'null value in column "amount" violates not-null constraint' });
  await assert.rejects(() => supabaseGrowRepo(nn.db as never).insertPayment({ tenant_id: 't', origin: 'till' }));
  assert.equal(nn.tries.length, 1);
  const req = fakeDb(['amount']);
  await assert.rejects(() => supabaseGrowRepo(req.db as never).insertPayment({ tenant_id: 't', amount: 5, origin: 'till' }), 'a required column is never dropped');
  assert.equal(req.tries.length, 1, 'and origin is not dropped in its place');
});

await ok('every page that opens a Grow payment names its origin', () => {
  assert.ok(rd('app/api/grow/charge/route.ts').includes("origin: 'till'"));
  assert.ok(rd('app/api/grow/booking-pay/route.ts').includes("origin: 'booking_visit'"));
  assert.ok(rd('app/api/grow/payment-request/route.ts').includes("origin: 'client_link'"));
  assert.ok(rd('app/api/vouchers/buy/route.ts').includes("origin: 'gift_voucher'"));
  const cf = rd('lib/grow/cancelFees.ts');
  assert.equal((cf.match(/'owner_deposit' : 'booking_deposit'/g) || []).length, 2, 'first deposit page and a fresh one');
  assert.ok(cf.includes("kind: 'fee', origin: 'cancel_fee'"));
  for (const o of PAYMENT_ORIGINS) assert.ok(ORIGIN_HE[o] && !/[—–]/.test(ORIGIN_HE[o]), o);
});

await ok('a payment without a stored origin is inferred from kind and description', () => {
  assert.equal(VOUCHER_PREFIX, VOUCHER_SERVICE_PREFIX);
  assert.ok(rd('app/api/grow/booking-pay/route.ts').includes(`description: \`${BOOKING_VISIT_PREFIX} · `));
  assert.equal(paymentOriginOf({ origin: 'owner_deposit', kind: 'deposit' }), 'owner_deposit');
  assert.equal(paymentOriginOf({ description: 'שובר מתנה   טיפול פנים', kind: 'charge' }), 'gift_voucher');
  assert.equal(paymentOriginOf({ description: requestDescription('deposit', 'יום חמישי').replace(/·/g, ' '), kind: 'deposit' }), 'client_link');
  assert.equal(paymentOriginOf({ description: 'תשלום על תור   פנים', kind: 'charge' }), 'booking_visit');
  assert.equal(paymentOriginOf({ description: 'אי הגעה', kind: 'fee' }), 'cancel_fee');
  assert.equal(paymentOriginOf({ description: 'מקדמה לפנים', kind: 'deposit' }), 'deposit');
  assert.equal(paymentOriginOf({ description: 'פנים', kind: 'charge' }), 'till');
  assert.equal(paymentOriginOf({ description: 'פנים' }), null);
  assert.equal(paymentOriginOf({ origin: 'nonsense', description: 'פנים' }), null);
  assert.equal(originLabelHe({ description: 'מקדמה לפנים', kind: 'deposit' }), 'מקדמה');
  assert.equal(originLabelHe({ origin: 'till' }), 'קישור מהקופה');
  assert.equal(originLabelHe({}), '');
  assert.equal(isPaymentOrigin('till'), true);
});

await ok('the status route reads origin, and loads without it', () => {
  const s = rd('app/api/grow/status/route.ts');
  assert.ok(s.includes('read(`${COLS}, kind, origin`)'));
  assert.ok(s.includes('isMissingColumnError(pay.error)) pay = await read(`${COLS}, kind`)'));
});

await ok("the till's Grow panel and the settings card show the origin", () => {
  const till = rd('app/GrowPaymentRequests.jsx');
  assert.ok(till.includes('originLabelHe(p)') && till.includes('data-testid="grow-recent"'));
  assert.ok(rd('app/GrowCard.jsx').includes('originLabelHe(p)'));
});

await ok('the migration exists, adds one nullable column, no check constraint, nothing dropped', () => {
  const p = 'supabase/migrations/add_grow_payment_origin_2026-11-09.sql';
  assert.ok(existsSync(p));
  const sql = rd(p).split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert.ok(sql.includes('alter table public.grow_payments add column if not exists origin text;'));
  assert.ok(!/\bdrop\b|\bdelete\b|check\s*\(/i.test(sql));
});

await ok('no em dashes in the new copy', () => {
  for (const f of ['app/dashboard/admin/GrowUnmatched.tsx', 'app/dashboard/admin/GrowAttach.tsx', 'app/api/admin/grow-onboarding/route.ts', 'lib/grow/paymentOrigin.ts', 'lib/grow/adminOnboarding.ts']) {
    assert.ok(!rd(f).includes('—'), f);
  }
});

await ok('the supabase ensurePending: keeps an existing row, inserts one otherwise, and falls back to the admin code on a taken tracking code', async () => {
  const calls: string[] = [];
  const mk = (have: boolean, firstInsertDup: boolean) => {
    let inserts = 0;
    return { from() {
      const q: Record<string, unknown> = {};
      q.select = () => q; q.eq = () => q;
      q.maybeSingle = async () => ({ data: have ? { tenant_id: T } : null, error: null });
      q.insert = async (row: { tracking_code: string }) => { inserts++; calls.push(`insert:${row.tracking_code}`); return inserts === 1 && firstInsertDup ? { error: { code: '23505', message: 'duplicate key' } } : { error: null }; };
      return q;
    } };
  };
  const { supabaseOnboardingRepo } = await import('./lib/grow/onboardingRepo.ts');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await supabaseOnboardingRepo(mk(true, false) as any).ensurePending!(T, 'TRK-1', 'admin-x');
  assert.deepEqual(calls, [], 'an existing pending row is never replaced');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await supabaseOnboardingRepo(mk(false, false) as any).ensurePending!(T, 'TRK-1', 'admin-x');
  assert.deepEqual(calls, ['insert:TRK-1']);
  calls.length = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await supabaseOnboardingRepo(mk(false, true) as any).ensurePending!(T, 'TRK-1', 'admin-x');
  assert.deepEqual(calls, ['insert:TRK-1', 'insert:admin-x']);
});

console.log(`test-grow-ops-admin: passed ${passed} failed 0`);
