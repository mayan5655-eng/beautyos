// Voice in the public demo: READ-ONLY commands are answered, everything that writes/sends/charges stays blocked with the existing notice,
// and a small DAILY spend cap (fail closed) bounds what a visitor can cost. Every other AI call site stays blocked for a demo tenant.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEMO_TENANT_IDS } from './lib/demoTenants.ts';
import { DemoBlockedError } from './lib/ai/callCaps.ts';
import { trackedCreate } from './lib/ai/usage.ts';
import { DEMO_AI_CALL_SITES, READ_ONLY_VOICE_ACTIONS, DEMO_DAILY_CALLS, demoDailyUsdCeiling, dayStartIso, getDemoDailyStatus, voiceActionAllowed } from './lib/ai/demoPolicy.ts';
import { makeCapDb } from './testkit/capDb.js';

const DEMO = DEMO_TENANT_IDS.cosmetics;
const REAL = '11111111-1111-4111-8111-111111111111';
const NOTICE = 'זו תצוגה - במערכת שלך זה באמת יישלח';
const NOW = new Date('2026-10-07T10:00:00Z'); // 13:00 in Israel, Oct 7

// ── the policy tables ──
assert.deepEqual([...DEMO_AI_CALL_SITES], ['voice-intent'], 'voice is the ONLY AI call site a demo tenant may use');
assert.deepEqual([...READ_ONLY_VOICE_ACTIONS].sort(), ['revenue_summary', 'show_day', 'unknown']);
for (const a of ['show_day', 'revenue_summary', 'unknown']) assert.ok(voiceActionAllowed(DEMO, a), `demo may see ${a}`);
for (const a of ['book_appointment', 'cancel_appointment', 'create_receipt', 'call_client']) {
  assert.equal(voiceActionAllowed(DEMO, a), false, `demo may NOT see ${a}: it writes, sends or charges`);
  assert.ok(voiceActionAllowed(REAL, a), `a real tenant still gets ${a}`);
}
assert.equal(voiceActionAllowed(DEMO, undefined), true, 'no action = nothing understood = nothing to protect');
assert.equal(voiceActionAllowed(DEMO, 'something_new'), false, 'an action nobody listed is NOT read-only');

// ── the day starts at Israel midnight ──
assert.equal(dayStartIso(new Date('2026-10-06T22:30:00Z')), '2026-10-06T21:00:00.000Z', 'summer: 01:30 on Oct 7 in Israel -> the day began Oct 6 21:00Z');
assert.equal(dayStartIso(new Date('2026-11-10T10:00:00Z')), '2026-11-09T22:00:00.000Z', 'winter: the day began 22:00Z the evening before');

// ── the daily cap ──
const row = (id: number, usd: number | null, iso: string, tenant = DEMO) => ({ id, tenant_id: tenant, call_site: 'voice-intent', cost_usd: usd, created_at: iso });
const today = '2026-10-07T08:00:00.000Z', yesterday = '2026-10-06T08:00:00.000Z';
assert.equal(demoDailyUsdCeiling({}), 0.25); assert.equal(demoDailyUsdCeiling({ AI_DEMO_DAILY_USD: 'junk' }), 0.25); assert.equal(demoDailyUsdCeiling({ AI_DEMO_DAILY_USD: '0' }), 0.25); assert.equal(demoDailyUsdCeiling({ AI_DEMO_DAILY_USD: '1' }), 1);
{
  const quiet = makeCapDb({ ai_usage: [row(1, 0.002, today), row(2, 0.002, today), row(3, 5, yesterday), row(4, 5, today, REAL)] });
  const s = await getDemoDailyStatus(DEMO, { client: quiet, now: NOW });
  assert.equal(s.allowed, true); assert.equal(s.calls, 2, "yesterday's rows and other tenants' rows are not counted");
  const rich = makeCapDb({ ai_usage: Array.from({ length: 6 }, (_, i) => row(i + 1, 0.05, today)) });
  const r = await getDemoDailyStatus(DEMO, { client: rich, now: NOW });
  assert.equal(r.allowed, false); assert.equal(r.reason, 'dollars', '6 x $0.05 passes the $0.25 day');
  const many = makeCapDb({ ai_usage: Array.from({ length: DEMO_DAILY_CALLS }, (_, i) => row(i + 1, 0.001, today)) });
  assert.equal((await getDemoDailyStatus(DEMO, { client: many, now: NOW })).reason, 'calls', `${DEMO_DAILY_CALLS} cheap calls is also a full day`);
  const unpriced = makeCapDb({ ai_usage: Array.from({ length: 5 }, (_, i) => row(i + 1, null, today)) });
  assert.equal((await getDemoDailyStatus(DEMO, { client: unpriced, now: NOW })).reason, 'dollars', 'an unpriced row counts as spend, not as free');
  const broken = { from: () => { throw new Error('database down'); } };
  const u = await getDemoDailyStatus(DEMO, { client: broken, now: NOW });
  assert.equal(u.allowed, false); assert.equal(u.reason, 'unreadable', 'an unreadable counter refuses (fails closed)');
}

