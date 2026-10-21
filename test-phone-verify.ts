// One verified mobile per account (2026-10-21): the uniqueness rule, the SMS code flow, the rate limits, the signup
// ticket, who is asked and how firmly, the SMS adapters (no network: fetch is faked), and the wiring in the pages.
// The database half of the uniqueness rule (owner_phones primary key, claim_owner_phone, bump_phone_otp_attempt,
// grants) is dry-run in a real Postgres by scripts/smoke/owner-phone-sql.mjs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CODE_LENGTH, MAX_ATTEMPTS, SEND_LIMITS, PHONE_COPY_HE, FLAGS_OFF,
  codeMatches, cleanCode, decidePhoneGate, hashCode, newCode, sendRefusal, signupNeedsPhone,
  signupTicket, signupTicketValid, smsText, platformDailyCap, type PhoneFlags, type SendCounts,
} from './lib/phoneVerify/policy.ts';
import { MOCK_NUMBER, mockCode, sendSms, smsStatus } from './lib/phoneVerify/sms.ts';
import { phoneStatus, sendCode, signupConfig, verifyCode } from './lib/phoneVerify/service.ts';
import { memoryPhoneStore } from './lib/phoneVerify/memoryStore.ts';

const rd = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n');
let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };

const SECRET = 'test-secret';
const MOCK_ENV = { SMS_MODE: 'mock', SMS_MOCK_CODE: '424242', PHONE_OTP_SECRET: SECRET };
const ON: PhoneFlags = { signup: true, existing: true, since: '2026-10-21T00:00:00Z' };
const T0 = Date.parse('2026-10-22T10:00:00Z');
const P1 = '972500000001'; // the reserved fake range mock mode accepts
const P2 = '972500000002';

// The in-memory store mirrors the database's semantics (lib/phoneVerify/memoryStore.ts).
const memStore = (opts: { flags?: PhoneFlags | null; now?: () => number } = {}) => memoryPhoneStore({ flags: opts.flags === undefined ? ON : opts.flags, now: opts.now || (() => T0) });

// ── policy ─────────────────────────────────────────────────────────────────
await ok('codes are 6 random digits, leading zeros kept, and only their HMAC is stored', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) { const c = newCode(); assert.match(c, /^\d{6}$/); seen.add(c); }
  assert.ok(seen.size > 190, 'not a constant');
  const h = hashCode(SECRET, P1, '012345');
  assert.ok(!h.includes('012345'));
  assert.ok(codeMatches(SECRET, P1, '012345', h));
  assert.ok(codeMatches(SECRET, P1, ' 012-345 ', h), 'pasted with spaces or a dash');
  assert.ok(!codeMatches(SECRET, P2, '012345', h), 'a hash for one number proves nothing for another');
  assert.ok(!codeMatches('other-secret', P1, '012345', h));
  assert.ok(!codeMatches(SECRET, P1, '', ''));
  assert.equal(cleanCode('הקוד 123 456'), '123456');
  assert.equal(CODE_LENGTH, 6);
});

await ok('the SMS text starts with the code and fits one Hebrew SMS segment (70 chars)', () => {
  const t = smsText('123456');
  assert.ok(t.startsWith('123456'));
  assert.ok(t.length <= 70, String(t.length));
  assert.ok(t.includes('קלמיה'));
});

const zero: SendCounts = { sinceLastToPhoneMs: null, phoneLastHour: 0, phoneLastDay: 0, ipLastHour: 0, ipLastDay: 0, userLastDay: 0, platformLastDay: 0 };
await ok('rate limits: cooldown, per number, per device, per account, platform per day', () => {
  assert.equal(sendRefusal(zero), null);
  assert.equal(sendRefusal({ ...zero, sinceLastToPhoneMs: 30_000 }), 'cooldown');
  assert.equal(sendRefusal({ ...zero, sinceLastToPhoneMs: 61_000 }), null);
  assert.equal(sendRefusal({ ...zero, phoneLastHour: SEND_LIMITS.phonePerHour }), 'phone_limit');
  assert.equal(sendRefusal({ ...zero, phoneLastDay: SEND_LIMITS.phonePerDay }), 'phone_limit');
  assert.equal(sendRefusal({ ...zero, ipLastHour: SEND_LIMITS.ipPerHour }), 'ip_limit');
  assert.equal(sendRefusal({ ...zero, ipLastDay: SEND_LIMITS.ipPerDay }), 'ip_limit');
  assert.equal(sendRefusal({ ...zero, userLastDay: SEND_LIMITS.userPerDay }), 'user_limit');
  assert.equal(sendRefusal({ ...zero, platformLastDay: 300 }), 'platform_limit');
  assert.equal(sendRefusal({ ...zero, platformLastDay: 299 }), null);
  assert.equal(platformDailyCap({ SMS_DAILY_CAP: '50' }), 50);
  assert.equal(platformDailyCap({ SMS_DAILY_CAP: 'x' }), SEND_LIMITS.platformPerDay);
});

