// Streaming an AI answer must not loosen any rule that a plain call obeys.
//
// The advisor streams so she watches text appear instead of staring at a
// spinner for 15 seconds (lib/ai/usage.ts trackedStream). A stream is a second
// way to spend money, so every guarantee of trackedCreate has to hold here too,
// and the new ways it can go wrong need their own:
//
//   * REFUSED BEFORE ANY MODEL CALL - over the call cap, over the dollar ceiling,
//     or an unreadable counter: nothing is streamed, the model is never reached,
//     and the caller gets the same warm Hebrew error (thrown, so a route can still
//     answer with ordinary JSON before it has started a response);
//   * METERED EXACTLY ONCE, AFTER THE ANSWER - tokens are only known at the end,
//     so the row is written when the stream finishes, thinking tokens included;
//   * METERED EVEN IF SHE LEAVES - closing the tab mid-answer cancels the reader,
//     but the model has already been paid for: the usage is still recorded;
//   * A METER FAILURE NEVER BREAKS THE ANSWER - same promise as trackedCreate;
//   * A FAILED STREAM IS NOT METERED AS A SUCCESS - an error before completion
//     reaches the caller and writes no row.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeCapDb } from './testkit/capDb.js';
import { trackedStream } from './lib/ai/usage.ts';
import { AiCapExceededError, AiCapUnavailableError, MONTHLY_CALL_CAPS, monthStartIso } from './lib/ai/callCaps.ts';
import { DEMO_TENANT_IDS } from './lib/demoTenants.ts';

const T = '11111111-1111-1111-1111-111111111111';
const NOW = new Date('2026-10-15T09:00:00Z');
const quiet = () => { const o = console.error, l = console.log; console.error = () => {}; console.log = () => {}; return () => { console.error = o; console.log = l; }; };
const row = (i: number, site: string, usd: number) => ({ id: `u${String(i).padStart(6, '0')}`, tenant_id: T, call_site: site, created_at: '2026-10-10T08:00:00Z', cost_usd: usd });
const capWorld = (rows: any[] = [], opts: any = {}) => { const alerts: any[] = []; return { client: makeCapDb({ ai_usage: rows }, opts) as any, alerts, alert: async (a: any) => { alerts.push(a); } }; };
const hooks = (w: any) => ({ capClient: w.client, capNow: NOW, capAlert: w.alert, capNoCache: true });

// A client whose stream yields the given chunks, then finishes with `usage`.
function fakeClient({ chunks = ['שלום', ', ', 'עולם'], usage = { input_tokens: 3000, output_tokens: 1500 }, failAfter = -1 } = {}) {
  const state = { streamCalls: 0, finalCalled: 0, params: null as any };
  return {
    state,
    messages: {
      stream(params: any) {
        state.streamCalls++; state.params = params;
        let delivered = 0;
        const events = (async function* () {
          yield { type: 'message_start' };
          yield { type: 'content_block_start', content_block: { type: 'thinking' } };
          yield { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: '' } };
          for (const c of chunks) {
            if (failAfter >= 0 && delivered === failAfter) throw new Error('stream broke');
            yield { type: 'content_block_delta', delta: { type: 'text_delta', text: c } };
            delivered++;
          }
        })();
        return Object.assign(events, {
          finalMessage: async () => { state.finalCalled++; return { content: [{ type: 'text', text: chunks.join('') }], usage, stop_reason: 'end_turn' }; },
        });
      },
    },
  } as any;
}
const insertDb = (opts: { fail?: boolean } = {}) => { const rows: any[] = []; return { rows, from: () => ({ insert: async (r: any) => { if (opts.fail) throw new Error('db down'); rows.push(r); return { error: null }; } }) } as any; };
const params = { model: 'claude-opus-5-5', max_tokens: 8000, messages: [{ role: 'user', content: 'hi' }] } as any;
const collect = async (it: AsyncIterable<string>) => { const out: string[] = []; for await (const x of it) out.push(x); return out; };

// ── deltas arrive in order, thinking is not shown, usage is recorded once ──
{
  const ai = fakeClient();
  const db = insertDb();
  const w = capWorld();
  const s = await trackedStream(ai, params, { tenantId: T, callSite: 'advisor', db, ...hooks(w) } as any);
  assert.equal(ai.state.streamCalls, 1);
  const got = await collect(s.deltas);
  assert.deepEqual(got, ['שלום', ', ', 'עולם'], 'only text deltas, in order - thinking blocks are not passed on');
  assert.equal(db.rows.length, 1, 'metered exactly once, when the answer is complete');
  assert.equal(db.rows[0].call_site, 'advisor');
  assert.equal(db.rows[0].input_tokens, 3000);
  assert.equal(db.rows[0].output_tokens, 1500, 'the output count includes thinking, as billed');
  assert.equal(db.rows[0].cost_usd, 0.042, '3000 in @ $4 + 1500 out @ $20 per MTok');
  assert.equal(s.message()?.stop_reason, 'end_turn');
}

