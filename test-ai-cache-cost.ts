// Prompt caching changes what a call costs: a cache WRITE bills at 1.25x the input rate and a cache READ at
// 0.1x, and the API reports both separately from input_tokens. computeCost must price each part, or the
// advisor (the one call site that caches) would be mis-metered against the dollar ceiling.
//
// Also: tenantIsBlocked, the plan check for the paths with no session (Facebook webhook, API-key intake).
import assert from 'node:assert/strict';
import { computeCost, extractUsage, CACHE_READ_MULTIPLIER, CACHE_WRITE_MULTIPLIER } from './lib/ai/usage.ts';
import { tenantIsBlocked } from './lib/tenantActive.ts';

let n = 0;
const ok = (name: string, fn: () => void | Promise<void>) => Promise.resolve(fn()).then(() => { n++; console.log('ok -', name); });

await ok('uncached call is priced exactly as before', () => {
  // opus-5-5: $4 in / $20 out per million
  assert.equal(computeCost('claude-opus-5-5', 1_000_000, 100_000), 4 + 2);
  assert.equal(computeCost('claude-opus-5-5', 1_000_000, 100_000, 0, 0), 6);
});

await ok('cache write is 1.25x input, cache read is 0.1x input', () => {
  assert.equal(CACHE_WRITE_MULTIPLIER, 1.25);
  assert.equal(CACHE_READ_MULTIPLIER, 0.1);
  // 1M cache-write tokens at $4/M * 1.25 = $5; 1M cache-read tokens at $4/M * 0.1 = $0.40
  assert.equal(computeCost('claude-opus-5-5', 0, 0, 1_000_000, 0), 5);
  assert.equal(computeCost('claude-opus-5-5', 0, 0, 0, 1_000_000), 0.4);
});

await ok('a cached repeat is cheaper than the first call', () => {
  const first = computeCost('claude-opus-5-5', 500, 800, 6000, 0)!;
  const repeat = computeCost('claude-opus-5-5', 500, 800, 0, 6000)!;
  assert.ok(repeat < first);
});

await ok('an unknown model is still null, never 0', () => {
  assert.equal(computeCost('some-new-model', 1000, 1000, 1000, 1000), null);
});

await ok('extractUsage reads the cache counts and tolerates their absence', () => {
  assert.deepEqual(extractUsage({ usage: { input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: 30, cache_read_input_tokens: 40 } }),
    { inputTokens: 10, outputTokens: 20, cacheWriteTokens: 30, cacheReadTokens: 40 });
  assert.deepEqual(extractUsage({ usage: { input_tokens: 1, output_tokens: 2 } }),
    { inputTokens: 1, outputTokens: 2 });
  assert.deepEqual(extractUsage(null), { inputTokens: 0, outputTokens: 0 });
});

const reader = (result: { data: unknown; error: unknown }) => ({
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => result }) }) }),
});

await ok('tenantIsBlocked: expired and paused are blocked, trial and active are not', async () => {
  assert.equal(await tenantIsBlocked(reader({ data: { plan_status: 'expired' }, error: null }), 't'), true);
  assert.equal(await tenantIsBlocked(reader({ data: { plan_status: 'paused' }, error: null }), 't'), true);
  assert.equal(await tenantIsBlocked(reader({ data: { plan_status: 'active' }, error: null }), 't'), false);
  const future = new Date(Date.now() + 5 * 864e5).toISOString();
  assert.equal(await tenantIsBlocked(reader({ data: { plan_status: 'trial', trial_ends_at: future }, error: null }), 't'), false);
  const past = new Date(Date.now() - 5 * 864e5).toISOString();
  assert.equal(await tenantIsBlocked(reader({ data: { plan_status: 'trial', trial_ends_at: past }, error: null }), 't'), true);
});

await ok('tenantIsBlocked fails open on an unreadable row', async () => {
  assert.equal(await tenantIsBlocked(reader({ data: null, error: { message: 'boom' } }), 't'), false);
  assert.equal(await tenantIsBlocked(reader({ data: null, error: null }), 't'), false);
  assert.equal(await tenantIsBlocked({ from: () => { throw new Error('no db'); } }, 't'), false);
});

console.log(`${n} passed`);
