// The AI ceiling is a ceiling.
//
// It used to fail OPEN: if the usage count errored, the call went through - so
// one bad query and a tenant could spend without limit, on Kalmea's bill. These
// tests drive the real check (lib/ai/callCaps.ts) and the real trackedCreate
// (lib/ai/usage.ts) against a fake database that enforces PostgREST's row cap,
// and assert, in order of how much they matter:
//
//   * a counter that cannot be read REFUSES the call - and the model is never
//     called, and the operator is told;
//   * a tenant over her call cap is refused, in warm Hebrew that says when it
//     renews, never "you hit the ceiling";
//   * a tenant over her DOLLAR ceiling is refused even with every call count
//     fine - the counts are a proxy, the money is the point - including when her
//     month holds more than 1,000 usage rows (the sum must not be truncated) and
//     including rows whose model was never priced;
//   * near the limit she is told warmly, before she is refused;
//   * a healthy tenant is not refused.
import assert from 'node:assert/strict';
import { makeCapDb } from './testkit/capDb.js';
import {
  checkAiAllowance, getCallCapStatus, AiCapExceededError, AiCapUnavailableError,
  tenantMonthlyUsdCeiling, monthStartIso, MONTHLY_CALL_CAPS,
} from './lib/ai/callCaps.ts';
import { capRefusalHe, capNoticeHe } from './lib/ai/capMessages.ts';
import { trackedCreate } from './lib/ai/usage.ts';
import { getQuotaStatus } from './lib/skinScanQuota.ts';

const T = '11111111-1111-1111-1111-111111111111';
const NOW = new Date('2026-10-15T09:00:00Z');
const since = monthStartIso(NOW);
const inMonth = '2026-10-10T08:00:00Z';
const pad = (n: number) => String(n).padStart(6, '0');
const row = (i: number, site: string, usd: number | null, tenant = T) => ({ id: `u${pad(i)}`, tenant_id: tenant, call_site: site, created_at: inMonth, cost_usd: usd });
const quiet = () => { const o = console.error; console.error = () => {}; return () => { console.error = o; }; };

// A fake whose count reads can be made to fail, and which records alerts.
function world(rows: any[], { countError = false, countThrows = false, spendFails = false, maxRows = 1000 } = {}) {
  const base = makeCapDb({ ai_usage: rows }, { maxRows, failPage: spendFails ? () => true : null });
  const client: any = {
    from(t: string) {
      const chain: any = base.from(t);
      const origSelect = chain.select;
      let isCount = false;
      chain.select = (cols: string, opts?: any) => { isCount = !!(opts && opts.head); return origSelect(cols, opts); };
      if (countThrows || countError) {
        const origThen = chain.then;
        chain.then = (res: any, rej: any) => {
          if (isCount) {
            if (countThrows) throw new Error('connection reset');
            return Promise.resolve({ data: null, error: { message: 'canceling statement due to statement timeout' }, count: null }).then(res, rej);
          }
          return origThen(res, rej);
        };
      }
      return chain;
    },
  };
  const alerts: any[] = [];
  return { client, alerts, alert: async (a: any) => { alerts.push(a); } };
}
// A fresh throttle map per case, so one case's alert does not silence the next.
const opts = (w: any) => ({ client: w.client, now: NOW, alert: w.alert, noCache: true, alertThrottle: new Map<string, number>() });

// ── a healthy tenant is allowed ────────────────────────────────────────────
{
  const w = world(Array.from({ length: 20 }, (_, i) => row(i, 'advisor', 0.007)));
  const a = await checkAiAllowance(T, 'advisor', opts(w));
  assert.equal(a.allowed, true);
  assert.equal(a.reason, 'ok');
  assert.equal(a.callsUsed, 20);
  assert.equal(a.near, false);
  assert.equal(w.alerts.length, 0, 'no alert for a healthy tenant');
}

// ── over her CALL cap: refused, warmly, with the renewal date ──────────────
{
  const cap = MONTHLY_CALL_CAPS['advisor'];
  const w = world(Array.from({ length: cap }, (_, i) => row(i, 'advisor', 0.001)));
  const a = await checkAiAllowance(T, 'advisor', opts(w));
  assert.equal(a.allowed, false);
  assert.equal(a.reason, 'calls');
  const msg = capRefusalHe('calls', 'advisor');
  assert.ok(msg.includes('בראשון לחודש'), 'says when it renews');
  assert.ok(/מתחדשות/.test(msg), 'in the form she was promised: "הן מתחדשות בראשון לחודש"');
  assert.ok(!/הגעת לתקרה|תקרה/.test(msg), 'never "you hit the ceiling"');
  assert.ok(!/\d+\s*\/\s*\d+|מתוך/.test(msg), 'no raw counters in front of her');
}