await ok('signup ticket: signed for one number, expires after 48 hours, cannot be forged or moved', () => {
  const t = signupTicket(SECRET, P1, T0);
  assert.ok(signupTicketValid(SECRET, P1, t, T0 + 47 * 3600_000));
  assert.ok(!signupTicketValid(SECRET, P1, t, T0 + 49 * 3600_000), 'expired');
  assert.ok(!signupTicketValid(SECRET, P2, t, T0), 'another number');
  assert.ok(!signupTicketValid('other', P1, t, T0), 'another key');
  assert.ok(!signupTicketValid(SECRET, P1, undefined, T0));
  assert.ok(!signupTicketValid(SECRET, P1, 'abc', T0));
});

await ok('who is asked: off by default, never without SMS, never demo, required only after the switch date', () => {
  const base = { flags: ON, smsReady: true, hasVerifiedPhone: false, isDemoTenant: false };
  assert.equal(decidePhoneGate({ ...base, flags: FLAGS_OFF, userCreatedAt: '2026-10-22T00:00:00Z' }), 'none');
  assert.equal(decidePhoneGate({ ...base, userCreatedAt: '2026-10-22T00:00:00Z' }), 'required');
  assert.equal(decidePhoneGate({ ...base, userCreatedAt: '2026-01-01T00:00:00Z' }), 'prompt', 'an older account is asked, with "later"');
  assert.equal(decidePhoneGate({ ...base, flags: { ...ON, existing: false }, userCreatedAt: '2026-01-01T00:00:00Z' }), 'none', 'the signup switch alone never nags older accounts');
  assert.equal(decidePhoneGate({ ...base, smsReady: false, userCreatedAt: '2026-10-22T00:00:00Z' }), 'none', 'a code that cannot arrive never blocks');
  assert.equal(decidePhoneGate({ ...base, isDemoTenant: true, userCreatedAt: '2026-10-22T00:00:00Z' }), 'none');
  assert.equal(decidePhoneGate({ ...base, hasVerifiedPhone: true, userCreatedAt: '2026-10-22T00:00:00Z' }), 'none');
  assert.equal(decidePhoneGate({ ...base, flags: { ...ON, since: null }, userCreatedAt: '2026-10-22T00:00:00Z' }), 'prompt', 'no stamp: nobody is hard-blocked');
  assert.equal(signupNeedsPhone(ON, true), true);
  assert.equal(signupNeedsPhone(ON, false), false);
  assert.equal(signupNeedsPhone(FLAGS_OFF, true), false);
});

await ok('the Hebrew: "already has an account" points to login and password recovery; feminine forms', () => {
  assert.match(PHONE_COPY_HE.taken, /כבר יש חשבון/);
  assert.match(PHONE_COPY_HE.taken, /להתחבר/);
  assert.match(PHONE_COPY_HE.taken, /לאפס/);
  assert.match(PHONE_COPY_HE.wrongCode(2), /2 ניסיונות/);
  assert.match(PHONE_COPY_HE.wrongCode(0), /בקשי קוד חדש/);
  for (const s of [PHONE_COPY_HE.phoneLimit, PHONE_COPY_HE.ipLimit, PHONE_COPY_HE.noCode]) assert.doesNotMatch(s, /נסה |בקש קוד|תבקש/, s);
});

