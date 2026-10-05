// Who gets past the page-level session gate.
//
// lib/supabase/sessionGate.ts replaces three network auth.getUser() calls (the
// proxy, app/dashboard/layout.tsx, app/page.tsx) with a local check of the
// access token's signature. This file is the contract for that swap and was
// written BEFORE it. It runs the REAL supabase-js client - real getSession,
// real getClaims, real JWT verification with WebCrypto - against a fake Auth
// server: a fetch stub that serves a JWKS for a key pair generated here, answers
// /auth/v1/user the way GoTrue would, and records every call. Nothing is mocked
// about the verification itself, so a forged token is rejected by the same
// code that rejects it in production.
//
// What must hold, and why each case exists:
//   * a genuine token passes with ZERO calls to /auth/v1/user (the whole point);
//   * a token signed by anyone else - same kid, same claims - does not pass;
//   * expired, no session, and an unreachable key server all fail CLOSED;
//   * alg:none and an HS256-signed forgery do not pass (supabase-js sends those
//     to the server to be checked; the server says no);
//   * a genuinely signed token that is NOT a signed-in user (the project's
//     anon key is exactly that: valid signature, role "anon", no subject) does
//     not pass. getUser() could never return a user for it; getClaims() will
//     happily return its claims, so the helper has to refuse it itself.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { verifiedUserFromSession } from './lib/supabase/sessionGate.ts';

const URL_ = 'https://testproject.supabase.co';
const KID = 'test-kid-1';
const b64u = (b: Uint8Array | string) => Buffer.from(b).toString('base64url');

const good = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const evil = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', good.publicKey)), kid: KID, alg: 'ES256', use: 'sig', key_ops: ['verify'] };

async function sign(key: CryptoKey, claims: Record<string, unknown>, header: Record<string, unknown> = { alg: 'ES256', typ: 'JWT', kid: KID }) {
  const input = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(claims))}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(input));
  return `${input}.${b64u(new Uint8Array(sig))}`;
}
const now = () => Math.floor(Date.now() / 1000);
const userClaims = (over: Record<string, unknown> = {}) => ({
  iss: `${URL_}/auth/v1`, aud: 'authenticated', role: 'authenticated', sub: '11111111-1111-1111-1111-111111111111',
  email: 'owner@example.com', iat: now() - 60, exp: now() + 3000, session_id: 'sess-1', ...over,
});