// ── refused BEFORE the model is reached ────────────────────────────────────
{
  const cap = MONTHLY_CALL_CAPS['advisor'];
  const w = capWorld(Array.from({ length: cap }, (_, i) => row(i, 'advisor', 0.001)));
  const ai = fakeClient();
  const restore = quiet();
  await assert.rejects(() => trackedStream(ai, params, { tenantId: T, callSite: 'advisor', db: insertDb(), ...hooks(w) } as any),
    (e: any) => e instanceof AiCapExceededError && e.message.includes('בראשון לחודש'));
  restore();
  assert.equal(ai.state.streamCalls, 0, 'over the call cap: no stream was opened');
}
{
  const w = capWorld(Array.from({ length: 1500 }, (_, i) => row(i, i < 700 ? 'whatsapp-webhook' : i < 1100 ? 'score-lead' : 'marketing/shooting-list', 0.02)));
  const ai = fakeClient();
  const restore = quiet();
  await assert.rejects(() => trackedStream(ai, params, { tenantId: T, callSite: 'advisor', db: insertDb(), ...hooks(w) } as any), (e: any) => e instanceof AiCapExceededError && e.reason === 'dollars');
  restore();
  assert.equal(ai.state.streamCalls, 0, 'over the dollar ceiling: no stream was opened');
}
{
  const w = capWorld([], { failPage: () => true });
  const brokenCount = { from() { throw new Error('no database'); } };
  const ai = fakeClient();
  const restore = quiet();
  await assert.rejects(() => trackedStream(ai, params, { tenantId: T, callSite: 'advisor', db: insertDb(), capClient: brokenCount as any, capNow: NOW, capAlert: w.alert, capNoCache: true } as any), (e: any) => e instanceof AiCapUnavailableError);
  restore();
  assert.equal(ai.state.streamCalls, 0, 'an unreadable counter refuses before streaming');
  assert.equal(w.alerts.length, 1, 'and the operator is told');
}
{
  const ai = fakeClient();
  const restore = quiet();
  await assert.rejects(() => trackedStream(ai, params, { tenantId: DEMO_TENANT_IDS.cosmetics, callSite: 'advisor' } as any), /זו תצוגה/);
  restore();
  assert.equal(ai.state.streamCalls, 0, 'a demo tenant never opens a stream');
}

// ── she leaves mid-answer: the model was already paid for ──────────────────
{
  const ai = fakeClient({ chunks: ['א', 'ב', 'ג', 'ד'] });
  const db = insertDb();
  const s = await trackedStream(ai, params, { tenantId: T, callSite: 'advisor', db, ...hooks(capWorld()) } as any);
  const it = s.deltas[Symbol.asyncIterator]();
  assert.equal((await it.next()).value, 'א');
  await it.return?.(undefined as any); // the reader was cancelled
  assert.equal(db.rows.length, 1, 'usage is recorded even though the consumer stopped early');
  assert.equal(db.rows[0].output_tokens, 1500);
}

// ── a failing meter never breaks the answer ────────────────────────────────
{
  const ai = fakeClient();
  const s = await trackedStream(ai, params, { tenantId: T, callSite: 'advisor', db: insertDb({ fail: true }), ...hooks(capWorld()) } as any);
  const restore = quiet();
  const got = await collect(s.deltas);
  restore();
  assert.equal(got.join(''), 'שלום, עולם', 'she still gets her whole answer');
}

// ── a failed stream is not metered as a success ────────────────────────────
{
  const ai = fakeClient({ failAfter: 1 });
  const db = insertDb();
  const s = await trackedStream(ai, params, { tenantId: T, callSite: 'advisor', db, ...hooks(capWorld()) } as any);
  const restore = quiet();
  await assert.rejects(() => collect(s.deltas), /stream broke/);
  restore();
  assert.equal(db.rows.length, 0, 'an answer that never completed writes no usage row');
}

// ── near the limit: the warm heads-up is known before streaming starts ─────
{
  const cap = MONTHLY_CALL_CAPS['advisor'];
  const w = capWorld(Array.from({ length: Math.ceil(cap * 0.85) }, (_, i) => row(i, 'advisor', 0.001)));
  const s = await trackedStream(fakeClient(), params, { tenantId: T, callSite: 'advisor', db: insertDb(), ...hooks(w) } as any);
  assert.ok(s.capNotice && s.capNotice.includes('בראשון לחודש') && !/תקרה/.test(s.capNotice));
  void monthStartIso;
}

// ── the advisor really streams, end to end ─────────────────────────────────
{
  const code = (f: string) => fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const route = code('app/api/advisor/route.ts');
  assert.ok(route.includes('trackedStream('), 'the advisor route streams through trackedStream (metered, capped)');
  assert.ok(!route.includes('trackedCreate('), 'and no longer waits for the whole answer');
  assert.ok(/ndjson/.test(route), 'it answers with a stream');
  const ui = code('app/beautyos.jsx');
  const send = ui.slice(ui.indexOf('const sendAdvisor'), ui.indexOf('const uploadPostImage'));
  assert.ok(send.includes('getReader()'), 'the dashboard reads the answer as it arrives');
  assert.ok(send.includes('streaming'), 'and marks the message being written');
}

console.log('ai stream: ok');