// ── a BROKEN COUNTER refuses ───────────────────────────────────────────────
for (const [label, flags] of [
  ['count returns an error', { countError: true }],
  ['count throws', { countThrows: true }],
] as const) {
  const w = world([row(1, 'advisor', 0.01)], flags);
  const restore = quiet();
  const a = await checkAiAllowance(T, 'advisor', opts(w));
  restore();
  assert.equal(a.allowed, false, `${label}: must refuse`);
  assert.equal(a.reason, 'unreadable', `${label}: reason`);
  assert.equal(w.alerts.length, 1, `${label}: the operator is told the counter is broken`);
  assert.equal(w.alerts[0].reason, 'unreadable');
  const st = await (async () => { const r = quiet(); const s = await getCallCapStatus(T, 'advisor', { db: world([], flags).client.from('ai_usage'), now: NOW }); r(); return s; })();
  assert.equal(st.exceeded, true, `${label}: getCallCapStatus itself no longer says "fine"`);
  assert.equal(st.unknown, true);
}
{
  // The spend read failing is equally a refusal: an unknown total is not a small one.
  const w = world([row(1, 'advisor', 0.01)], { spendFails: true });
  const restore = quiet();
  const a = await checkAiAllowance(T, 'advisor', opts(w));
  restore();
  assert.equal(a.allowed, false);
  assert.equal(a.reason, 'unreadable');
  assert.equal(w.alerts.length, 1);
}
{
  // Alerts are throttled: a broken counter must not text the operator on every call.
  const w = world([], { countError: true });
  const restore = quiet();
  const o = { ...opts(w), alertThrottle: new Map() };
  await checkAiAllowance(T, 'advisor', o);
  await checkAiAllowance(T, 'advisor', o);
  await checkAiAllowance(T, 'voice-intent', o);
  restore();
  assert.ok(w.alerts.length >= 1 && w.alerts.length <= 2, `one alert per cause, not one per call (got ${w.alerts.length})`);
}

// ── the DOLLAR ceiling ─────────────────────────────────────────────────────
{
  const ceiling = tenantMonthlyUsdCeiling({});
  // 1,500 rows of 2 cents is $30: more than the ceiling, past the 1,000-row cap,
  // spread over sites that are each under their own call caps (shooting-list has none).
  const rows = Array.from({ length: 1500 }, (_, i) => row(i, i < 700 ? 'whatsapp-webhook' : i < 1100 ? 'score-lead' : 'marketing/shooting-list', 0.02));
  const w = world(rows);
  const a = await checkAiAllowance(T, 'advisor', opts(w));
  assert.ok(ceiling < 30, 'the fixture really is over the default ceiling');
  assert.equal(a.allowed, false, 'over the dollar ceiling is refused even though no call count is');
  assert.equal(a.reason, 'dollars');
  assert.ok(a.spentUsd !== null && Math.abs(a.spentUsd - 30) < 0.01, `sums all 1,500 rows, not the first 1,000 (got ${a.spentUsd})`);
  assert.ok(capRefusalHe('dollars', 'advisor').includes('בראשון לחודש'));
  assert.ok(w.alerts.some((x) => x.reason === 'dollars'), 'the operator hears a tenant hit her dollar ceiling');
}
{
  // Rows whose model was never priced (cost_usd null) cannot be a way around it.
  const rows = Array.from({ length: 600 }, (_, i) => row(i, 'whatsapp-webhook', null));
  const a = await checkAiAllowance(T, 'voice-intent', opts(world(rows)));
  assert.equal(a.allowed, false, '600 unpriced calls are assumed to cost something, not nothing');
  assert.equal(a.reason, 'dollars');
}
{
  // Another tenant's spend is not hers; last month's is not this month's.
  const rows = [
    ...Array.from({ length: 1500 }, (_, i) => row(i, 'advisor', 0.05, '22222222-2222-2222-2222-222222222222')),
    ...Array.from({ length: 800 }, (_, i) => ({ ...row(5000 + i, 'advisor', 0.05), created_at: '2026-09-20T08:00:00Z' })),
  ];
  const a = await checkAiAllowance(T, 'advisor', opts(world(rows)));
  assert.equal(a.allowed, true, 'only this tenant, only this month');
  assert.equal(a.spentUsd, 0);
}
{
  assert.equal(tenantMonthlyUsdCeiling({ AI_TENANT_MONTHLY_USD: '40' }), 40, 'tunable by env');
  assert.ok(tenantMonthlyUsdCeiling({ AI_TENANT_MONTHLY_USD: 'banana' }) > 0, 'junk falls back to the default, never to "no ceiling"');
  assert.ok(tenantMonthlyUsdCeiling({ AI_TENANT_MONTHLY_USD: '0' }) > 0, 'zero does not mean unlimited');
  assert.ok(tenantMonthlyUsdCeiling({ AI_TENANT_MONTHLY_USD: '-5' }) > 0);
}

