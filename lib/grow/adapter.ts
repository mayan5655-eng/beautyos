// lib/grow/adapter.ts
//
// SERVER ONLY. Which Grow the server talks to, behind one small interface, so the whole payment flow can be built, tested and demoed
// before Kalmea has any Grow credentials.
//
//   GROW_MODE=mock   (the default)  no network at all. createPaymentProcess answers with a payment page on OUR OWN origin
//                                   (/api/grow/mock-pay) where a tester presses "paid" or "failed"; that page then feeds the same
//                                   callback logic (lib/grow/service.ts) a real Grow notification would. Nobody is ever charged.
//   GROW_MODE=live                  the real API: platform keys from the environment (lib/grow/config.ts).
//
// Mock mode is refused on the Vercel PRODUCTION deployment (VERCEL_ENV=production), so a fake "paid" button can never run next to real
// clients by accident: there the answer is "not configured", exactly as when keys are missing.
//
// GROW_UI_ENABLED gates every Grow screen and every Grow route that a signed-in user can reach (default OFF). The callback routes that
// Grow itself calls are NOT behind it: a payment that really happened must always be recorded.
import { growPlatformStatus, growCredentials } from './config.ts';
import type { GrowEnv } from './config.ts';
import type { Creds } from './service.ts';
import { tenantRefOf } from './payload.ts';
import { createMockOps, createLiveOps } from './ops.ts';
import type { GrowOps } from './ops.ts';
import { signGrowSession } from './mockSession.ts';
import { pageCodesFromEnv } from './methods.ts';
import { tokenCredentials } from './tokenFlow.ts';
import type { TokenCreds } from './tokenFlow.ts';

export type GrowMode = 'mock' | 'live';

export const MOCK_API_BASE = 'https://mock.grow.invalid/api';

export function growMode(env: GrowEnv = process.env): GrowMode {
  return (env.GROW_MODE || '').trim().toLowerCase() === 'live' ? 'live' : 'mock';
}

/**
 * The Grow screens and signed-in routes are hidden unless this is switched on. Default: off.
 * GROW_ALLOWED_TENANTS (optional, comma-separated tenant ids) narrows it to those businesses: with it set, every other business sees nothing,
 * exactly as if the switch were off. Without it, the switch applies to everyone. Callers that know the business pass its id.
 */
export function growUiEnabled(env: GrowEnv = process.env, tenantId?: string | null): boolean {
  if (!/^(1|true|on|yes)$/i.test((env.GROW_UI_ENABLED || '').trim())) return false;
  const allowed = (env.GROW_ALLOWED_TENANTS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!allowed.length || tenantId === undefined) return true;
  return !!tenantId && allowed.includes(String(tenantId).toLowerCase());
}

export type GrowAdapter = {
  mode: GrowMode;
  configured: boolean;
  env: 'sandbox' | 'production';
  creds: Creds | null;
  /** The fetch the service must use: the in-process mock, or undefined for the real network. */
  fetchImpl?: typeof fetch;
  /** Card tokens, token charges and refunds (cancellation fees and deposits): the in-memory mock, or the real Grow calls. */
  ops?: GrowOps;
  /** Live only: the credentials of the saved-card (token) flows; sandbox uses the GROW_TOKEN_*_TEST triple. Null when they are not set. */
  tokenCreds?: TokenCreds | null;
  /** Why it is not configured, for the operator's logs (never shown to her). */
  reason?: string;
};

export function resolveGrow(env: GrowEnv = process.env, origin = ''): GrowAdapter {
  if (growMode(env) === 'live') {
    const s = growPlatformStatus(env);
    const tokenCreds = tokenCredentials(env);
    // Until the platform keys are issued, the saved-card page (credit card only) also serves the booking deposit page: the same apiKey, page code and base.
    const platform = growCredentials(env);
    const creds = platform ? { ...platform, pageCodes: pageCodesFromEnv(env) } : (tokenCreds ? { apiKey: tokenCreds.apiKey, pageCode: tokenCreds.pageCode, apiBase: tokenCreds.apiBase } : null);
    return { mode: 'live', configured: s.configured || !!tokenCreds, env: s.env, creds, tokenCreds, ops: tokenCreds ? createLiveOps(tokenCreds) : undefined, reason: s.configured ? undefined : `missing ${s.missing.join(', ')}` };
  }
  if ((env.VERCEL_ENV || '') === 'production') {
    return { mode: 'mock', configured: false, env: 'sandbox', creds: null, reason: 'mock mode is not allowed on the production deployment' };
  }
  return { mode: 'mock', configured: true, env: 'sandbox', creds: { apiKey: 'mock', pageCode: 'mock', apiBase: MOCK_API_BASE, pageCodes: { card: 'mock', bit: 'mock-bit', apple_pay: 'mock-apple', google_pay: 'mock-google' } }, fetchImpl: createMockFetch(origin), ops: createMockOps(origin, signGrowSession) };
}

const newId = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

/** A fetch that behaves like Grow's two server endpoints, in memory. */
export function createMockFetch(origin: string): typeof fetch {
  const base = origin.replace(/\/+$/, '');
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    if (url.endsWith('/createPaymentProcess')) {
      const sum = Number((init?.body as FormData | undefined)?.get?.('sum'));
      if (!Number.isFinite(sum) || sum <= 0) return json({ status: 0, err: { message: 'bad sum' } });
      const processId = newId('mockproc');
      return json({ status: 1, data: { processId, processToken: newId('mocktok'), url: `${base}/api/grow/mock-pay?p=${processId}` } });
    }
    if (url.endsWith('/approveTransaction')) return json({ status: 1, data: {} });
    return json({ status: 0, err: { message: 'unknown endpoint' } }, 404);
  }) as typeof fetch;
}

type PayLike = { id: string; tenant_id: string; amount: number | string; process_id: string | null };

/** What Grow's server-to-server callback looks like for a paid (statusCode 2) or refused (3) card, in the shape readNotification() reads. */
export function mockNotification(p: PayLike, result: 'success' | 'fail', transactionId = newId('mocktx')): Record<string, string> {
  return {
    'data[processId]': String(p.process_id),
    'data[transactionId]': transactionId,
    'data[transactionToken]': newId('mocktt'),
    'data[sum]': String(Number(p.amount)),
    'data[statusCode]': result === 'success' ? '2' : '3',
    'data[asmachta]': String(Math.floor(Math.random() * 9e6) + 1e6),
    'data[fullName]': 'Mock Payer',
    'data[customFields][cField1]': p.id,
    'data[customFields][cField2]': tenantRefOf(p.tenant_id),
  };
}

/** The document a real Grow sends after a paid transaction: a link and a number. The mock link points at our own sample page. */
export function mockInvoice(p: PayLike, origin: string, number = String(Math.floor(Math.random() * 90000) + 10000)): Record<string, unknown> {
  const base = origin.replace(/\/+$/, '');
  const link = /^https:\/\//i.test(base) ? `${base}/api/grow/mock-pay?doc=${p.id}` : `https://mock.grow.invalid/doc/${p.id}`;
  return {
    data: { processId: String(p.process_id), documentNumber: number, invoiceUrl: link, customFields: { cField2: tenantRefOf(p.tenant_id) } },
  };
}
