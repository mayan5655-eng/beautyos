// checkInstanceState is what caught the real incident (2026-10-01: instance
// 7107629829 reading notAuthorized while GreenAPI's /sendMessage kept
// returning 200) - this proves it reads GreenAPI's own field correctly and
// degrades honestly when credentials or the network are missing. A real
// fetch is never made: globalThis.fetch is replaced for every case.
import assert from 'node:assert/strict';

const realFetch = globalThis.fetch;
const idInstance = process.env.GREENAPI_ID_INSTANCE;
const apiToken = process.env.GREENAPI_API_TOKEN;
const apiUrl = process.env.GREENAPI_API_URL;

function withFetch<T>(impl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  globalThis.fetch = impl;
  return fn().finally(() => { globalThis.fetch = realFetch; });
}

process.env.GREENAPI_ID_INSTANCE = '123';
process.env.GREENAPI_API_TOKEN = 'token';
delete process.env.GREENAPI_API_URL;
const { checkInstanceState } = await import('./lib/greenApi/health.ts');

// ── authorized ───────────────────────────────────────────────────────────────
await withFetch(
  (async () => new Response(JSON.stringify({ stateInstance: 'authorized' }), { status: 200 })) as typeof fetch,
  async () => {
    const r = await checkInstanceState();
    assert.deepEqual(r, { ok: true, authorized: true, stateInstance: 'authorized' });
  }
);

// ── the actual incident: notAuthorized reads as down, not a thrown error ────
await withFetch(
  (async () => new Response(JSON.stringify({ stateInstance: 'notAuthorized' }), { status: 200 })) as typeof fetch,
  async () => {
    const r = await checkInstanceState();
    assert.deepEqual(r, { ok: true, authorized: false, stateInstance: 'notAuthorized' });
  }
);

// ── HTTP failure ─────────────────────────────────────────────────────────────
await withFetch(
  (async () => new Response('server error', { status: 500 })) as typeof fetch,
  async () => {
    const r = await checkInstanceState();
    assert.equal(r.ok, false);
    assert.ok(!r.ok && /HTTP 500/.test(r.error));
  }
);

// ── network throw ────────────────────────────────────────────────────────────
await withFetch(
  (async () => { throw new Error('ECONNRESET'); }) as typeof fetch,
  async () => {
    const r = await checkInstanceState();
    assert.deepEqual(r, { ok: false, error: 'ECONNRESET' });
  }
);

// ── missing credentials never reach the network ─────────────────────────────
delete process.env.GREENAPI_ID_INSTANCE;
delete process.env.GREENAPI_API_TOKEN;
await withFetch(
  (async () => { throw new Error('should never be called without credentials'); }) as typeof fetch,
  async () => {
    const r = await checkInstanceState();
    assert.equal(r.ok, false);
    assert.ok(!r.ok && /not configured/.test(r.error));
  }
);

if (idInstance === undefined) delete process.env.GREENAPI_ID_INSTANCE; else process.env.GREENAPI_ID_INSTANCE = idInstance;
if (apiToken === undefined) delete process.env.GREENAPI_API_TOKEN; else process.env.GREENAPI_API_TOKEN = apiToken;
if (apiUrl === undefined) delete process.env.GREENAPI_API_URL; else process.env.GREENAPI_API_URL = apiUrl;

console.log('greenapi health: ok');