// ── near the limit: told warmly, before being refused ──────────────────────
{
  const cap = MONTHLY_CALL_CAPS['marketing/reel'];
  const w = world(Array.from({ length: Math.ceil(cap * 0.85) }, (_, i) => row(i, 'marketing/reel', 0.005)));
  const a = await checkAiAllowance(T, 'marketing/reel', opts(w));
  assert.equal(a.allowed, true, 'still allowed');
  assert.equal(a.near, true, 'but she is near it');
  const n = capNoticeHe(a);
  assert.ok(n && n.includes('בראשון לחודש'), 'the notice says when it renews');
  assert.ok(!/הגעת לתקרה|תקרה/.test(n!), 'and never "ceiling"');
  const far = await checkAiAllowance(T, 'advisor', opts(world([row(1, 'advisor', 0.01)])));
  assert.equal(capNoticeHe(far), null, 'no notice when she is nowhere near');
}
{
  const ceiling = tenantMonthlyUsdCeiling({});
  const rows = Array.from({ length: Math.ceil((ceiling * 0.85) / 0.05) }, (_, i) => row(i, 'advisor', 0.05));
  const a = await checkAiAllowance(T, 'voice-intent', opts(world(rows)));
  assert.equal(a.allowed, true);
  assert.equal(a.near, true, 'near the DOLLAR ceiling counts too');
}

// ── trackedCreate: the model is never called when refused ──────────────────
function fakeAnthropic() {
  const calls: any[] = [];
  return { calls, messages: { create: async (p: any) => { calls.push(p); return { content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 100, output_tokens: 50 }, stop_reason: 'end_turn' }; } } } as any;
}
const insertDb = () => { const rows: any[] = []; return { rows, from: () => ({ insert: async (r: any) => { rows.push(r); return { error: null }; } }) } as any; };
{
  const cap = MONTHLY_CALL_CAPS['advisor'];
  const w = world(Array.from({ length: cap }, (_, i) => row(i, 'advisor', 0.001)));
  const ai = fakeAnthropic();
  const restore = quiet();
  await assert.rejects(
    () => trackedCreate(ai, { model: 'claude-haiku-4-5', max_tokens: 10, messages: [] } as any, { tenantId: T, callSite: 'advisor', capClient: w.client, capNow: NOW, capAlert: w.alert, capNoCache: true } as any),
    (e: any) => e instanceof AiCapExceededError && e.message.includes('בראשון לחודש'),
  );
  restore();
  assert.equal(ai.calls.length, 0, 'over the cap: the model was never called');
}
{
  const w = world([], { countError: true });
  const ai = fakeAnthropic();
  const restore = quiet();
  await assert.rejects(
    () => trackedCreate(ai, { model: 'claude-haiku-4-5', max_tokens: 10, messages: [] } as any, { tenantId: T, callSite: 'advisor', capClient: w.client, capNow: NOW, capAlert: w.alert, capNoCache: true } as any),
    (e: any) => e instanceof AiCapUnavailableError && !/תקרה/.test(e.message),
  );
  restore();
  assert.equal(ai.calls.length, 0, 'broken counter: the model was never called');
  assert.equal(w.alerts.length, 1, 'and the operator was told');
}
{
  const w = world(Array.from({ length: 3 }, (_, i) => row(i, 'advisor', 0.007)));
  const ai = fakeAnthropic();
  const db = insertDb();
  const msg: any = await trackedCreate(ai, { model: 'claude-haiku-4-5', max_tokens: 10, messages: [] } as any, { tenantId: T, callSite: 'advisor', db, capClient: w.client, capNow: NOW, capAlert: w.alert, capNoCache: true } as any);
  assert.equal(ai.calls.length, 1, 'a healthy tenant gets her answer');
  assert.equal(db.rows.length, 1, 'and the call is still metered');
  assert.equal(msg.capNotice ?? null, null, 'no notice when she is far from the limit');
}
{
  // Unattributed calls (no tenant) cannot be charged to anyone and are never capped.
  const ai = fakeAnthropic();
  await trackedCreate(ai, { model: 'claude-haiku-4-5', max_tokens: 10, messages: [] } as any, { tenantId: null, callSite: 'advisor', db: insertDb() });
  assert.equal(ai.calls.length, 1);
}

// ── the skin scanner's own quota fails closed too ──────────────────────────
{
  const broken = { from: () => ({ select() { return this; }, eq() { return this; }, gte() { return this; }, then: (r: any) => Promise.resolve({ count: null, error: { message: 'timeout' } }).then(r) }) } as any;
  const restore = quiet();
  const q = await getQuotaStatus(T, { db: broken, now: NOW });
  restore();
  assert.equal(q.exceeded, true, 'an unreadable scan quota refuses the scan');
  assert.equal(q.unknown, true);
}

console.log('ai cap: ok');