// ── SMS adapters ───────────────────────────────────────────────────────────
await ok('SMS is off unless configured; mock is refused on production and on Vercel without SMS_MOCK_ALLOWED', () => {
  assert.equal(smsStatus({}).ready, false);
  assert.equal(smsStatus({ SMS_MODE: 'mock' }).ready, true);
  assert.equal(smsStatus({ SMS_MODE: 'mock', VERCEL_ENV: 'production', SMS_MOCK_ALLOWED: 'true' }).ready, false);
  assert.equal(smsStatus({ SMS_MODE: 'mock', VERCEL_ENV: 'preview' }).ready, false);
  assert.equal(smsStatus({ SMS_MODE: 'mock', VERCEL_ENV: 'preview', SMS_MOCK_ALLOWED: 'true' }).ready, true);
  assert.equal(smsStatus({ SMS_MODE: 'live' }).ready, false);
  assert.match(smsStatus({ SMS_MODE: 'live', SMS_PROVIDER: '019', SMS_019_TOKEN: 't' }).reason || '', /SMS_019_USERNAME, SMS_019_SOURCE/);
  assert.equal(smsStatus({ SMS_MODE: 'live', SMS_PROVIDER: '019', SMS_019_TOKEN: 't', SMS_019_USERNAME: 'u', SMS_019_SOURCE: 'Kalmea' }).ready, true);
  assert.equal(smsStatus({ SMS_MODE: 'live', SMS_PROVIDER: 'twilio', TWILIO_ACCOUNT_SID: 'a', TWILIO_AUTH_TOKEN: 'b', TWILIO_FROM: 'Kalmea' }).ready, true);
  assert.equal(mockCode({}), '123456');
  assert.equal(mockCode({ SMS_MOCK_CODE: '424242' }), '424242');
});

await ok('mock sends nothing and only to the fake 050-00000xx range (a preview runs on the production database)', async () => {
  let called = false;
  const f = (async () => { called = true; return new Response('{}'); }) as typeof fetch;
  assert.ok(MOCK_NUMBER.test(P1));
  assert.ok(!MOCK_NUMBER.test('972521234567'));
  assert.deepEqual(await sendSms(P1, 'x', { SMS_MODE: 'mock' }, f), { ok: true, status: 'mock', provider: 'mock' });
  const real = await sendSms('972521234567', 'x', { SMS_MODE: 'mock' }, f);
  assert.equal(real.ok, false);
  assert.equal(called, false);
});

await ok('019: Bearer token, documented JSON body, local number shape, status 0 = sent; anything else is a failure', async () => {
  const env = { SMS_MODE: 'live', SMS_PROVIDER: '019', SMS_019_TOKEN: 'tok', SMS_019_USERNAME: 'kalmea', SMS_019_SOURCE: 'Kalmea' };
  let seen: { url: string; init: RequestInit } | null = null;
  const good = (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response(JSON.stringify({ status: 0, message: 'SMS will be sent', shipment_id: '777' })); }) as unknown as typeof fetch;
  const r = await sendSms('972521234567', 'hello', env, good);
  assert.deepEqual(r, { ok: true, status: 'sent', provider: '019', ref: '777' });
  assert.equal(seen!.url, 'https://019sms.co.il/api');
  assert.equal((seen!.init.headers as Record<string, string>).Authorization, 'Bearer tok');
  const body = JSON.parse(String(seen!.init.body));
  assert.deepEqual(body, { sms: { user: { username: 'kalmea' }, source: 'Kalmea', destinations: { phone: [{ _: '0521234567' }] }, message: 'hello' } });
  const test = await sendSms('972521234567', 'hello', { ...env, SMS_019_TEST: 'true' }, good);
  assert.equal(test.ok, true);
  assert.equal(seen!.url, 'https://019sms.co.il/api/test');
  const noCredit = (async () => new Response(JSON.stringify({ status: 4, message: 'Not enough credit' }))) as unknown as typeof fetch;
  const bad = await sendSms('972521234567', 'hello', env, noCredit);
  assert.equal(bad.ok, false);
  assert.match((bad as { error: string }).error, /019 status 4/);
  const boom = (async () => { throw new Error('network down'); }) as unknown as typeof fetch;
  assert.equal((await sendSms('972521234567', 'hello', env, boom)).ok, false, 'never throws');
});

