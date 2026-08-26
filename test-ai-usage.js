// test-ai-usage.js
//
// Tests for per-tenant AI usage metering. Run with plain node:
//
//     node test-ai-usage.js
//
// NO DATABASE. NO NETWORK. The supabase client and the Anthropic client are
// both injected fakes.
//
// ── The assertion that matters most ────────────────────────────────────────
// "a broken meter still returns the message". Everything else here is
// arithmetic; that one is the promise that metering can never cost a
// cosmetician her answer. It is tested against an insert that returns an
// error, an insert that throws, and a client that has no usage block at all.

import {
  trackedCreate,
  recordUsage,
  computeCost,
  extractUsage,
  MODEL_RATES,
} from './lib/ai/usage.ts';

// Bound before any silencing below, so a FAIL inside a quiet() block is still
// printed. Losing failure output to your own log-suppression is a very easy way
// to ship a red suite that looks green.
const OUT = console.log.bind(console);

let passed = 0;
let failed = 0;
const eq = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) passed++;
  else { failed++; OUT(`  FAIL  ${label}\n        got  ${a}\n        want ${b}`); }
};
const ok = (label, cond) => { if (cond) passed++; else { failed++; OUT(`  FAIL  ${label}`); } };
const group = (n) => OUT(`\n── ${n} ${'─'.repeat(Math.max(0, 56 - n.length))}`);

// Silence the module's own console noise so failures stand out.
const realLog = console.log, realErr = console.error;
const quiet = (fn) => async () => { console.log = () => {}; console.error = () => {}; try { return await fn(); } finally { console.log = realLog; console.error = realErr; } };

