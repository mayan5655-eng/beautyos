// Proves the five outbound-action guards (lib/demoTenants.ts) refuse a demo
// tenant and touch nothing real - no network, no database - with injected
// fakes that throw if they are ever reached. Plain node, no real credentials.
import assert from 'node:assert/strict';
import { DEMO_TENANT_IDS } from './lib/demoTenants.ts';
import { DemoBlockedError } from './lib/ai/callCaps.ts';
import { sendWhatsApp } from './lib/whatsapp.js';
import { trackedCreate } from './lib/ai/usage.ts';
import { makeCapDb } from './testkit/capDb.js';
import { generateImage } from './lib/ai/openaiImages.ts';
import { issueForReceipt, creditForVoid } from './lib/legalReceipts/service.js';

const DEMO_ID = DEMO_TENANT_IDS.cosmetics;
const REAL_ID = '11111111-1111-1111-1111-111111111111';

// ── sendWhatsApp ─────────────────────────────────────────────────────────────
{
  const result = await sendWhatsApp('0501234567', 'hello', { tenantId: DEMO_ID, type: 'reminder' }) as { ok: boolean; demoBlocked?: boolean; error?: string };
  assert.equal(result.ok, false);
  assert.equal(result.demoBlocked, true);
  assert.equal(result.error, 'זו תצוגה - במערכת שלך זה באמת יישלח');
}

// ── trackedCreate ────────────────────────────────────────────────────────────
{
  const poisonedClient = {
    messages: { create: async () => { throw new Error('trackedCreate reached the real API for a demo tenant'); } },
  };
  await assert.rejects(
    () => trackedCreate(poisonedClient as any, { model: 'claude-haiku-4-5', max_tokens: 10, messages: [] } as any, { tenantId: DEMO_ID, callSite: 'test' }),
    (err: unknown) => err instanceof DemoBlockedError && err.message === 'זו תצוגה - במערכת שלך זה באמת יישלח'
  );
}

// ── generateImage ────────────────────────────────────────────────────────────
{
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error('generateImage reached the real API for a demo tenant'); }) as typeof fetch;
  try {
    await assert.rejects(
      () => generateImage({ prompt: 'x', tenantId: DEMO_ID, callSite: 'test' }),
      (err: unknown) => err instanceof DemoBlockedError
    );
  } finally {
    globalThis.fetch = realFetch;
  }
}

// ── legal receipts ───────────────────────────────────────────────────────────
{
  const poisonedDb = { from: () => { throw new Error('legal receipts reached the database for a demo tenant'); } };
  const issued = await issueForReceipt({ db: poisonedDb as any, tenantId: DEMO_ID, receiptId: 'r1', adapter: {} as any });
  assert.deepEqual(issued, { status: 'none', skipped: 'demo_blocked' });

  const credited = await creditForVoid({ db: poisonedDb as any, tenantId: DEMO_ID, voidId: 'v1', adapter: {} as any });
  assert.deepEqual(credited, { status: 'none', skipped: 'demo_blocked' });
}

// ── A real tenant is never affected by any of the above ─────────────────────
{
  // trackedCreate with a real tenant id passes the ceiling check (given a healthy
  // usage table) and reaches the client - proving the guard is demo-id-specific,
  // not a blanket block.
  const client = { messages: { create: async () => ({ usage: { input_tokens: 1, output_tokens: 1 } }) } };
  const healthy = makeCapDb({ ai_usage: [] });
  const message = await trackedCreate(client as any, { model: 'claude-haiku-4-5', max_tokens: 10, messages: [] } as any, { tenantId: REAL_ID, callSite: 'test', capClient: healthy, capNoCache: true } as any);
  assert.ok(message, 'a real tenant id is never blocked');

  // ...and with NO usable database the ceiling cannot be checked, so the call is
  // REFUSED (fails closed) - the model is never reached.
  let reached = false;
  const watched = { messages: { create: async () => { reached = true; return { usage: {} }; } } };
  const q = console.error; console.error = () => {};
  await assert.rejects(() => trackedCreate(watched as any, { model: 'claude-haiku-4-5', max_tokens: 10, messages: [] } as any, { tenantId: REAL_ID, callSite: 'test' }), /עצרנו לרגע/);
  console.error = q;
  assert.equal(reached, false, 'an unreadable ceiling refuses before the model is called');
}

console.log('demo blocked: ok');