await ok('twilio: Basic auth, +E.164 To, sid = sent', async () => {
  const env = { SMS_MODE: 'live', SMS_PROVIDER: 'twilio', TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'sec', TWILIO_FROM: 'Kalmea' };
  let seen: { url: string; init: RequestInit } | null = null;
  const f = (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response(JSON.stringify({ sid: 'SM1' }), { status: 201 }); }) as unknown as typeof fetch;
  assert.deepEqual(await sendSms('972521234567', 'hi', env, f), { ok: true, status: 'sent', provider: 'twilio', ref: 'SM1' });
  assert.match(seen!.url, /Accounts\/AC1\/Messages\.json$/);
  assert.equal(new URLSearchParams(String(seen!.init.body)).get('To'), '+972521234567');
  assert.equal((seen!.init.headers as Record<string, string>).Authorization, 'Basic ' + Buffer.from('AC1:sec').toString('base64'));
});

// ── the flow, end to end on the in-memory store ──────────────────────────────────
await ok('signup: send, wrong code, right code -> a ticket; the first signed-in request claims the number', async () => {
  const store = memStore();
  const s = await sendCode({ store, env: MOCK_ENV, phone: '050-000-0001', purpose: 'signup', userId: null, ipHash: 'ip1', nowMs: T0 });
  assert.equal(s.status, 200, JSON.stringify(s.body));
  assert.equal(s.body.mock, true);
  assert.equal(store.otps.length, 1);
  assert.equal(store.otps[0].phone_e164, P1, 'stored normalized');
  assert.ok(!JSON.stringify(store.otps).includes('424242'), 'the code itself is never stored');

  const wrong = await verifyCode({ store, env: MOCK_ENV, phone: P1, code: '111111', purpose: 'signup', userId: null, tenantId: null, nowMs: T0 });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body.error, PHONE_COPY_HE.wrongCode(MAX_ATTEMPTS - 1));

  const right = await verifyCode({ store, env: MOCK_ENV, phone: '0500000001', code: '424 242', purpose: 'signup', userId: null, tenantId: null, nowMs: T0 });
  assert.equal(right.status, 200, JSON.stringify(right.body));
  assert.equal(right.body.phone, P1);
  const ticket = String(right.body.ticket);
  assert.ok(signupTicketValid(SECRET, P1, ticket, T0));

  const again = await verifyCode({ store, env: MOCK_ENV, phone: P1, code: '424242', purpose: 'signup', userId: null, tenantId: null, nowMs: T0 });
  assert.equal(again.status, 400, 'a code works once');

  const st = await phoneStatus({ store, env: MOCK_ENV, user: { id: 'u1', created_at: '2026-10-22T10:01:00Z', user_metadata: { phone_e164: P1, phone_ticket: ticket } }, tenantId: 't1', isDemoTenant: false, nowMs: T0 });
  assert.deepEqual(st, { gate: 'none', verified: true });
  assert.equal(store.owners.get(P1), 'u1');
});

await ok('UNIQUENESS: a second signup with the same number is refused before any SMS, with the Hebrew that points to login', async () => {
  const store = memStore();
  store.owners.set(P1, 'u1');
  const s = await sendCode({ store, env: MOCK_ENV, phone: P1, purpose: 'signup', userId: null, ipHash: 'ip2', nowMs: T0 });
  assert.equal(s.status, 409);
  assert.equal(s.body.code, 'taken');
  assert.equal(s.body.error, PHONE_COPY_HE.taken);
  assert.equal(store.otps.length, 0, 'no SMS for a number that cannot be used');
});

await ok('UNIQUENESS: a number held by a deleted account stays taken (no new trial by deleting and re-signing)', async () => {
  const store = memStore();
  store.owners.set(P1, null);
  const s = await sendCode({ store, env: MOCK_ENV, phone: P1, purpose: 'signup', userId: null, ipHash: 'ip', nowMs: T0 });
  assert.equal(s.body.code, 'taken');
});

await ok('UNIQUENESS: the same ticket reused on a second account is refused there, and that account is then required to verify', async () => {
  const store = memStore();
  await sendCode({ store, env: MOCK_ENV, phone: P1, purpose: 'signup', userId: null, ipHash: 'ip', nowMs: T0 });
  const v = await verifyCode({ store, env: MOCK_ENV, phone: P1, code: '424242', purpose: 'signup', userId: null, tenantId: null, nowMs: T0 });
  const meta = { phone_e164: P1, phone_ticket: String(v.body.ticket) };
  const first = await phoneStatus({ store, env: MOCK_ENV, user: { id: 'u1', created_at: '2026-10-22T10:00:00Z', user_metadata: meta }, tenantId: 't1', isDemoTenant: false, nowMs: T0 });
  assert.equal(first.verified, true);
  const second = await phoneStatus({ store, env: MOCK_ENV, user: { id: 'u2', created_at: '2026-10-22T10:05:00Z', user_metadata: meta }, tenantId: 't2', isDemoTenant: false, nowMs: T0 });
  assert.deepEqual(second, { gate: 'required', verified: false, note: 'ticket_taken' });
  assert.equal(store.owners.get(P1), 'u1');
});

