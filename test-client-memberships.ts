// test-client-memberships.ts
//
// Client memberships ("מנויים ללקוחות", lib/memberships.ts) end to end, with an in-memory database that enforces the same unique indexes as
// supabase/migrations/add_client_memberships_2026-11-11.sql and the mock Grow operations (no network, no money):
//   - a month is charged once, whatever runs twice (the period row is the lock), with a fresh ledger-first identifier per attempt
//   - a failed charge is retried 1, 3 and 5 days after the first failure, then the membership is paused; a final card error pauses at once
//   - an ambiguous Grow answer is never charged again by itself; a charge cut off mid-way becomes "check in Grow"
//   - credits: granted per paid month, one per receipt, never two devices on one credit, rollover for one month only
//   - the consent words are frozen; the client cancels only after the minimum months; she and the owner see the right things
//   - flag off: nothing renders and every route is a 404; Grow not connected: hidden and nothing charged; one business never sees another's
//   - no message is ever sent to a client
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  sanitizePlan, consentTextHe, createEnrollment, startCardPage, onMembershipCardToken, saveMembershipCard, chargeMembership, runDueMemberships,
  creditsOf, redeemCredit, ownerAction, clientCancel, clientCancelFrom, dashboardOf, membershipsReady, nextPeriodStart, addDays, israelDay,
  membershipRef, isMembershipRef, planLineHe, MAX_ATTEMPTS, MEMBERSHIP_CONSENT_VERSION, STATUS_HE,
} from './lib/memberships.ts';
import type { Membership, MembershipDeps, MembershipRepo, Period, Plan, PlanFields, Redemption, StoredToken } from './lib/memberships.ts';
import { clientMembershipsEnabled, MEMBERSHIP_PAYMENT } from './lib/membershipFlag.ts';
import { createMockOps, newMockCardToken } from './lib/grow/ops.ts';
import type { GrowOps } from './lib/grow/ops.ts';
import type { LedgerRow } from './lib/grow/tokenCharge.ts';
import type { GrowPayment, GrowRepo } from './lib/grow/service.ts';
import { resolveGrow } from './lib/grow/adapter.ts';
import { paymentOriginOf, originLabelHe } from './lib/grow/paymentOrigin.ts';
import { tillTabsOf } from './lib/tillTabs.ts';
import { growText } from './lib/grow/payload.ts';

let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const T1 = '11111111-1111-1111-1111-111111111111';
const T2 = '22222222-2222-2222-2222-222222222222';
const C1 = 'c-1';
const C2 = 'c-2';