// ── through trackedCreate, the real guard ──
const reply = { content: [{ type: 'text', text: '{"action":"show_day","date":"2026-10-07"}' }], usage: { input_tokens: 400, output_tokens: 40 } };
const params = { model: 'claude-haiku-4-5', max_tokens: 10, messages: [] } as any;
const usageDb = () => { const rows: unknown[] = []; return { rows, from: () => ({ insert: async (r: unknown) => { rows.push(r); return { error: null }; } }) }; };
{
  // voice, under the cap: the model IS called, and the call is metered
  let calls = 0; const client = { messages: { create: async () => { calls++; return structuredClone(reply); } } };
  const db = usageDb();
  const msg = await trackedCreate(client as any, params, { tenantId: DEMO, callSite: 'voice-intent', capClient: makeCapDb({ ai_usage: [row(1, 0.002, today)] }) as any, capNow: NOW, db: db as any });
  assert.equal(calls, 1, 'a demo visitor\'s voice command reaches the model'); assert.ok(msg.content.length === 1);
  assert.equal(db.rows.length, 1, 'and is metered like any other call');
}
{
  // voice, over the daily cap: the existing notice, and the model is NEVER called
  let calls = 0; const client = { messages: { create: async () => { calls++; return structuredClone(reply); } } };
  await assert.rejects(
    () => trackedCreate(client as any, params, { tenantId: DEMO, callSite: 'voice-intent', capClient: makeCapDb({ ai_usage: Array.from({ length: 6 }, (_, i) => row(i + 1, 0.05, today)) }) as any, capNow: NOW }),
    (e: unknown) => e instanceof DemoBlockedError && e.message === NOTICE
  );
  assert.equal(calls, 0, 'over the cap: nothing is spent');
}
{
  // any OTHER call site stays blocked for a demo tenant, cap or no cap
  let calls = 0; const client = { messages: { create: async () => { calls++; return structuredClone(reply); } } };
  for (const site of ['advisor', 'designs/generate', 'marketing/reel', 'score-lead', 'whatsapp-webhook', 'test']) {
    await assert.rejects(() => trackedCreate(client as any, params, { tenantId: DEMO, callSite: site, capClient: makeCapDb({ ai_usage: [] }) as any, capNow: NOW }), (e: unknown) => e instanceof DemoBlockedError && e.message === NOTICE, `${site} is still blocked for the demo`);
  }
  assert.equal(calls, 0);
}

// ── the route really filters, and rate-limits the demo ──
const route = readFileSync(new URL('./app/api/voice-intent/route.ts', import.meta.url), 'utf8');
assert.match(route, /voiceActionAllowed\(tenantId as string \| null, intent\?\.action\)/, 'the route filters the intent for a demo tenant');
assert.ok(route.indexOf('voiceActionAllowed(') > route.indexOf('trackedCreate(') && route.indexOf('voiceActionAllowed(') < route.indexOf('NextResponse.json({ intent'), 'the filter sits between the model and the response');
assert.match(route, /isDemoTenantId\(tenantId as string \| null\)\) \{\s*const limited = checkIpLimit\(request, 'voice-intent-demo'\)/, 'a demo visitor is rate limited per address');
assert.ok(route.indexOf("checkIpLimit(request, 'voice-intent-demo')") < route.indexOf('trackedCreate('), '...before any spend');

console.log('demo voice: ok');