await ok('UNIQUENESS: the number taken while the code was in flight is refused at verify', async () => {
  const store = memStore();
  await sendCode({ store, env: MOCK_ENV, phone: P1, purpose: 'signup', userId: null, ipHash: 'ip', nowMs: T0 });
  store.owners.set(P1, 'someone');
  const v = await verifyCode({ store, env: MOCK_ENV, phone: P1, code: '424242', purpose: 'signup', userId: null, tenantId: null, nowMs: T0 });
  assert.equal(v.status, 409);
  assert.equal(v.body.code, 'taken');
});

await ok('a forged ticket in her metadata claims nothing', async () => {
  const store = memStore();
  const st = await phoneStatus({ store, env: MOCK_ENV, user: { id: 'u9', created_at: '2026-10-22T10:00:00Z', user_metadata: { phone_e164: P1, phone_ticket: signupTicket('wrong-key', P1, T0) } }, tenantId: 't', isDemoTenant: false, nowMs: T0 });
  assert.deepEqual(st, { gate: 'required', verified: false, note: 'ticket_invalid' });
  assert.equal(store.owners.size, 0);
});

await ok('five wrong guesses use up a code; the sixth (even the right one) is refused', async () => {
  const store = memStore();
  await sendCode({ store, env: MOCK_ENV, phone: P1, purpose: 'signup', userId: null, ipHash: 'ip', nowMs: T0 });
  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    const r = await verifyCode({ store, env: MOCK_ENV, phone: P1, code: '000000', purpose: 'signup', userId: null, tenantId: null, nowMs: T0 });
    assert.equal(r.body.error, PHONE_COPY_HE.wrongCode(MAX_ATTEMPTS - i));
  }
  const last = await verifyCode({ store, env: MOCK_ENV, phone: P1, code: '424242', purpose: 'signup', userId: null, tenantId: null, nowMs: T0 });
  assert.equal(last.body.code, 'too_many');
});

await ok('an expired code is refused', async () => {
  let now = T0;
  const store = memStore({ now: () => now });
  await sendCode({ store, env: MOCK_ENV, phone: P1, purpose: 'signup', userId: null, ipHash: 'ip', nowMs: T0 });
  now = T0 + 11 * 60_000;
  const r = await verifyCode({ store, env: MOCK_ENV, phone: P1, code: '424242', purpose: 'signup', userId: null, tenantId: null, nowMs: now });
  assert.equal(r.body.code, 'no_code');
});

await ok('rate limits applied: a second code within a minute, then the hourly cap per number', async () => {
  let now = T0;
  const store = memStore({ now: () => now });
  const send = () => sendCode({ store, env: MOCK_ENV, phone: P1, purpose: 'signup', userId: null, ipHash: 'ip', nowMs: now });
  assert.equal((await send()).status, 200);
  now += 20_000;
  const quick = await send();
  assert.equal(quick.status, 429);
  assert.equal(quick.body.code, 'cooldown');
  assert.match(String(quick.body.error), /40 שניות/);
  for (let i = 1; i < SEND_LIMITS.phonePerHour; i++) { now += 61_000; assert.equal((await send()).status, 200, `send ${i + 1}`); }
  now += 61_000;
  const capped = await send();
  assert.equal(capped.body.code, 'phone_limit');
  assert.equal(store.otps.length, SEND_LIMITS.phonePerHour);
});

await ok('rate limits applied: one device cycling through numbers hits the per-device cap', async () => {
  let now = T0;
  const store = memStore({ now: () => now });
  let last = null as Awaited<ReturnType<typeof sendCode>> | null;
  for (let i = 0; i <= SEND_LIMITS.ipPerHour; i++) {
    now += 1000;
    last = await sendCode({ store, env: MOCK_ENV, phone: `9725000000${String(10 + i)}`, purpose: 'signup', userId: null, ipHash: 'one-device', nowMs: now });
  }
  assert.equal(last!.body.code, 'ip_limit');
  assert.equal(store.otps.length, SEND_LIMITS.ipPerHour);
});