// ── an in-memory database with the migration's unique indexes ───────────────
type World = ReturnType<typeof makeWorld>;
function makeWorld() {
  let seq = 0;
  const id = (p: string) => `${p}-${++seq}-${'0'.repeat(4)}`;
  const uuid = () => { seq++; const h = seq.toString(16).padStart(12, '0'); return `aaaaaaaa-bbbb-4ccc-8ddd-${h}`; };
  const accounts = new Map<string, { user_id: string; enabled: boolean }>([[T1, { user_id: 'grow-user-1', enabled: true }], [T2, { user_id: 'grow-user-2', enabled: true }]]);
  const clients = [
    { tenant_id: T1, id: C1, name: 'דנה כהן', phone: '0501234567' },
    { tenant_id: T1, id: C2, name: 'מיכל לוי', phone: '0521234567' },
    { tenant_id: T2, id: 'c-9', name: 'נועה', phone: '0531234567' },
  ];
  const plans: Plan[] = [];
  const memberships: Membership[] = [];
  const periods: Period[] = [];
  const redemptions: Redemption[] = [];
  const tokens: (StoredToken & { appointment_id: string; card_last4: string | null })[] = [];
  const ledger: LedgerRow[] = [];
  const payments: (GrowPayment & Record<string, unknown>)[] = [];
  const receipts: Record<string, unknown>[] = [];
  const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
  const repo: MembershipRepo = {
    async getAccount(t) { return accounts.get(t) || null; },
    async businessName(t) { return t === T1 ? 'סטודיו דנה' : 'העסק של נועה'; },
    async listPlans(t) { return plans.filter((p) => p.tenant_id === t).map(clone); },
    async getPlan(t, pid) { const p = plans.find((x) => x.id === pid && x.tenant_id === t); return p ? clone(p) : null; },
    async insertPlan(row) { const p = { ...row, id: uuid() } as Plan; plans.push(p); return clone(p); },
    async updatePlan(t, pid, patch) { const p = plans.find((x) => x.id === pid && x.tenant_id === t); if (!p) return null; Object.assign(p, patch); return clone(p); },
    async getClient(t, cid) { const c = clients.find((x) => x.tenant_id === t && x.id === cid); return c ? { id: c.id, name: c.name, phone: c.phone } : null; },
    async insertMembership(row) {
      if (row.status !== 'cancelled' && memberships.some((m) => m.tenant_id === row.tenant_id && m.client_id === row.client_id && m.status !== 'cancelled')) throw new Error('duplicate key value violates unique constraint "client_memberships_one_live_uniq"');
      const m = { ...clone(row), id: uuid() } as Membership; memberships.push(m); return clone(m);
    },
    async getMembership(t, mid) { const m = memberships.find((x) => x.id === mid && x.tenant_id === t); return m ? clone(m) : null; },
    async findMembershipByLink(l) { const m = memberships.filter((x) => x.link_id === l); return m.length === 1 ? clone(m[0]) : null; },
    async findMembershipByProcess(pid) { const m = memberships.filter((x) => x.process_id === pid); return m.length === 1 ? clone(m[0]) : null; },
    async listMemberships(t, f = {}) { return memberships.filter((m) => m.tenant_id === t && (!f.clientId || m.client_id === f.clientId) && (!f.statuses || f.statuses.includes(m.status))).map(clone); },
    async updateMembership(t, mid, patch, from) {
      const m = memberships.find((x) => x.id === mid && x.tenant_id === t);
      if (!m || (from && !from.includes(m.status))) return null;
      // the database trigger: the consent and the plan are frozen once she agreed
      if (m.consented_at && ((patch.consent_text !== undefined && patch.consent_text !== m.consent_text) || (patch.consented_at !== undefined && patch.consented_at !== m.consented_at) || patch.plan !== undefined)) throw new Error('client_memberships: the consent and the plan are frozen once the client agreed');
      Object.assign(m, clone(patch)); return clone(m);
    },
    async listDue(today) { return memberships.filter((m) => (m.status === 'active' && m.next_charge_on && m.next_charge_on <= today) || (m.status === 'past_due' && m.next_retry_on && m.next_retry_on <= today)).map(clone); },
    async listStaleCharging(before) { return periods.filter((p) => p.status === 'charging' && String(p.updated_at) < before).map(clone); },
    async insertPeriod(row) {
      if (periods.some((p) => p.membership_id === row.membership_id && p.period_start === row.period_start)) return null;
      const p = { ...clone(row), id: uuid(), updated_at: new Date(now()).toISOString() } as Period; periods.push(p); return clone(p);
    },
    async getPeriodByStart(t, mid, start) { const p = periods.find((x) => x.tenant_id === t && x.membership_id === mid && x.period_start === start); return p ? clone(p) : null; },
    async transitionPeriod(t, pid, from, patch, expect) {
      const p = periods.find((x) => x.id === pid && x.tenant_id === t);
      if (!p || !from.includes(p.status) || (expect !== undefined && p.attempts !== expect)) return null;
      Object.assign(p, clone(patch), { updated_at: new Date(now()).toISOString() }); return clone(p);
    },
    async listPeriods(t, ids) { return periods.filter((p) => p.tenant_id === t && ids.includes(p.membership_id)).map(clone); },
    async listRedemptions(t, ids) { return redemptions.filter((r) => r.tenant_id === t && ids.includes(r.membership_id)).map(clone); },
    async insertRedemption(row) {
      if (redemptions.some((r) => r.receipt_id === row.receipt_id)) return { row: null, conflict: 'receipt' };
      if (redemptions.some((r) => r.period_id === row.period_id && r.seq === row.seq)) return { row: null, conflict: 'seq' };
      const r = { ...clone(row), id: uuid() } as Redemption; redemptions.push(r); return { row: clone(r), conflict: null };
    },
    async findRedemptionByReceipt(t, rid) { const r = redemptions.find((x) => x.tenant_id === t && x.receipt_id === rid); return r ? clone(r) : null; },
    async insertToken(row) { const tk = { ...clone(row), id: uuid() }; tokens.push(tk as never); return { id: tk.id }; },
    async getToken(t, tid) { const tk = tokens.find((x) => x.id === tid && x.tenant_id === t); return tk ? clone(tk) : null; },
    async insertCharge(row) {
      if (ledger.some((l) => l.unique_identifier === row.unique_identifier)) return null;
      const l = { ...clone(row), id: id('ch'), status: 'initiated', grow_error_id: null, error: null, transaction_id: null, transaction_token: null, asmachta: null, looked_up: false } as LedgerRow;
      ledger.push(l); return clone(l);
    },
    async updateCharge(cid, patch) { const l = ledger.find((x) => x.id === cid); if (l) Object.assign(l, clone(patch)); },
  };
  const grow: GrowRepo = {
    async insertPayment(row) { const p = { ...clone(row), id: id('pay') } as GrowPayment & Record<string, unknown>; payments.push(p); return clone(p); },
    async updatePayment(pid, patch) { const p = payments.find((x) => x.id === pid); if (p) Object.assign(p, clone(patch)); },
    async markPaid(pid, patch) { const p = payments.find((x) => x.id === pid && x.status === 'created'); if (!p) return null; Object.assign(p, clone(patch)); return clone(p); },
    async findByToken() { return null; },
    async insertReceipt(row) { const r = { ...clone(row), id: id('rc') }; receipts.push(r); return { id: String(r.id) }; },
    async setReceiptDocument() {},
  };
  let clockMs = Date.parse('2026-11-11T08:00:00Z');
  const now = () => clockMs;
  const notices: { tenantId: string; title: string; body: string }[] = [];
  const sealed: string[] = [];
  const deps = (ops: GrowOps, extra: Partial<MembershipDeps> = {}): MembershipDeps => {
    let ids = 100000000 + Math.floor(Math.random() * 1000);
    return {
      repo, grow, ops,
      seal: { encrypt: (s) => { sealed.push(s); return `sealed:${Buffer.from(s).toString('base64')}`; }, decrypt: (s) => Buffer.from(s.replace(/^sealed:/, ''), 'base64').toString() },
      notifyUrl: 'https://kalmea.test/api/grow/webhook',
      newToken: () => [...Array(48)].map(() => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join(''),
      newChargeId: () => ++ids,
      notify: async (x) => { notices.push(x); },
      now: () => new Date(clockMs),
      ...extra,
    };
  };
  return {
    repo, grow, accounts, clients, plans, memberships, periods, redemptions, tokens, ledger, payments, receipts, notices, sealed, deps,
    setDay: (ymd: string) => { clockMs = Date.parse(`${ymd}T08:00:00Z`); },
    advanceMs: (ms: number) => { clockMs += ms; },
  };
}

const mockOps = () => createMockOps('https://kalmea.test', (t, a) => `${t}.${a}`);

/** Grow answering a non-final refusal while `failing()` is true, else the mock. */
const flakyOps = (failing: () => boolean): GrowOps => {
  const base = mockOps();
  return { ...base, async chargeToken(i) { if (failing()) return { ok: false, code: 'declined', error: 'insufficient funds', errId: 6, final: false }; return base.chargeToken(i); } };
};

async function seedPlan(w: World, tenant = T1, over: Partial<Plan> = {}) {
  const s = sanitizePlan({ name: 'מניקור קבוע', price: 260, credits: 2, rollover: false, min_months: 0, services: ['מניקור'], ...over });
  assert.ok(s.ok);
  const fields = (s as { ok: true; plan: PlanFields }).plan;
  return w.repo.insertPlan({ ...fields, ...over, tenant_id: tenant, active: true });
}

/** Enroll, consent, save a card: an ACTIVE membership due today. */
async function activeMember(w: World, d: MembershipDeps, opts: { tenant?: string; client?: string; plan?: Partial<Plan>; card?: 'ok' | 'decline' } = {}) {
  const plan = await seedPlan(w, opts.tenant || T1, opts.plan);
  const e = await createEnrollment(d, { tenantId: opts.tenant || T1, clientId: opts.client || C1, planId: plan.id });
  assert.ok(e.ok, JSON.stringify(e));
  const m = (e as { membership: Membership }).membership;
  const text = consentTextHe(m.plan, await w.repo.businessName(m.tenant_id));
  const s = await startCardPage(d, { linkId: m.link_id, agree: true, consentText: text, returnUrl: 'https://kalmea.test/pay/membership/x' });
  assert.ok(s.ok, JSON.stringify(s));
  const cur = (await w.repo.getMembership(m.tenant_id, m.id))!;
  const saved = await saveMembershipCard(d, cur, { tokenRef: newMockCardToken(opts.card || 'ok'), last4: '4242', brand: 'Visa' });
  assert.ok(saved);
  return saved!;
}

// ── the switch and availability ─────────────────────────────────────────────
await ok('the flag: on only for "1" or "true"; empty (the default and the test runner) is off', () => {
  for (const v of ['', undefined, '0', 'false', 'off', 'yes']) assert.equal(clientMembershipsEnabled({ NEXT_PUBLIC_CLIENT_MEMBERSHIPS: v }), false, String(v));
  for (const v of ['1', 'true', ' TRUE ']) assert.equal(clientMembershipsEnabled({ NEXT_PUBLIC_CLIENT_MEMBERSHIPS: v }), true, v);
  assert.match(read('scripts/run-tests.mjs'), /NEXT_PUBLIC_CLIENT_MEMBERSHIPS: ''/, 'the test runner keeps it off whatever the machine has');
  assert.equal(clientMembershipsEnabled(), false, 'off in this run');
});

await ok('available only with the flag, the Grow screens, the saved-card flows, a connected and enabled Grow account, and not a demo', () => {
  const all = { flag: true, growUi: true, tokenFlows: true, account: { enabled: true }, demo: false };
  assert.equal(membershipsReady(all), true);
  assert.equal(membershipsReady({ ...all, flag: false }), false);
  assert.equal(membershipsReady({ ...all, growUi: false }), false);
  assert.equal(membershipsReady({ ...all, tokenFlows: false }), false, 'no token credentials: hidden');
  assert.equal(membershipsReady({ ...all, account: null }), false, 'Grow not connected: hidden');
  assert.equal(membershipsReady({ ...all, account: { enabled: false } }), false, 'Grow switched off: hidden');
  assert.equal(membershipsReady({ ...all, demo: true }), false);
});

await ok('the saved-card flows: live needs tokenCredentials(); mock never on Vercel production; the route helper says exactly that', () => {
  const live = resolveGrow({ GROW_MODE: 'live', GROW_ENV: 'production', GROW_API_KEY: 'k', GROW_PAGE_CODE: 'p' } as never, 'https://k');
  assert.equal(live.tokenCreds, null, 'live without GROW_TOKEN_* has no token credentials');
  const liveTok = resolveGrow({ GROW_MODE: 'live', GROW_TOKEN_API_KEY_TEST: 'K', GROW_TOKEN_PAGE_CODE_TEST: 'P', GROW_TOKEN_USER_ID_TEST: 'U' } as never, 'https://k');
  assert.ok(liveTok.tokenCreds && liveTok.ops);
  assert.equal(resolveGrow({ VERCEL_ENV: 'production' } as never, 'https://k').configured, false, 'mock is refused on production');
  const src = read('app/api/memberships/_deps.ts');
  assert.match(src, /g\.mode === 'live' \? !!g\.tokenCreds : true/);
  assert.match(src, /if \(!g\.configured \|\| !g\.ops\) return false/);
  assert.match(src, /membershipsReady\(\{ flag: clientMembershipsEnabled\(\), growUi: growUiEnabled\(process\.env, tenantId\), tokenFlows: tokenFlowsConfigured\(\), account, demo: isDemoTenantId\(tenantId\) \}\)/);
});

await ok('flag off: every route is a 404, the page is notFound(), and every component renders nothing', () => {
  for (const f of ['app/api/memberships/route.ts', 'app/api/memberships/link/route.ts']) {
    const src = read(f);
    for (const verb of ['GET', 'POST']) {
      const body = src.slice(src.indexOf(`export async function ${verb}`));
      assert.match(body.slice(0, 200), /if \(!clientMembershipsEnabled\(\)\) return notFound\(\);/, `${f} ${verb}`);
    }
  }
  assert.match(read('app/pay/membership/[token]/page.tsx'), /if \(!clientMembershipsEnabled\(\)\) notFound\(\);/);
  assert.match(read('app/api/memberships/run/route.ts'), /if \(!clientMembershipsEnabled\(\)\) return NextResponse\.json\(\{ success: true, skipped: 'flag-off' \}\)/);
  assert.match(read('app/MembershipsPanel.jsx'), /if \(!on \|\| !s\?\.available\) return null;/);
  assert.match(read('app/MembershipClientCard.jsx'), /if \(!on \|\| !s\) return null;/);
  assert.match(read('app/MembershipTill.jsx'), /if \(!on \|\| !m\) return null;/);
  const app = read('app/beautyos.jsx');
  assert.match(app, /\.\.\.\(clientMembershipsEnabled\(\) \? \[\{key:MEMBERSHIP_PAYMENT/, 'no empty "מנוי" row in her reports while the feature is off');
  assert.match(app, /clientMembershipsEnabled\(\)&&\(\n <div role=\{tabs\.length>1\?"tabpanel":undefined\} hidden=\{cur!=="memberships"\}>/);
  assert.match(app, /memberships:membershipsAvail\}\)/, 'the till tab exists only once the panel says it is available');
  assert.deepEqual(tillTabsOf({}).map((t) => t.k), ['pay']);
  assert.deepEqual(tillTabsOf({ memberships: true }).map((t) => t.l), ['תשלומים', 'מנויים']);
});

// ── plans and words ─────────────────────────────────────────────────────────
await ok('plans: name, monthly price, treatments per month, rollover, minimum months, covered treatments; nonsense refused in Hebrew', () => {
  const g = sanitizePlan({ name: '  פנים   חודשי ', price: '349.999', credits: '1', rollover: 'true', min_months: '3', services: ['טיפול פנים', 'טיפול פנים', ''] });
  assert.ok(g.ok);
  assert.deepEqual((g as { plan: unknown }).plan, { name: 'פנים חודשי', price: 350, credits: 1, rollover: true, min_months: 3, services: ['טיפול פנים'] });
  for (const bad of [{ name: '', price: 100, credits: 1 }, { name: 'x', price: 0, credits: 1 }, { name: 'x', price: 100, credits: 0 }, { name: 'x', price: 100, credits: 40 }, { name: 'x', price: 100, credits: 2, min_months: 30 }]) {
    const r = sanitizePlan(bad);
    assert.equal(r.ok, false); assert.match((r as { error: string }).error, /[א-ת]/);
  }
  assert.equal(planLineHe({ price: 260, credits: 2 }), '2 טיפולים בחודש ב-₪260');
  assert.equal(planLineHe({ price: 199, credits: 1 }), 'טיפול אחד בחודש ב-₪199');
});

await ok('the consent words: the plan, the price, Grow, the first charge now, the terms; warm Hebrew, no dashes, never the legal-receipt word', () => {
  const t = consentTextHe({ name: 'מניקור קבוע', price: 260, credits: 2, rollover: false, min_months: 3, services: ['מניקור'] }, 'סטודיו דנה');
  for (const must of ['אני מאשרת', '"מניקור קבוע"', 'סטודיו דנה', '2 טיפולים בחודש', '(מניקור)', '₪260', 'Grow', 'החיוב הראשון יתבצע מיד', '3 חודשים לפחות', 'לא עובר לחודש הבא']) assert.ok(t.includes(must), must);
  assert.ok(!/[—–]/.test(t) && !/קבלה/.test(t));
  assert.ok(consentTextHe({ name: 'x', price: 1, credits: 1, rollover: true, min_months: 0, services: [] }, '').includes('עובר לחודש הבא בלבד'));
  for (const s of Object.values(STATUS_HE)) assert.ok(!/[—–]/.test(s) && !/קבלה/.test(s));
});

await ok('periods stay on her anchor day: the 31st becomes the 28th, then the 31st again; December rolls into January', () => {
  assert.equal(nextPeriodStart('2027-01-31', 31), '2027-02-28');
  assert.equal(nextPeriodStart('2027-02-28', 31), '2027-03-31');
  assert.equal(nextPeriodStart('2028-01-30', 30), '2028-02-29');
  assert.equal(nextPeriodStart('2026-12-15', 15), '2027-01-15');
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(israelDay(new Date('2026-11-11T22:30:00Z')), '2026-11-12', 'Israel calendar day, not UTC');
});

// ── enrollment and consent ──────────────────────────────────────────────────
await ok('enrollment: waits for the client; one live membership per client; Grow off or a plan of another business is refused', async () => {
  const w = makeWorld(); const d = w.deps(mockOps());
  const plan = await seedPlan(w);
  const e = await createEnrollment(d, { tenantId: T1, clientId: C1, planId: plan.id });
  assert.ok(e.ok);
  const m = (e as { membership: Membership }).membership;
  assert.equal(m.status, 'awaiting_consent'); assert.equal(m.consented_at, null); assert.match(m.link_id, /^[0-9a-f]{48}$/);
  assert.equal(w.ledger.length + w.payments.length, 0, 'nothing charged');
  assert.equal((await createEnrollment(d, { tenantId: T1, clientId: C1, planId: plan.id }) as { code: string }).code, 'exists');
  const other = await seedPlan(w, T2);
  assert.equal((await createEnrollment(d, { tenantId: T1, clientId: C2, planId: other.id }) as { code: string }).code, 'no-plan', 'a plan of another business');
  assert.equal((await createEnrollment(d, { tenantId: T1, clientId: 'c-9', planId: plan.id }) as { code: string }).code, 'no-client', 'a client of another business');
  w.accounts.set(T1, { user_id: 'grow-user-1', enabled: false });
  assert.equal((await createEnrollment(d, { tenantId: T1, clientId: C2, planId: plan.id }) as { code: string }).code, 'not-connected');
  await w.repo.updatePlan(T1, plan.id, { active: false });
  w.accounts.set(T1, { user_id: 'grow-user-1', enabled: true });
  assert.equal((await createEnrollment(d, { tenantId: T1, clientId: C2, planId: plan.id }) as { code: string }).code, 'no-plan', 'a plan she stopped selling');
});

await ok('consent: refused without the tick or with other words; frozen once, never rewritten by a second press or a later plan change', async () => {
  const w = makeWorld(); const d = w.deps(mockOps());
  const plan = await seedPlan(w);
  const m = ((await createEnrollment(d, { tenantId: T1, clientId: C1, planId: plan.id })) as { membership: Membership }).membership;
  const words = consentTextHe(m.plan, 'סטודיו דנה');
  assert.equal((await startCardPage(d, { linkId: m.link_id, agree: false, consentText: words, returnUrl: 'https://k' }) as { code: string }).code, 'consent');
  assert.equal((await startCardPage(d, { linkId: m.link_id, agree: true, consentText: 'משהו אחר', returnUrl: 'https://k' }) as { code: string }).code, 'changed');
  assert.equal((await w.repo.getMembership(T1, m.id))!.consented_at, null, 'no consent recorded by a refused press');
  const s1 = await startCardPage(d, { linkId: m.link_id, agree: true, consentText: words, returnUrl: 'https://k' });
  assert.ok(s1.ok && /mock-token/.test((s1 as { url: string }).url), 'Grow\'s save-only page (the mock here)');
  const a = (await w.repo.getMembership(T1, m.id))!;
  assert.equal(a.consent_text, words); assert.equal(a.consent_version, MEMBERSHIP_CONSENT_VERSION); assert.ok(a.consented_at); assert.equal(a.status, 'awaiting_card');
  // she edits the plan (a new price): the membership keeps what the client agreed to
  await w.repo.updatePlan(T1, plan.id, { price: 999, name: 'אחר' });
  const s2 = await startCardPage(d, { linkId: m.link_id, agree: true, consentText: words, returnUrl: 'https://k' });
  assert.ok(s2.ok, 'a second press opens a new Grow page with the same frozen words');
  const b = (await w.repo.getMembership(T1, m.id))!;
  assert.equal(b.consent_text, a.consent_text); assert.equal(b.consented_at, a.consented_at); assert.equal(b.plan.price, 260); assert.equal(b.plan.name, 'מניקור קבוע');
  await assert.rejects(w.repo.updateMembership(T1, m.id, { consent_text: 'נוסח אחר' }), /frozen/, 'and the database refuses a rewrite');
  const sql = read('supabase/migrations/add_client_memberships_2026-11-11.sql');
  assert.match(sql, /create trigger client_memberships_consent_frozen before update/);
  assert.match(sql, /new\.consent_text is distinct from old\.consent_text/);
});

await ok('the card callback: trusted only for our process, tenant and ref; sealed for that business and client; approved once', async () => {
  const w = makeWorld(); const d = w.deps(mockOps());
  const plan = await seedPlan(w);
  const m = ((await createEnrollment(d, { tenantId: T1, clientId: C1, planId: plan.id })) as { membership: Membership }).membership;
  await startCardPage(d, { linkId: m.link_id, agree: true, consentText: consentTextHe(m.plan, 'סטודיו דנה'), returnUrl: 'https://k' });
  const proc = (await w.repo.getMembership(T1, m.id))!.process_id!;
  const ref = growText(membershipRef(m.id).replace(/-/g, ''), 60);
  assert.ok(isMembershipRef(ref) && isMembershipRef(membershipRef(m.id)) && !isMembershipRef('1234-appointment'));
  const note = (over = {}) => ({ processId: proc, cardToken: 'tok-real-1', last4: '4242', brand: 'Visa', exp: '', transactionId: '', transactionToken: '', asmachta: '', appointmentRef: ref, tenantRef: T1.replace(/-/g, ''), echo: {}, ...over });
  let approved = 0;
  const approve = async () => { approved++; };
  assert.equal((await onMembershipCardToken(d, note({ processId: 'someone-else' }), approve)).status, 'unknown-process');
  assert.equal((await onMembershipCardToken(d, note({ tenantRef: T2.replace(/-/g, '') }), approve)).status, 'mismatch');
  assert.equal((await onMembershipCardToken(d, note({ appointmentRef: 'mbr' + '0'.repeat(32) }), approve)).status, 'mismatch');
  assert.equal(approved, 0);
  const r = await onMembershipCardToken(d, note(), approve);
  assert.equal(r.status, 'saved'); assert.equal(approved, 1);
  const tok = w.tokens[0];
  assert.equal(tok.tenant_id, T1); assert.equal(tok.client_id, C1); assert.equal(tok.appointment_id, membershipRef(m.id));
  assert.ok(tok.token_encrypted && !tok.token_ref.includes('tok-real-1'), 'stored sealed, never plain');
  const a = (await w.repo.getMembership(T1, m.id))!;
  assert.equal(a.status, 'active'); assert.equal(a.next_charge_on, '2026-11-11'); assert.equal(a.anchor_day, 11);
  assert.equal((await onMembershipCardToken(d, note(), approve)).status, 'already-saved'); assert.equal(w.tokens.length, 1);
  assert.match(w.notices.at(-1)!.title, /מנוי חדש/);
});

// ── the monthly charge ──────────────────────────────────────────────────────
await ok('the first month: charged once on HER Grow, recorded as a Grow payment and a confirmation in her history, credits granted', async () => {
  const w = makeWorld(); const d = w.deps(mockOps());
  const m = await activeMember(w, d);
  const r = await chargeMembership(d, m);
  assert.equal(r.outcome, 'paid');
  assert.equal(w.ledger.length, 1); assert.equal(w.ledger[0].status, 'succeeded'); assert.equal(w.ledger[0].purpose, 'membership');
  assert.equal(w.ledger[0].appointment_id, membershipRef(m.id)); assert.equal(w.ledger[0].client_id, C1);
  const pay = w.payments[0];
  assert.equal(pay.status, 'paid'); assert.equal(pay.origin, 'membership'); assert.equal(pay.kind, 'charge'); assert.equal(Number(pay.amount), 260); assert.equal(pay.tenant_id, T1);
  assert.equal(paymentOriginOf(pay), 'membership'); assert.equal(originLabelHe(pay), 'מנוי חודשי');
  assert.equal(paymentOriginOf({ description: growText('מנוי מניקור קבוע') }), 'membership', 'inferred for a payment from before the origin column');
  const rc = w.receipts[0];
  assert.equal(rc.legal_provider, 'grow'); assert.equal(rc.payment_method, 'אשראי'); assert.equal(rc.amount, 260); assert.equal(rc.client_id, C1); assert.equal(rc.grow_payment_id, pay.id);
  assert.ok(!/קבלה|[—–]/.test(String(rc.note)) && !/קבלה/.test(String(rc.service)));
  const a = (await w.repo.getMembership(T1, m.id))!;
  assert.equal(a.next_charge_on, '2026-12-11'); assert.equal(a.status, 'active');
  const p = w.periods[0];
  assert.equal(p.status, 'paid'); assert.equal(p.period_end, '2026-12-11'); assert.equal(p.credits, 2); assert.equal(p.receipt_id, rc.id);
});

await ok('idempotent: the same month never twice, whether the run repeats, two runs race, or the membership was not moved on after a crash', async () => {
  const w = makeWorld(); const d = w.deps(mockOps());
  const m = await activeMember(w, d);
  const [a, b] = await Promise.all([chargeMembership(d, m), chargeMembership(d, m)]);
  assert.deepEqual([a.outcome, b.outcome].sort(), ['in-progress', 'paid'], 'two runs at once: one charges, the other finds the month taken');
  assert.equal([a, b].filter((x) => x.outcome === 'paid').length, 1);
  await runDueMemberships(d); await runDueMemberships(d);
  assert.equal(w.payments.filter((p) => p.status === 'paid').length, 1); assert.equal(w.ledger.length, 1); assert.equal(w.periods.length, 1);
  // a crash after the period was paid but before the membership moved on: the period row says paid, and nothing is charged
  await w.repo.updateMembership(T1, m.id, { next_charge_on: '2026-11-11' });
  assert.equal((await chargeMembership(d, m)).outcome, 'already-paid');
  assert.equal(w.ledger.length, 1); assert.equal((await w.repo.getMembership(T1, m.id))!.next_charge_on, '2026-12-11');
  // next month, once
  w.setDay('2026-12-11');
  const s = await runDueMemberships(d); await runDueMemberships(d);
  assert.equal(s.paid, 1); assert.equal(w.periods.length, 2); assert.equal(w.ledger.length, 2);
  assert.notEqual(w.ledger[0].unique_identifier, w.ledger[1].unique_identifier, 'a new identifier per charge');
  const sql = read('supabase/migrations/add_client_memberships_2026-11-11.sql');
  assert.match(sql, /unique \(membership_id, period_start\)/);
});

await ok('a failed charge: retried 1, 3 and 5 days after the first failure with a fresh identifier each time, then paused; she is told each time', async () => {
  const w = makeWorld(); let failing = true; const d = w.deps(flakyOps(() => failing));
  const m = await activeMember(w, d);
  const before = w.notices.length;
  const r1 = await chargeMembership(d, m);
  assert.equal(r1.outcome, 'failed'); assert.equal((r1 as { retryOn: string }).retryOn, '2026-11-12');
  let a = (await w.repo.getMembership(T1, m.id))!;
  assert.equal(a.status, 'past_due'); assert.equal(a.next_retry_on, '2026-11-12'); assert.equal(a.next_charge_on, '2026-11-11', 'the month keeps its date');
  assert.equal((await runDueMemberships(d)).due, 0, 'nothing again the same day');
  for (const [day, next] of [['2026-11-12', '2026-11-14'], ['2026-11-14', '2026-11-16']]) {
    w.setDay(day); await runDueMemberships(d);
    a = (await w.repo.getMembership(T1, m.id))!;
    assert.equal(a.status, 'past_due'); assert.equal(a.next_retry_on, next);
  }
  w.setDay('2026-11-15'); assert.equal((await runDueMemberships(d)).due, 0, 'not before the retry day');
  w.setDay('2026-11-16'); await runDueMemberships(d);
  a = (await w.repo.getMembership(T1, m.id))!;
  assert.equal(a.status, 'paused'); assert.equal(a.pause_reason, 'payment_failed'); assert.equal(a.failed_attempts, MAX_ATTEMPTS);
  assert.equal(w.periods.length, 1); assert.equal(w.periods[0].attempts, 4); assert.equal(w.periods[0].status, 'failed');
  assert.equal(w.ledger.length, 4); assert.equal(new Set(w.ledger.map((l) => l.unique_identifier)).size, 4, 'never the same identifier twice');
  assert.equal(w.notices.length - before, 4); assert.match(w.notices.at(-1)!.title, /הושהה/);
  w.setDay('2026-11-30'); assert.equal((await runDueMemberships(d)).due, 0, 'paused: never charged by itself');
  // she resumes after talking to the client: one attempt now, which goes through, and the month is paid
  failing = false;
  const res = await ownerAction(d, { tenantId: T1, membershipId: m.id, action: 'resume' });
  assert.ok(res.ok); assert.equal((res as { charge: { outcome: string } }).charge.outcome, 'paid');
  assert.equal(w.periods.length, 1, 'the same month, not a new one'); assert.equal(w.periods[0].status, 'paid');
  assert.equal((await w.repo.getMembership(T1, m.id))!.next_charge_on, '2026-12-11');
});

await ok('a final card refusal (Grow 103/451/452/453, or a card that is not hers) pauses at once', async () => {
  const w = makeWorld(); const d = w.deps(mockOps());
  const m = await activeMember(w, d, { card: 'decline' });
  const r = await chargeMembership(d, m);
  assert.equal(r.outcome, 'failed'); assert.equal((r as { paused: boolean }).paused, true);
  const a = (await w.repo.getMembership(T1, m.id))!;
  assert.equal(a.status, 'paused'); assert.equal(a.pause_reason, 'card_refused');
  // tenant isolation on the card: a token row of another client is refused before Grow
  const w2 = makeWorld(); const d2 = w2.deps(mockOps());
  const m2 = await activeMember(w2, d2);
  w2.tokens[0].client_id = C2;
  assert.equal((await chargeMembership(d2, m2)).outcome, 'failed'); assert.equal(w2.ledger.length, 0, 'never reached Grow');
});

await ok('an ambiguous Grow answer is never charged again by itself; she looks in Grow and retries with a NEW identifier', async () => {
  const w = makeWorld();
  const base = mockOps();
  let mode: 'unreachable' | 'ok' = 'unreachable';
  const ops: GrowOps = { ...base, async chargeToken(i) { return mode === 'unreachable' ? { ok: false, code: 'unreachable', error: 'could not reach Grow' } : base.chargeToken(i); }, async lookupToken() { return { ok: true, found: false, status: 'unknown' }; } };
  const d = w.deps(ops);
  const m = await activeMember(w, d);
  assert.equal((await chargeMembership(d, m)).outcome, 'unknown');
  const a = (await w.repo.getMembership(T1, m.id))!;
  assert.equal(a.status, 'attention'); assert.equal(w.periods[0].status, 'unknown'); assert.equal(w.ledger[0].status, 'unknown');
  assert.match(w.notices.at(-1)!.body, /בדקי ב-Grow/);
  w.setDay('2026-11-20'); assert.equal((await runDueMemberships(d)).due, 0, 'the daily run leaves it alone');
  mode = 'ok';
  const r = await ownerAction(d, { tenantId: T1, membershipId: m.id, action: 'retry' });
  assert.ok(r.ok); assert.equal((r as { charge: { outcome: string } }).charge.outcome, 'paid');
  assert.equal(w.ledger.length, 2); assert.notEqual(w.ledger[0].unique_identifier, w.ledger[1].unique_identifier);
});

await ok('a charge cut off mid-way (the function died) becomes "check in Grow", never a second charge on a guess', async () => {
  const w = makeWorld(); const d = w.deps(mockOps());
  const m = await activeMember(w, d);
  await w.repo.insertPeriod({ tenant_id: T1, membership_id: m.id, period_start: '2026-11-11', period_end: '2026-12-11', amount: 260, credits: 2, status: 'charging', attempts: 1, first_failed_on: null, grow_payment_id: null, receipt_id: null, error: null, paid_at: null });
  assert.equal((await chargeMembership(d, m)).outcome, 'in-progress');
  w.advanceMs(2 * 60 * 60 * 1000);
  const s = await runDueMemberships(d);
  assert.equal(s.stale, 1); assert.equal(w.ledger.length, 0);
  assert.equal((await w.repo.getMembership(T1, m.id))!.status, 'attention');
});

await ok('Grow switched off on her side: no attempt is made and none is counted', async () => {
  const w = makeWorld(); const d = w.deps(mockOps());
  const m = await activeMember(w, d);
  w.accounts.set(T1, { user_id: 'grow-user-1', enabled: false });
  assert.equal((await chargeMembership(d, m)).outcome, 'not-connected');
  assert.equal(w.ledger.length + w.periods.length + w.payments.length, 0);
  assert.equal((await w.repo.getMembership(T1, m.id))!.failed_attempts, 0);
  const src = read('app/api/memberships/link/route.ts');
  assert.match(src, /canStart: waiting && ready\.ready/, 'the client is not offered the card step while Grow is off');
});

// ── credits at the till ─────────────────────────────────────────────────────
await ok('credits: "נשארו 1 מתוך 2"; once per receipt; none left after two; a treatment the plan does not cover is refused', async () => {
  const w = makeWorld(); const d = w.deps(mockOps());
  const m = await activeMember(w, d);
  const before = await w.repo.listPeriods(T1, [m.id]);
  assert.equal(creditsOf(m, before, [], '2026-11-11').available, 0, 'nothing before the month is paid');
  await chargeMembership(d, m);
  const r1 = await redeemCredit(d, { tenantId: T1, membershipId: m.id, clientId: C1, receiptId: 'r-1', service: 'מניקור' });
  assert.ok(r1.ok); assert.equal((r1 as { credits: { labelHe: string } }).credits.labelHe, 'נשארו 1 מתוך 2');
  const again = await redeemCredit(d, { tenantId: T1, membershipId: m.id, clientId: C1, receiptId: 'r-1', service: 'מניקור' });
  assert.ok(again.ok && (again as { already: boolean }).already); assert.equal(w.redemptions.length, 1, 'a retried request uses nothing more');
  assert.equal((await redeemCredit(d, { tenantId: T1, membershipId: m.id, clientId: C1, receiptId: 'r-x', service: 'פדיקור' }) as { code: string }).code, 'not-covered');
  assert.ok((await redeemCredit(d, { tenantId: T1, membershipId: m.id, clientId: C1, receiptId: 'r-2', service: 'מניקור' })).ok);
  assert.equal((await redeemCredit(d, { tenantId: T1, membershipId: m.id, clientId: C1, receiptId: 'r-3', service: 'מניקור' }) as { code: string }).code, 'none-left');
  assert.equal((await redeemCredit(d, { tenantId: T1, membershipId: m.id, clientId: C2, receiptId: 'r-4', service: 'מניקור' }) as { code: string }).code, 'gone', 'another client');
  assert.equal((await redeemCredit(d, { tenantId: T2, membershipId: m.id, clientId: C1, receiptId: 'r-5', service: 'מניקור' }) as { code: string }).code, 'gone', 'another business');
  // next month: new credits, the old ones are gone (no rollover)
  w.setDay('2026-12-11'); await runDueMemberships(d);
  const cur = (await w.repo.getMembership(T1, m.id))!;
  const c = creditsOf(cur, await w.repo.listPeriods(T1, [m.id]), await w.repo.listRedemptions(T1, [m.id]), '2026-12-11');
  assert.equal(c.labelHe, 'נשארו 2 מתוך 2');
});

await ok('two devices at once on the last credit: one uses it, the other is told nothing is left', async () => {
  const w = makeWorld(); const d = w.deps(mockOps());
  const m = await activeMember(w, d, { plan: { credits: 1 } as Partial<Plan> });
  await chargeMembership(d, m);
  const [a, b] = await Promise.all([
    redeemCredit(d, { tenantId: T1, membershipId: m.id, clientId: C1, receiptId: 'ra', service: 'מניקור' }),
    redeemCredit(d, { tenantId: T1, membershipId: m.id, clientId: C1, receiptId: 'rb', service: 'מניקור' }),
  ]);
  assert.equal([a, b].filter((x) => x.ok).length, 1); assert.equal(w.redemptions.length, 1);
  const sql = read('supabase/migrations/add_client_memberships_2026-11-11.sql');
  assert.match(sql, /membership_redemptions_period_seq_uniq on public\.membership_redemptions \(period_id, seq\)/);
  assert.match(sql, /membership_redemptions_receipt_uniq on public\.membership_redemptions \(receipt_id\)/);
});

await ok('rollover: an unused treatment carries into the next month only; cancelled: what was paid stays to the end of that month', async () => {
  const w = makeWorld(); const d = w.deps(mockOps());
  const m = await activeMember(w, d, { plan: { rollover: true, services: [] } as Partial<Plan> });
  await chargeMembership(d, m);
  await redeemCredit(d, { tenantId: T1, membershipId: m.id, clientId: C1, receiptId: 'r1', service: 'כל טיפול' });
  w.setDay('2026-12-11'); await runDueMemberships(d);
  const look = async (day: string) => { const cur = (await w.repo.getMembership(T1, m.id))!; return creditsOf(cur, await w.repo.listPeriods(T1, [m.id]), await w.repo.listRedemptions(T1, [m.id]), day); };
  const dec = await look('2026-12-11');
  assert.equal(dec.available, 3); assert.equal(dec.labelHe, 'נשארו 3: 2 מתוך 2 החודש ועוד 1 מהחודש הקודם');
  const r = await redeemCredit(d, { tenantId: T1, membershipId: m.id, clientId: C1, receiptId: 'r2', service: 'x' });
  assert.ok(r.ok); assert.equal(w.redemptions.at(-1)!.period_id, w.periods[0].id, 'the carried one is used first');
  w.setDay('2027-01-11'); await runDueMemberships(d);
  assert.equal((await look('2027-01-11')).carried, 2, 'December\'s two carry; November\'s are gone');
  await ownerAction(d, { tenantId: T1, membershipId: m.id, action: 'cancel' });
  const after = await look('2027-01-20');
  assert.equal(after.carried, 0, 'after cancel nothing carries'); assert.equal(after.currentLeft, 2, 'the paid month stays usable');
  assert.equal((await look('2027-02-11')).available, 0, 'and ends with it');
});

// ── cancel, pause, her dashboard ────────────────────────────────────────────
await ok('the client cancels from her link only after the minimum months; she is told; nothing is charged after', async () => {
  const w = makeWorld(); const d = w.deps(mockOps());
  const m = await activeMember(w, d, { plan: { min_months: 2 } as Partial<Plan> });
  await chargeMembership(d, m);
  const early = await clientCancel(d, { linkId: m.link_id });
  assert.equal(early.ok, false); assert.equal((early as { code: string }).code, 'min-term'); assert.match((early as { error: string }).error, /11\/12\/2026/);
  w.setDay('2026-12-11'); await runDueMemberships(d);
  assert.equal(clientCancelFrom((await w.repo.getMembership(T1, m.id))!, await w.repo.listPeriods(T1, [m.id])), null);
  const before = w.notices.length;
  const r = await clientCancel(d, { linkId: m.link_id });
  assert.ok(r.ok); assert.equal((r as { membership: Membership }).membership.cancelled_by, 'client');
  assert.equal(w.notices.length - before, 1); assert.equal(w.notices.at(-1)!.tenantId, T1); assert.match(w.notices.at(-1)!.title, /בוטל/);
  w.setDay('2027-01-11'); assert.equal((await runDueMemberships(d)).due, 0);
  assert.equal((await clientCancel(d, { linkId: m.link_id }) as { code: string }).code, 'gone');
  assert.equal((await clientCancel(d, { linkId: 'f'.repeat(48) }) as { code: string }).code, 'gone');
});

await ok('she pauses and resumes; a pause that outlived its month restarts today; another business cannot touch it', async () => {
  const w = makeWorld(); const d = w.deps(mockOps());
  const m = await activeMember(w, d);
  await chargeMembership(d, m);
  assert.equal((await ownerAction(d, { tenantId: T2, membershipId: m.id, action: 'cancel' }) as { code: string }).code, 'gone', 'tenant isolation');
  assert.ok((await ownerAction(d, { tenantId: T1, membershipId: m.id, action: 'pause' })).ok);
  w.setDay('2027-01-20'); assert.equal((await runDueMemberships(d)).due, 0, 'paused: not charged');
  const r = await ownerAction(d, { tenantId: T1, membershipId: m.id, action: 'resume' });
  assert.ok(r.ok); assert.equal((r as { charge: { outcome: string } }).charge.outcome, 'paid');
  const a = (await w.repo.getMembership(T1, m.id))!;
  assert.equal(a.anchor_day, 20); assert.equal(a.next_charge_on, '2027-02-20'); assert.equal(w.periods.length, 2);
});

await ok('her dashboard: active members, monthly recurring income, failed charges; a cancelled one is not counted', async () => {
  const w = makeWorld(); let failing = false; const d = w.deps(flakyOps(() => failing));
  const a = await activeMember(w, d, { client: C1 });
  await chargeMembership(d, a);
  failing = true;
  const b = await activeMember(w, d, { client: C2, plan: { price: 180, name: 'פנים חודשי' } as Partial<Plan> });
  await chargeMembership(d, b);
  const ms = await w.repo.listMemberships(T1);
  const ps = await w.repo.listPeriods(T1, ms.map((m) => m.id));
  const s = dashboardOf(ms, ps, '2026-11-11');
  assert.equal(s.active, 1); assert.equal(s.pastDue, 1); assert.equal(s.mrr, 440); assert.equal(s.failedCharges, 1); assert.equal(s.collectedThisMonth, 260);
  await ownerAction(d, { tenantId: T1, membershipId: b.id, action: 'cancel' });
  const s2 = dashboardOf(await w.repo.listMemberships(T1), ps, '2026-11-11');
  assert.equal(s2.mrr, 260); assert.equal(s2.failedCharges, 0);
  assert.equal(dashboardOf(await w.repo.listMemberships(T2), [], '2026-11-11').active, 0, 'another business sees none of it');
});

// ── nothing is ever sent to a client ────────────────────────────────────────
await ok('no client messages: no sender anywhere in the feature; her notices go in the app only (not even her opt-in WhatsApp copy)', () => {
  const files = ['lib/memberships.ts', 'lib/membershipsRepo.ts', 'app/api/memberships/_deps.ts', 'app/api/memberships/route.ts', 'app/api/memberships/link/route.ts', 'app/api/memberships/run/route.ts', 'app/MembershipsPanel.jsx', 'app/MembershipClientCard.jsx', 'app/MembershipTill.jsx', 'app/pay/membership/[token]/MembershipLinkClient.jsx'];
  for (const f of files) {
    const src = read(f);
    assert.ok(!/sendWhatsApp|greenApi|whatsapp\.js|waCloud|sendSms|sms\.ts|sendBookingNotifications|sendReceiptToClient/i.test(src), `${f} imports no sender`);
  }
  assert.match(read('app/api/memberships/_deps.ts'), /notifyOwner\(\{ tenantId: n\.tenantId, kind: 'membership', title: n\.title, body: n\.body, whatsapp: false \}\)/);
  // the enrollment link goes back to HER; the wa.me link opens her own WhatsApp only when she taps it
  assert.match(read('app/api/memberships/route.ts'), /waLink: requestWaLink\(e\.membership\.client_phone, message\)/);
  for (const t of ['test-client-memberships.ts']) assert.ok(read(t).length > 0);
});

await ok('wiring: the cron is scheduled and stamped, the webhook and the mock card page know memberships, the till redeems after the receipt', () => {
  const v = JSON.parse(read('vercel.json'));
  assert.ok(v.crons.some((c: { path: string }) => c.path === '/api/memberships/run'));
  const run = read('app/api/memberships/run/route.ts');
  assert.ok(run.indexOf('isAuthorizedCron(request)) return cronUnauthorized()') < run.indexOf("markCronRun('client-memberships')"));
  assert.match(run, /isDemoTenantId\(t\) \|\| !growUiEnabled\(process\.env, t\)/);
  const hook = read('app/api/grow/webhook/route.ts');
  assert.match(hook, /onMembershipCardToken\(md, tokenCb, approve\)/);
  assert.match(hook, /membership\(\)\.catch\(\(\) => null\)/, 'the fallback never blocks a regular payment callback');
  assert.match(read('app/api/grow/mock-token/route.ts'), /isMembershipRef\(session\.appointmentId\)/);
  const app = read('app/beautyos.jsx');
  assert.match(app, /action:"redeem",membershipId:snap\.membership\.membershipId/);
  assert.match(app, /coveredByMembership \? MEMBERSHIP_PAYMENT/);
  assert.match(app, /membership:membershipAdj,loyalty:loyaltyRewardLive/, 'a card payment through Grow redeems too');
  assert.equal(MEMBERSHIP_PAYMENT, 'מנוי');
  const route = read('app/api/memberships/route.ts');
  assert.match(route, /from\('receipts'\)\.select\('id, client_id'\)\.eq\('id', receiptId\)\.eq\('tenant_id', c\.tenantId\)/, 'the receipt is checked to be hers and this client\'s');
  const tables = read('lib/referencedTables.js');
  for (const t of ['membership_plans', 'client_memberships', 'membership_periods', 'membership_redemptions']) assert.ok(tables.includes(`'${t}'`), t);
});

console.log(`client memberships: ${n} checks passed`);
