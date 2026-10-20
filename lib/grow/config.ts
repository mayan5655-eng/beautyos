// lib/grow/config.ts
//
// SERVER ONLY. What the platform side of the Grow (Meshulam) integration needs from the environment, and the
// honest answer to "can this deployment charge anything at all?".
//
//   GROW_API_KEY    the PLATFORM apiKey Grow issues to Kalmea (identifies the platform). Sent as a BODY field named apiKey:
//                   Grow refuses it as a header (error 701).
//   GROW_PAGE_CODE  the platform's card payment-page code (test and live values differ). Other methods (Bit, Apple Pay,
//                   Google Pay) have their own optional page codes: lib/grow/methods.ts.
//   GROW_ENV        'production' | anything else (= sandbox)
//   GROW_API_BASE   optional override of the API base URL. Defaults: sandbox https://sandbox.meshulam.co.il/api/light/server/1.0,
//                   production https://secure.meshulam.co.il/api/light/server/1.0 (developers.grow.business, "Live environment").
//
// Money never flows through Kalmea: every charge is created for the cosmetician's OWN Grow userId
// (grow_accounts.user_id). Nothing in this file talks to Grow; it only reads the environment, so it is safe to
// call from anywhere on the server and from tests.

export const GROW_SANDBOX_BASE = 'https://sandbox.meshulam.co.il/api/light/server/1.0';
export const GROW_PRODUCTION_BASE = 'https://secure.meshulam.co.il/api/light/server/1.0';

export type GrowEnv = Record<string, string | undefined>;

export type GrowPlatformStatus = {
  configured: boolean;
  env: 'sandbox' | 'production';
  /** Names of the missing environment variables, for the operator (never shown to her). */
  missing: string[];
  apiBase: string;
};

export function growPlatformStatus(env: GrowEnv = process.env): GrowPlatformStatus {
  const production = (env.GROW_ENV || '').trim().toLowerCase() === 'production';
  const override = (env.GROW_API_BASE || '').trim().replace(/\/+$/, '');
  const missing: string[] = [];
  if (!(env.GROW_API_KEY || '').trim()) missing.push('GROW_API_KEY');
  if (!(env.GROW_PAGE_CODE || '').trim()) missing.push('GROW_PAGE_CODE');
  let apiBase = override || (production ? GROW_PRODUCTION_BASE : GROW_SANDBOX_BASE);
  if (apiBase && !/^https:\/\//i.test(apiBase)) { missing.push('GROW_API_BASE (https)'); apiBase = ''; }
  return { configured: missing.length === 0, env: production ? 'production' : 'sandbox', missing, apiBase };
}

export function growCredentials(env: GrowEnv = process.env): { apiKey: string; pageCode: string; apiBase: string } | null {
  const s = growPlatformStatus(env);
  if (!s.configured) return null;
  return { apiKey: String(env.GROW_API_KEY).trim(), pageCode: String(env.GROW_PAGE_CODE).trim(), apiBase: s.apiBase };
}