await ok('nothing is sent while the switch is off, while SMS is off, or for a non-Israeli or malformed number', async () => {
  const off = memStore({ flags: FLAGS_OFF });
  assert.equal((await sendCode({ store: off, env: MOCK_ENV, phone: P1, purpose: 'signup', userId: null, ipHash: 'ip', nowMs: T0 })).status, 503);
  const missing = memStore({ flags: null }); // the migration has not run
  assert.equal((await sendCode({ store: missing, env: MOCK_ENV, phone: P1, purpose: 'signup', userId: null, ipHash: 'ip', nowMs: T0 })).status, 503);
  const on = memStore();
  assert.equal((await sendCode({ store: on, env: {}, phone: P1, purpose: 'signup', userId: null, ipHash: 'ip', nowMs: T0 })).status, 503);
  for (const bad of ['03-1234567', '+442071234567', 'abc', '']) {
    const r = await sendCode({ store: on, env: MOCK_ENV, phone: bad, purpose: 'signup', userId: null, ipHash: 'ip', nowMs: T0 });
    assert.equal(r.status, 400, bad);
  }
  assert.equal(off.otps.length + missing.otps.length + on.otps.length, 0);
});

await ok('a failed SMS is reported as failed, not as sent', async () => {
  const store = memStore();
  const env = { ...MOCK_ENV, SMS_MODE: 'live', SMS_PROVIDER: '019' }; // no token: not ready
  assert.equal((await sendCode({ store, env, phone: '0521234567', purpose: 'signup', userId: null, ipHash: 'ip', nowMs: T0 })).status, 503);
  const r = await sendCode({ store, env: MOCK_ENV, phone: '0521234567', purpose: 'signup', userId: null, ipHash: 'ip', nowMs: T0 }); // mock refuses a real number
  assert.equal(r.status, 502);
  assert.equal(r.body.error, PHONE_COPY_HE.sendFailed);
  assert.equal(store.otps[0].send_status, 'failed');
});

await ok('existing account: asked with "later"; verifying claims the number for her; another account cannot take it', async () => {
  const store = memStore();
  const old = { id: 'old1', created_at: '2026-03-01T00:00:00Z', user_metadata: {} };
  assert.deepEqual(await phoneStatus({ store, env: MOCK_ENV, user: old, tenantId: 't1', isDemoTenant: false, nowMs: T0 }), { gate: 'prompt', verified: false });
  assert.equal((await sendCode({ store, env: MOCK_ENV, phone: P2, purpose: 'verify', userId: 'old1', ipHash: 'ip', nowMs: T0 })).status, 200);
  const v = await verifyCode({ store, env: MOCK_ENV, phone: P2, code: '424242', purpose: 'verify', userId: 'old1', tenantId: 't1', nowMs: T0 });
  assert.deepEqual(v.body, { ok: true, verified: true });
  assert.equal(store.owners.get(P2), 'old1');
  assert.deepEqual(await phoneStatus({ store, env: MOCK_ENV, user: old, tenantId: 't1', isDemoTenant: false, nowMs: T0 }), { gate: 'none', verified: true });
  const other = await sendCode({ store, env: MOCK_ENV, phone: P2, purpose: 'verify', userId: 'old2', ipHash: 'ip9', nowMs: T0 + 120_000 });
  assert.equal(other.body.code, 'taken');
  const sameAgain = await sendCode({ store, env: MOCK_ENV, phone: P2, purpose: 'verify', userId: 'old1', ipHash: 'ip', nowMs: T0 + 120_000 });
  assert.deepEqual(sameAgain.body, { ok: true, alreadyVerified: true });
  const second = await sendCode({ store, env: MOCK_ENV, phone: P1, purpose: 'verify', userId: 'old1', ipHash: 'ip', nowMs: T0 + 120_000 });
  assert.equal(second.body.code, 'has_other');
});