/** A supabase-shaped fake that records inserts. */
function makeDb({ failWith = null, throwOn = false } = {}) {
  const rows = [];
  return {
    rows,
    from() {
      return {
        insert(row) {
          if (throwOn) throw new Error('connection exploded');
          if (failWith) return Promise.resolve({ error: { message: failWith } });
          rows.push(row);
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

/** An Anthropic-shaped fake. */
// noUsage is a separate flag rather than `usage: undefined`, because passing
// undefined to a defaulted parameter selects the DEFAULT - so the "response
// carried no usage block" case would silently have tested the normal one.
function makeAnthropic({ usage = { input_tokens: 1000, output_tokens: 200 }, noUsage = false, throws = false } = {}) {
  const calls = [];
  return {
    calls,
    messages: {
      create: async (params) => {
        calls.push(params);
        if (throws) throw new Error('anthropic 500');
        const res = { id: 'msg_1', model: params.model, content: [{ type: 'text', text: 'ok' }] };
        if (!noUsage) res.usage = usage;
        return res;
      },
    },
  };
}

console.log('='.repeat(64));
console.log('AI usage metering');
console.log('NO database, NO network.');
console.log('='.repeat(64));

// ── 1. cost arithmetic ─────────────────────────────────────────────────────
group('computeCost');
{
  // Haiku 4.5: $1 / $5 per MTok.
  eq('haiku 1M in, 0 out', computeCost('claude-haiku-4-5', 1_000_000, 0), 1);
  eq('haiku 0 in, 1M out', computeCost('claude-haiku-4-5', 0, 1_000_000), 5);
  eq('haiku typical whatsapp call (1800/250)',
    computeCost('claude-haiku-4-5', 1800, 250), 0.003050);
  eq('dated haiku id prices identically',
    computeCost('claude-haiku-4-5-20251001', 1800, 250), computeCost('claude-haiku-4-5', 1800, 250));

  // Sonnet 4.5: $3 / $15 per MTok.
  eq('sonnet 1M in, 0 out', computeCost('claude-sonnet-4-5', 1_000_000, 0), 3);
  eq('sonnet marketing call (2000/2500)',
    computeCost('claude-sonnet-4-5', 2000, 2500), 0.043500);
  // Exactly 3x for an IDENTICAL call shape - both rates are 3x haiku's. The
  // ~14x figure in the capacity report compared DIFFERENT shapes (marketing
  // calls emit far more output than a WhatsApp reply), which is a different
  // claim; this asserts the rate ratio, not the workload ratio.
  const ratio = computeCost('claude-sonnet-4-5', 2000, 2500) / computeCost('claude-haiku-4-5', 2000, 2500);
  ok(`sonnet is 3x haiku for the same shape (got ${ratio.toFixed(4)})`, Math.abs(ratio - 3) < 1e-9);

  eq('zero tokens is zero, not null', computeCost('claude-haiku-4-5', 0, 0), 0);
  // A single cheap call must not round away to nothing.
  const tiny = computeCost('claude-haiku-4-5', 10, 5);
  ok(`a 15-token call still has a non-zero cost (${tiny})`, tiny > 0);

  eq('unknown model -> null, NOT 0', computeCost('claude-fictional-9', 1000, 1000), null);
  eq('undefined model -> null', computeCost(undefined, 10, 10), null);
  eq('non-numeric tokens treated as 0', computeCost('claude-haiku-4-5', null, undefined), 0);

  // Every model actually referenced in the codebase must have a rate.
  for (const m of ['claude-haiku-4-5', 'claude-haiku-4-5-20251001', 'claude-sonnet-4-5']) {
    ok(`${m} has a rate`, !!MODEL_RATES[m]);
  }
}

// ── 2. usage extraction ────────────────────────────────────────────────────
group('extractUsage');
{
  eq('normal response', extractUsage({ usage: { input_tokens: 12, output_tokens: 3 } }),
    { inputTokens: 12, outputTokens: 3 });
  eq('missing usage block', extractUsage({}), { inputTokens: 0, outputTokens: 0 });
  eq('null message', extractUsage(null), { inputTokens: 0, outputTokens: 0 });
  eq('partial usage', extractUsage({ usage: { input_tokens: 5 } }), { inputTokens: 5, outputTokens: 0 });
}

// ── 3. what actually gets written ──────────────────────────────────────────
group('recordUsage row shape');
await quiet(async () => {
  const db = makeDb();
  await recordUsage({
    tenantId: 'tenant-abc', callSite: 'advisor', model: 'claude-haiku-4-5',
    usage: { inputTokens: 3000, outputTokens: 600 }, db,
  });
  eq('one row written', db.rows.length, 1);
  const r = db.rows[0];
  eq('tenant_id', r.tenant_id, 'tenant-abc');
  eq('call_site', r.call_site, 'advisor');
  eq('model', r.model, 'claude-haiku-4-5');
  eq('input_tokens', r.input_tokens, 3000);
  eq('output_tokens', r.output_tokens, 600);
  eq('cost_usd computed at write time', r.cost_usd, 0.006);
  eq('attribution defaults to verified', r.attribution, 'verified');
  ok('no prompt or completion text is stored anywhere in the row',
    !JSON.stringify(r).toLowerCase().includes('text'));
})();

await quiet(async () => {
  const db = makeDb();
  await recordUsage({ tenantId: null, callSite: 'skin-scan', model: 'claude-haiku-4-5',
    usage: { inputTokens: 1, outputTokens: 1 }, attribution: 'claimed', db });
  eq('null tenant is written as null, not a sentinel', db.rows[0].tenant_id, null);
  eq('claimed attribution recorded', db.rows[0].attribution, 'claimed');

  const db2 = makeDb();
  await recordUsage({ tenantId: '', callSite: 'x', model: 'claude-haiku-4-5',
    usage: { inputTokens: 1, outputTokens: 1 }, db: db2 });
  eq('empty-string tenant normalises to null', db2.rows[0].tenant_id, null);

  const db3 = makeDb();
  await recordUsage({ tenantId: 't', callSite: 'x', model: 'claude-unknown-1',
    usage: { inputTokens: 100, outputTokens: 100 }, db: db3 });
  eq('unknown model still records tokens', db3.rows[0].input_tokens, 100);
  eq('unknown model leaves cost null', db3.rows[0].cost_usd, null);
})();

// ── 4. THE PROMISE: metering never breaks the feature ──────────────────────
group('a broken meter still returns the answer');
await quiet(async () => {
  const anthropic = makeAnthropic();

  // (a) the insert returns an error
  const m1 = await trackedCreate(anthropic, { model: 'claude-haiku-4-5', max_tokens: 10 },
    { tenantId: 't', callSite: 'advisor', db: makeDb({ failWith: 'permission denied' }) });
  eq('insert error -> message still returned', m1.content[0].text, 'ok');

  // (b) the insert throws outright
  const m2 = await trackedCreate(anthropic, { model: 'claude-haiku-4-5', max_tokens: 10 },
    { tenantId: 't', callSite: 'advisor', db: makeDb({ throwOn: true }) });
  eq('insert throw -> message still returned', m2.content[0].text, 'ok');

  // (c) recordUsage itself never rejects
  const r1 = await recordUsage({ callSite: 'x', model: 'claude-haiku-4-5', usage: {}, db: makeDb({ throwOn: true }) });
  eq('recordUsage reports failure rather than throwing', r1.ok, false);
  const r2 = await recordUsage({ callSite: 'x', model: 'claude-haiku-4-5', usage: {}, db: makeDb({ failWith: 'nope' }) });
  eq('insert error reported, not thrown', r2.ok, false);

  // (d) a response with no usage block at all
  const bare = makeAnthropic({ noUsage: true });
  const db4 = makeDb();
  const m4 = await trackedCreate(bare, { model: 'claude-haiku-4-5', max_tokens: 10 },
    { tenantId: 't', callSite: 'advisor', db: db4 });
  eq('no usage block -> message still returned', m4.content[0].text, 'ok');
  eq('and a zero-token row is still written', db4.rows[0].input_tokens, 0);
})();

// ── 5. a failed AI call is NOT metered ─────────────────────────────────────
group('API failure propagates and is not recorded');
await quiet(async () => {
  const anthropic = makeAnthropic({ throws: true });
  const db = makeDb();
  let threw = false;
  try {
    await trackedCreate(anthropic, { model: 'claude-haiku-4-5', max_tokens: 10 },
      { tenantId: 't', callSite: 'advisor', db });
  } catch { threw = true; }
  ok('the API error reaches the caller', threw);
  eq('nothing was metered for a call that never happened', db.rows.length, 0);
})();

// ── 6. the wrapper is a drop-in ────────────────────────────────────────────
group('trackedCreate passes through');
await quiet(async () => {
  const anthropic = makeAnthropic();
  const db = makeDb();
  const params = { model: 'claude-sonnet-4-5', max_tokens: 2048, system: 'sys', messages: [{ role: 'user', content: 'hi' }] };
  const msg = await trackedCreate(anthropic, params, { tenantId: 't1', callSite: 'marketing/strategy', db });
  eq('params reach the API untouched', anthropic.calls[0], params);
  eq('the response is returned unchanged', msg.id, 'msg_1');
  eq('model recorded from params', db.rows[0].model, 'claude-sonnet-4-5');
  eq('call_site recorded', db.rows[0].call_site, 'marketing/strategy');
})();

console.log('\n' + '='.repeat(64));
console.log(`  passed ${passed}   failed ${failed}`);
console.log('='.repeat(64));
if (failed > 0) process.exit(1);
