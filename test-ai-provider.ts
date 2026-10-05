// When the AI provider itself says no - an empty credit balance, a revoked key.
//
// Found 2026-10-05, live: Anthropic answered 400 "Your credit balance is too low".
// From then on EVERY AI feature failed for EVERY tenant, and what each saw was the
// generic "the AI could not do that this time, try phrasing it differently" - as if
// her request were the problem - while the operator heard nothing at all. A
// platform-wide outage that looked like thousands of unrelated user mistakes.
//
// What must be true instead:
//   * the person is told the TRUE thing: it is not her, we know, try again later;
//   * the operator is alerted (log + admin panel + WhatsApp), once, not once per call;
//   * ordinary errors are untouched - a bad request is still a bad request.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeCapDb } from './testkit/capDb.js';
import { trackedCreate, trackedStream } from './lib/ai/usage.ts';
import { AiProviderUnavailableError, isProviderUnavailable } from './lib/ai/callCaps.ts';

const T = '11111111-1111-1111-1111-111111111111';
const NOW = new Date('2026-10-15T09:00:00Z');
const quiet = () => { const o = console.error, l = console.log; console.error = () => {}; console.log = () => {}; return () => { console.error = o; console.log = l; }; };
const hooks = () => { const alerts: any[] = []; return { alerts, h: { capClient: makeCapDb({ ai_usage: [] }) as any, capNow: NOW, capAlert: async (a: any) => { alerts.push(a); }, capNoCache: true, providerAlert: async (a: any) => { alerts.push(a); }, providerThrottle: new Map<string, number>() } }; };

const billing = Object.assign(new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}'), { status: 400 });
const badKey = Object.assign(new Error('401 {"error":{"type":"authentication_error","message":"invalid x-api-key"}}'), { status: 401 });
const ordinary = Object.assign(new Error('400 {"error":{"type":"invalid_request_error","message":"messages: text content blocks must be non-empty"}}'), { status: 400 });
const overloaded = Object.assign(new Error('529 overloaded'), { status: 529 });

// ── classification ─────────────────────────────────────────────────────────
assert.equal(isProviderUnavailable(billing), true, 'an empty balance is the provider being unavailable to us');
assert.equal(isProviderUnavailable(badKey), true, 'a rejected key is too');
assert.equal(isProviderUnavailable(ordinary), false, 'a malformed request is NOT - that is a bug, not an outage');
assert.equal(isProviderUnavailable(overloaded), false, 'transient overload is not a billing problem');
assert.equal(isProviderUnavailable(new Error('network')), false);

const params = { model: 'claude-haiku-4-5', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] } as any;

// ── trackedCreate ──────────────────────────────────────────────────────────
{
  const { alerts, h } = hooks();
  const client = { messages: { create: async () => { throw billing; } } } as any;
  const restore = quiet();
  await assert.rejects(() => trackedCreate(client, params, { tenantId: T, callSite: 'advisor', ...h } as any), (e: any) =>
    e instanceof AiProviderUnavailableError && /לא בגללך|לא קשור אליך|בצד שלנו/.test(e.message) && !/credit|billing|anthropic/i.test(e.message));
  // twice more: still one alert
  for (let i = 0; i < 2; i++) await assert.rejects(() => trackedCreate(client, params, { tenantId: T, callSite: 'advisor', ...h } as any));
  restore();
  assert.equal(alerts.length, 1, 'the operator is alerted once, not once per call');
  assert.ok(/credit|קרדיט/i.test(JSON.stringify(alerts[0])), 'and the alert says what to do (the account needs credit)');
}
{
  const { alerts, h } = hooks();
  const client = { messages: { create: async () => { throw ordinary; } } } as any;
  await assert.rejects(() => trackedCreate(client, params, { tenantId: T, callSite: 'advisor', ...h } as any), (e: any) => e === ordinary);
  assert.equal(alerts.length, 0, 'an ordinary error passes through untouched and raises no alarm');
}
{
  const { alerts, h } = hooks();
  const client = { messages: { create: async () => { throw overloaded; } } } as any;
  await assert.rejects(() => trackedCreate(client, params, { tenantId: T, callSite: 'advisor', ...h } as any), (e: any) => e === overloaded);
  assert.equal(alerts.length, 0, 'transient overload does not page the operator');
}

// ── trackedStream: the error surfaces while the stream is read ─────────────
{
  const { alerts, h } = hooks();
  const stream = Object.assign((async function* () { throw billing; })(), { finalMessage: async () => { throw billing; } });
  const client = { messages: { stream: () => stream } } as any;
  const s = await trackedStream(client, params, { tenantId: T, callSite: 'advisor', ...h } as any);
  const restore = quiet();
  await assert.rejects(async () => { for await (const _ of s.deltas) void _; }, (e: any) => e instanceof AiProviderUnavailableError);
  restore();
  assert.equal(alerts.length, 1, 'a streamed answer that hits the same wall alerts too');
}

// ── the routes say it in her words, not "try phrasing it differently" ──────
const code = (f: string) => fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
for (const f of ['app/api/designs/generate/route.ts', 'app/api/designs/ai-fill/route.ts']) {
  assert.ok(code(f).includes('AiProviderUnavailableError'), `${f} tells her the AI is unavailable on our side instead of blaming her request`);
}

console.log('ai provider: ok');