// supabase-js caches the signing key per storageKey for the life of the process
// (as it should), so a case that needs a COLD cache - the key server being down -
// uses its own storageKey.
type Opts = { jwksFails?: boolean; userStatus?: number; storageKey?: string; expiredInStore?: boolean; refreshTo?: string };
function harness(accessToken: string | null, opts: Opts = {}) {
  const key = opts.storageKey || 'sb-test-auth-token';
  const calls: string[] = [];
  const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? input.url : input);
    calls.push(`${init?.method || 'GET'} ${new globalThis.URL(u).pathname}`);
    if (u.includes('/.well-known/jwks.json')) {
      if (opts.jwksFails) throw new TypeError('network down');
      return new Response(JSON.stringify({ keys: [jwk] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('/auth/v1/user')) {
      const status = opts.userStatus ?? 401;
      return new Response(JSON.stringify(status === 200 ? { id: 'x' } : { code: status, msg: 'invalid JWT' }), { status, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('/auth/v1/token')) {
      if (opts.refreshTo) return new Response(JSON.stringify({ access_token: opts.refreshTo, refresh_token: 'r2', token_type: 'bearer', expires_in: 3600, expires_at: now() + 3600, user: { id: 'ignored', aud: 'authenticated' } }), { status: 200, headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ code: 400, msg: 'refresh token not found' }), { status: 400, headers: { 'content-type': 'application/json' } });
    }
    return new Response('{}', { status: 404 });
  };
  const store = new Map<string, string>();
  if (accessToken) {
    store.set(key, JSON.stringify({
      access_token: accessToken, refresh_token: 'r', token_type: 'bearer',
      expires_at: opts.expiredInStore ? now() - 10 : now() + 3000,
      user: { id: 'cookie-user-NOT-TRUSTED', email: 'cookie@example.com', aud: 'authenticated' },
    }));
  }
  const client = createClient(URL_, 'anon-key', {
    auth: {
      persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, storageKey: key,
      storage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
    },
    global: { fetch: fakeFetch as typeof fetch },
  });
  return { client, calls };
}
const userCalls = (calls: string[]) => calls.filter((c) => c.includes('/auth/v1/user'));

// 1. A genuine token passes, and nothing asks the Auth server about it.
{
  const { client, calls } = harness(await sign(good.privateKey, userClaims()));
  const u = await verifiedUserFromSession(client);
  assert.deepEqual(u && { id: u.id, email: u.email }, { id: '11111111-1111-1111-1111-111111111111', email: 'owner@example.com' });
  assert.equal(userCalls(calls).length, 0, 'a verified token must not cost a /auth/v1/user round trip');
}
// The identity comes from the VERIFIED claims, never from the user object stored beside the token in the cookie.
{
  const { client } = harness(await sign(good.privateKey, userClaims({ sub: '22222222-2222-2222-2222-222222222222' })));
  assert.equal((await verifiedUserFromSession(client))?.id, '22222222-2222-2222-2222-222222222222');
}

// 2. Same kid, same claims, someone else's key: rejected.
{
  const { client } = harness(await sign(evil.privateKey, userClaims()));
  assert.equal(await verifiedUserFromSession(client), null, 'forged signature must not pass');
}
// 2b. A real token with its payload swapped for another user's: rejected.
{
  const t = await sign(good.privateKey, userClaims());
  const [h, , s] = t.split('.');
  const forged = `${h}.${b64u(JSON.stringify(userClaims({ sub: '99999999-9999-9999-9999-999999999999' })))}.${s}`;
  const { client } = harness(forged);
  assert.equal(await verifiedUserFromSession(client), null, 'a tampered payload must not pass');
}

// 3. Fail closed: expired, no session, key server unreachable.
{
  const { client } = harness(await sign(good.privateKey, userClaims({ iat: now() - 7200, exp: now() - 3600 })));
  assert.equal(await verifiedUserFromSession(client), null, 'expired token must not pass');
}
{
  const { client, calls } = harness(null);
  assert.equal(await verifiedUserFromSession(client), null);
  assert.equal(calls.length, 0, 'no session means no network at all');
}
{
  const { client } = harness(await sign(good.privateKey, userClaims()), { jwksFails: true, storageKey: 'sb-cold-auth-token' });
  assert.equal(await verifiedUserFromSession(client), null, 'if the key cannot be fetched, nobody gets in');
}

// 4. Unsigned and symmetric forgeries go to the server, which refuses them.
{
  const unsigned = `${b64u(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${b64u(JSON.stringify(userClaims()))}.`;
  const { client, calls } = harness(unsigned);
  assert.equal(await verifiedUserFromSession(client), null, 'alg:none must not pass');
  assert.ok(userCalls(calls).length >= 1, 'an unsigned token is checked by the server, not trusted');
}
{
  const hs = `${b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64u(JSON.stringify(userClaims()))}.${b64u('not-a-real-mac')}`;
  const { client, calls } = harness(hs);
  assert.equal(await verifiedUserFromSession(client), null, 'a forged HS256 token must not pass');
  assert.ok(userCalls(calls).length >= 1);
}

// 5. Signed, valid, not expired - and not a signed-in user.
{
  const anon = await sign(good.privateKey, { iss: `${URL_}/auth/v1`, role: 'anon', iat: now() - 60, exp: now() + 3000 });
  const { client } = harness(anon);
  assert.equal(await verifiedUserFromSession(client), null, 'the anon key is a valid JWT and must never count as a user');
}
{
  const svc = await sign(good.privateKey, { iss: `${URL_}/auth/v1`, role: 'service_role', iat: now() - 60, exp: now() + 3000 });
  const { client } = harness(svc);
  assert.equal(await verifiedUserFromSession(client), null, 'a service-role token is not a user session either');
}
{
  const roleOnly = await sign(good.privateKey, userClaims({ role: 'anon' }));
  const { client } = harness(roleOnly);
  assert.equal(await verifiedUserFromSession(client), null, 'a subject is not enough: the role must be authenticated');
}
{
  const noSub = await sign(good.privateKey, userClaims({ sub: undefined }));
  const { client } = harness(noSub);
  assert.equal(await verifiedUserFromSession(client), null, 'authenticated role without a subject is not a user');
}

// 6. The proxy depends on the session REFRESH still happening: a session whose
// stored token has run out is renewed (and the renewed one is what is checked),
// and a refresh that fails is not a login.
{
  const fresh = await sign(good.privateKey, userClaims({ sub: '33333333-3333-3333-3333-333333333333' }));
  const { client, calls } = harness(await sign(good.privateKey, userClaims({ iat: now() - 7200, exp: now() - 3600 })), { expiredInStore: true, refreshTo: fresh, storageKey: 'sb-refresh-auth-token' });
  const u = await verifiedUserFromSession(client);
  assert.equal(u?.id, '33333333-3333-3333-3333-333333333333', 'an expired stored session is refreshed and the NEW token is what counts');
  assert.ok(calls.some((c) => c.includes('/auth/v1/token')), 'the refresh went to the Auth server');
}
{
  const { client } = harness(await sign(good.privateKey, userClaims({ iat: now() - 7200, exp: now() - 3600 })), { expiredInStore: true, storageKey: 'sb-refresh-fail-auth-token' });
  assert.equal(await verifiedUserFromSession(client), null, 'a refresh that fails is not a login');
}

// 7. What this swap touches, and what it must not. The three PAGE gates use the
// local check; every API route, the admin guard and every write still ask the
// Auth server with getUser(), so a revoked session is refused there at once.
import fs from 'node:fs';
const code = (f: string) => fs.readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '');
for (const f of ['lib/supabase/middleware.ts', 'app/dashboard/layout.tsx', 'app/page.tsx']) {
  assert.ok(code(f).includes('verifiedUserFromSession'), `${f} uses the session gate`);
  assert.ok(!/auth\.getUser\(/.test(code(f)), `${f} no longer calls auth.getUser()`);
}
const strict: string[] = [];
const walk = (dir: string) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx|js|jsx)$/.test(e.name) && /auth\.getUser\(/.test(code(p))) strict.push(p);
  }
};
walk('app/api');
assert.ok(strict.length >= 35, `API routes must keep getUser() (found ${strict.length})`);
for (const f of ['lib/adminGuard.ts', 'lib/legalReceipts/routeAuth.js']) {
  assert.ok(/auth\.getUser\(/.test(code(f)), `${f} still asks the Auth server`);
  assert.ok(!fs.readFileSync(f, 'utf8').includes('sessionGate'), `${f} does not use the local check`);
}

console.log('session gate: ok');