await ok('a verify code belongs to the account that asked: another account cannot use it', async () => {
  const store = memStore();
  await sendCode({ store, env: MOCK_ENV, phone: P1, purpose: 'verify', userId: 'a', ipHash: 'ip', nowMs: T0 });
  const r = await verifyCode({ store, env: MOCK_ENV, phone: P1, code: '424242', purpose: 'verify', userId: 'b', tenantId: null, nowMs: T0 });
  assert.equal(r.body.code, 'no_code');
  assert.equal(store.owners.size, 0);
});

await ok('status fails open: an unreadable store or no SMS never blocks', async () => {
  const broken = memStore();
  broken.userPhone = async () => { throw new Error('relation "owner_phones" does not exist'); };
  assert.deepEqual(await phoneStatus({ store: broken, env: MOCK_ENV, user: { id: 'x', created_at: '2026-10-22T10:00:00Z' }, tenantId: null, isDemoTenant: false }), { gate: 'none', verified: false });
  assert.equal((await phoneStatus({ store: memStore(), env: {}, user: { id: 'x', created_at: '2026-10-22T10:00:00Z' }, tenantId: null, isDemoTenant: false })).gate, 'none');
  assert.deepEqual(await signupConfig(memStore({ flags: null }), MOCK_ENV), { phoneRequired: false, mock: true });
  assert.deepEqual(await signupConfig(memStore(), {}), { phoneRequired: false, mock: false });
  assert.deepEqual(await signupConfig(memStore(), MOCK_ENV), { phoneRequired: true, mock: true });
});

// ── wiring ─────────────────────────────────────────────────────────────────
await ok('the migration: the number is the primary key, normalized shape only, deleted accounts keep their number, no client writes', () => {
  const sql = rd('supabase/migrations/add_owner_phone_verification.sql');
  assert.match(sql, /phone_e164\s+text primary key/);
  assert.match(sql, /user_id\s+uuid unique references auth\.users\(id\) on delete set null/);
  assert.match(sql, /check \(phone_e164 ~ '\^9725\[0-9\]\{8\}\$'\)/);
  assert.match(sql, /revoke insert, update, delete on public\.owner_phones from anon, authenticated/);
  assert.match(sql, /revoke all on public\.phone_otp from anon, authenticated/);
  assert.match(sql, /phone_verify_signup\s+boolean not null default false/);
  assert.match(sql, /phone_verify_existing boolean not null default false/);
  assert.doesNotMatch(sql, /\bdrop table\b|\bdelete from\b|\btruncate\b/i);
});

await ok('the signup page asks the server, shows the phone step first, and stores number + ticket in the new account', () => {
  const page = rd('app/signup/page.tsx');
  assert.match(page, /fetch\('\/api\/phone\/config'/);
  assert.match(page, /<PhoneVerifyForm purpose="signup"/);
  assert.match(page, /phone_e164: phoneOk\.phone, phone_ticket: phoneOk\.ticket/);
  const form = rd('app/PhoneVerifyForm.tsx');
  assert.match(form, /href="\/login"/);
  assert.match(form, /href="\/login\?forgot=1"/);
  assert.match(form, /autoComplete="one-time-code"/);
  assert.match(rd('app/login/page.tsx'), /q\.get\('forgot'\) === '1'\) setMode\('forgot'\)/);
});

await ok('the prompt is mounted on every way into the app, and "later" exists only for the gentle prompt', () => {
  for (const f of ['app/BeautyOSLoader.tsx', 'app/dashboard/page.tsx', 'app/onboarding/page.tsx']) assert.match(rd(f), /<PhoneGate \/>/, f);
  const gate = rd('app/PhoneGate.tsx');
  assert.match(gate, /gate === 'prompt' \? \(\s*<button type="button" onClick=\{later\}/);
  assert.match(gate, /method: 'POST'/);
  assert.match(rd('app/api/phone/status/route.ts'), /if \(!smsStatus\(\)\.ready\) return NextResponse\.json\(\{ gate: 'none'/, 'dormant: no session or database work on each app load');
});

await ok('the test runner blanks every SMS credential', () => {
  const runner = rd('scripts/run-tests.mjs');
  for (const k of ['SMS_MODE', 'SMS_019_TOKEN', 'TWILIO_AUTH_TOKEN', 'PHONE_OTP_SECRET']) assert.match(runner, new RegExp(`${k}: ''`), k);
  assert.equal(process.env.SMS_019_TOKEN || '', '');
});

console.log(`\n${n} passed, 0 failed`);
