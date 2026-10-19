// Saved cards (Grow tokens): the rules Grow set, as tests.
//   - credentials from the environment only (sandbox TEST triple / production names), never in the repository
//   - the three modes' requests; credit card only; apiKey as a body field; ONE identifier in a lookup
//   - transactionUniqueIdentifier: 32-bit numeric, saved in the ledger BEFORE the call, never reused; 1010 is looked up, never retried
//   - a token is charged only for the business AND client it was saved for, decided on the server
//   - the required consent tick: its words are stored, the server refuses without it
//   - the first token callback stores a sealed token and is approved once; later charges need neither
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  tokenCredentials, newUniqueIdentifier, groupIdentifierOf, buildSessionFields, buildTokenChargeFields, buildLookupFields, readEnvelope, readCardTokenNotification,
  CARD_CONSENT_TEXT_HE, GROW_ERR_DUPLICATE,
} from './lib/grow/tokenFlow.ts';
import { chargeSavedCard } from './lib/grow/tokenCharge.ts';
import type { LedgerRepo, LedgerRow, SavedCard } from './lib/grow/tokenCharge.ts';
import { createMockOps, newMockCardToken } from './lib/grow/ops.ts';
import type { GrowOps } from './lib/grow/ops.ts';
import { onCardTokenNotification } from './lib/grow/cancelFees.ts';
import type { Deps, CardConsentRow, TokenRow, CancelRepo } from './lib/grow/cancelFees.ts';

let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const T1 = '11111111-1111-1111-1111-111111111111';
const T2 = '22222222-2222-2222-2222-222222222222';

// ── credentials ──────────────────────────────────────────────────────────────
await ok('sandbox uses the GROW_TOKEN_*_TEST triple; production uses GROW_TOKEN_* with a given base; anything missing is "not configured"', () => {
  const test = { GROW_TOKEN_USER_ID_TEST: 'U', GROW_TOKEN_API_KEY_TEST: 'K', GROW_TOKEN_PAGE_CODE_TEST: 'P' };
  const c = tokenCredentials(test)!;
  assert.equal(c.env, 'sandbox'); assert.equal(c.userIdOverride, 'U'); assert.equal(c.apiKey, 'K'); assert.equal(c.pageCode, 'P'); assert.match(c.apiBase, /^https:\/\/sandbox\./);
  assert.equal(tokenCredentials({ ...test, GROW_TOKEN_API_KEY_TEST: '' }), null);
  assert.equal(tokenCredentials({}), null);
  assert.equal(tokenCredentials({ GROW_ENV: 'production', ...test }), null, 'the test values are never used in production');
  const p = tokenCredentials({ GROW_ENV: 'production', GROW_TOKEN_API_KEY: 'PK', GROW_TOKEN_PAGE_CODE: 'PP', GROW_API_BASE: 'https://live.example/api/' })!;
  assert.equal(p.env, 'production'); assert.equal(p.userIdOverride, undefined, 'production charges the cosmetician\'s own userId'); assert.equal(p.apiBase, 'https://live.example/api');
  assert.equal(tokenCredentials({ GROW_ENV: 'production', GROW_TOKEN_API_KEY: 'PK', GROW_TOKEN_PAGE_CODE: 'PP' }), null, 'production needs the base URL Grow gives');
});

await ok('no Grow credential is written in the repository, and the test names are the ones documented', () => {
  const SKIP = new Set(['node_modules', '.next', '.git', 'out', 'marketing']);
  const hits: string[] = [];
  const secrets = [['a80322a4', 'f13571a4'].join(''), ['20d53402', '843a'].join(''), ['e3047eb7', '4e2e'].join('')];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (SKIP.has(name) || name.startsWith('.env')) continue;
      const p = join(dir, name);
      const s = statSync(p);
      if (s.isDirectory()) walk(p);
      else if (/\.(ts|tsx|js|jsx|mjs|json|md|sql|txt|yml)$/.test(name) && s.size < 2_000_000) { const body = readFileSync(p, 'utf8'); if (secrets.some((x) => body.includes(x))) hits.push(p); }
    }
  };
  walk('.');
  assert.deepEqual(hits, [], 'the credentials live only in .env.local and Vercel');
  assert.ok(/GROW_TOKEN_USER_ID_TEST/.test(read('docs/GROW_SETUP.md')) && /GROW_TOKEN_PAGE_CODE_TEST/.test(read('docs/GROW_SETUP.md')), 'documented');
});

// ── requests ─────────────────────────────────────────────────────────────────
const creds = tokenCredentials({ GROW_TOKEN_USER_ID_TEST: 'U', GROW_TOKEN_API_KEY_TEST: 'K', GROW_TOKEN_PAGE_CODE_TEST: 'P' })!;
const obj = (f: [string, string][]) => Object.fromEntries(f);

await ok('save only: chargeType 3, sum 1, saveCardToken 1, the token page code, apiKey in the body, the callback URL and the echoes', () => {
  const f = obj(buildSessionFields(creds, { mode: 'save_only', userId: 'U', description: 'x', fullName: 'דנה כהן', phone: '0501234567', successUrl: 'https://k/', cancelUrl: 'https://k/', notifyUrl: 'https://k/api/grow/webhook', appointmentRef: 'ab-cd', tenantId: T1 }));
  assert.equal(f.chargeType, '3'); assert.equal(f.sum, '1'); assert.equal(f.saveCardToken, '1'); assert.equal(f.pageCode, 'P'); assert.equal(f.apiKey, 'K'); assert.equal(f.userId, 'U');
  assert.equal(f.notifyUrl, 'https://k/api/grow/webhook'); assert.equal(f.cField1, 'abcd'); assert.equal(f.cField2, T1.replace(/-/g, ''));
  assert.ok(!Object.keys(f).some((k) => /bit|apple|google|wallet/i.test(k)), 'no wallet is requested: credit card only');
});

await ok('charge and save: a regular charge (chargeType 1) for the real amount that also saves the token', () => {
  const f = obj(buildSessionFields(creds, { mode: 'charge_and_save', userId: 'U', amount: 120, description: 'x', fullName: 'דנה כהן', phone: '0501234567', successUrl: 'https://k/', cancelUrl: 'https://k/', notifyUrl: 'https://k/n', appointmentRef: 'a', tenantId: T1 }));
  assert.equal(f.chargeType, '1'); assert.equal(f.sum, '120.00'); assert.equal(f.saveCardToken, '1');
});

await ok('charge a token: cardToken, a numeric transactionUniqueIdentifier, an optional group; the lookup sends exactly ONE identifier', () => {
  const f = obj(buildTokenChargeFields(creds, { userId: 'U', cardToken: 'TOK', amount: 150, description: 'x', fullName: 'דנה כהן', phone: '0501234567', uniqueIdentifier: 123456789, groupIdentifier: 77 }));
  assert.equal(f.cardToken, 'TOK'); assert.equal(f.transactionUniqueIdentifier, '123456789'); assert.equal(f.transactionGroupIdentifier, '77'); assert.equal(f.sum, '150.00'); assert.equal(f.apiKey, 'K');
  const l = obj(buildLookupFields(creds, { userId: 'U', cardToken: 'TOK', uniqueIdentifier: 123456789 }));
  assert.equal(l.transactionUniqueIdentifier, '123456789'); assert.ok(!('transactionGroupIdentifier' in l), 'never both identifiers');
});

await ok('identifiers: whole numbers Grow accepts (positive, no leading zero, below 4,294,967,295), different on every draw, stable per group', () => {
  const seen = new Set<number>();
  for (let i = 0; i < 2000; i++) { const id = newUniqueIdentifier(); assert.ok(Number.isInteger(id) && id >= 100000000 && id < 4294967295); seen.add(id); }
  assert.ok(seen.size > 1990, 'no repeats in practice');
  assert.equal(groupIdentifierOf('appt-1'), groupIdentifierOf('appt-1')); assert.notEqual(groupIdentifierOf('appt-1'), groupIdentifierOf('appt-2'));
  assert.ok(groupIdentifierOf('x'.repeat(200)) < 2147483647);
});

await ok('Grow\'s answer envelope: status, error id and message, data', () => {
  const e = readEnvelope({ status: 0, err: { id: 1010, message: 'dup' }, data: '' });
  assert.equal(e.ok, false); assert.equal(e.errId, GROW_ERR_DUPLICATE); assert.deepEqual(e.data, {});
  assert.equal(readEnvelope({ status: 1, err: '', data: { transactionId: 5 } }).ok, true);
});

// ── the charge service ───────────────────────────────────────────────────────
function ledgerWorld() {
  const rows: LedgerRow[] = [];
  const log: string[] = [];
  const ledger: LedgerRepo = {
    async insertCharge(r) { if (rows.some((x) => x.unique_identifier === r.unique_identifier)) { log.push('conflict'); return null; } const row = { id: `L${rows.length + 1}`, status: 'initiated', grow_error_id: null, error: null, transaction_id: null, transaction_token: null, asmachta: null, looked_up: false, ...r } as LedgerRow; rows.push(row); log.push('insert'); return row; },
    async updateCharge(id, patch) { Object.assign(rows.find((x) => x.id === id)!, patch); log.push('update:' + (patch.status || '')); },
  };
  const base = createMockOps('https://preview.kalmea.test', () => 's');
  const calls = { charge: 0, lookup: 0 };
  let over: Partial<GrowOps> = {};
  const ops: GrowOps = {
    createTokenSession: (i) => base.createTokenSession(i),
    async chargeToken(i) { calls.charge++; log.push('grow-charge'); return (over.chargeToken || base.chargeToken)(i); },
    async lookupToken(i) { calls.lookup++; log.push('grow-lookup'); return (over.lookupToken || base.lookupToken)(i); },
    refund: (i) => base.refund(i),
  };
  return { rows, log, ledger, ops, calls, over: (o: Partial<GrowOps>) => { over = o; } };
}
const card = (over: Partial<SavedCard> = {}): SavedCard => ({ id: 'tok1', tenant_id: T1, client_id: 'c-dana', token: newMockCardToken('ok'), ...over });
const input = (c: SavedCard, over: Record<string, unknown> = {}) => ({ tenantId: T1, clientId: 'c-dana', appointmentId: 'appt-1', card: c, userId: 'GU1', amount: 100, description: 'ביטול מאוחר', purpose: 'fee', fullName: 'דנה כהן', phone: '0501234567', ...over });

await ok('the identifier is saved in the ledger BEFORE Grow is called, and the answer is recorded', async () => {
  const w = ledgerWorld();
  const r = await chargeSavedCard({ ops: w.ops, ledger: w.ledger }, input(card()));
  assert.equal(r.ok, true);
  assert.deepEqual(w.log.slice(0, 2), ['insert', 'grow-charge'], 'insert first, then the call');
  assert.equal(w.rows.length, 1); assert.equal(w.rows[0].status, 'succeeded'); assert.ok(w.rows[0].transaction_id); assert.ok(Number.isInteger(w.rows[0].unique_identifier));
  assert.equal(w.rows[0].group_identifier, groupIdentifierOf('appt-1'));
});

await ok('a token is charged only for its own business AND client: any mismatch never reaches Grow', async () => {
  for (const [name, c, over] of [
    ['another business', card({ tenant_id: T2 }), {}],
    ['another client', card({ client_id: 'c-other' }), {}],
    ['a token with no client', card({ client_id: null }), {}],
    ['an appointment with no client', card(), { clientId: null }],
    ['a revoked card', card({ revoked_at: '2026-10-01T00:00:00Z' }), {}],
  ] as [string, SavedCard, Record<string, unknown>][]) {
    const w = ledgerWorld();
    const r = await chargeSavedCard({ ops: w.ops, ledger: w.ledger }, input(c, over));
    assert.equal(r.ok, false, name); assert.equal((r as { code: string }).code, 'wrong-owner', name);
    assert.equal(w.calls.charge, 0, `${name}: Grow was not called`); assert.equal(w.rows.length, 0, `${name}: nothing in the ledger`);
  }
});

await ok('a refused charge keeps its identifier spent: the next attempt draws a NEW one', async () => {
  const w = ledgerWorld();
  const declined = await chargeSavedCard({ ops: w.ops, ledger: w.ledger }, input(card({ token: newMockCardToken('decline') })));
  assert.equal(declined.ok, false); assert.equal((declined as { code: string }).code, 'declined');
  const again = await chargeSavedCard({ ops: w.ops, ledger: w.ledger }, input(card()));
  assert.equal(again.ok, true);
  assert.equal(w.rows.length, 2); assert.notEqual(w.rows[0].unique_identifier, w.rows[1].unique_identifier); assert.equal(w.rows[0].status, 'failed'); assert.equal(w.rows[1].status, 'succeeded');
});

await ok('a colliding identifier is redrawn before anything is sent', async () => {
  const w = ledgerWorld();
  const seq = [500000001, 500000001, 500000002];
  await chargeSavedCard({ ops: w.ops, ledger: w.ledger, newId: () => seq.shift()! }, input(card()));
  const r2 = await chargeSavedCard({ ops: w.ops, ledger: w.ledger, newId: () => seq.length ? seq.shift()! : 500000009 }, input(card(), { appointmentId: 'appt-2' }));
  assert.equal(r2.ok, true); assert.deepEqual(w.rows.map((x) => x.unique_identifier), [500000001, 500000002]); assert.ok(w.log.includes('conflict'));
});

await ok('error 1010: NOT retried; the transaction is looked up by that one identifier and the real result recorded', async () => {
  const w = ledgerWorld();
  w.over({
    chargeToken: async () => ({ ok: false, code: 'duplicate', errId: 1010, error: 'dup' }),
    lookupToken: async (i) => { assert.ok(Number.isInteger(i.uniqueIdentifier)); return { ok: true, found: true, status: 'paid', transactionId: 'TX9', transactionToken: 'TT9', asmachta: '555' }; },
  });
  const r = await chargeSavedCard({ ops: w.ops, ledger: w.ledger }, input(card()));
  assert.equal(w.calls.charge, 1, 'one attempt, no retry'); assert.equal(w.calls.lookup, 1);
  assert.equal(r.ok, true); assert.equal((r as { recovered: boolean }).recovered, true);
  assert.equal(w.rows[0].status, 'succeeded'); assert.equal(w.rows[0].transaction_id, 'TX9'); assert.equal(w.rows[0].looked_up, true);

  const w2 = ledgerWorld();
  w2.over({ chargeToken: async () => ({ ok: false, code: 'duplicate', errId: 1010, error: 'dup' }), lookupToken: async () => ({ ok: true, found: true, status: 'failed' }) });
  const f = await chargeSavedCard({ ops: w2.ops, ledger: w2.ledger }, input(card()));
  assert.equal(f.ok, false); assert.equal(w2.rows[0].status, 'failed'); assert.equal(w2.calls.charge, 1);

  const w3 = ledgerWorld();
  w3.over({ chargeToken: async () => ({ ok: false, code: 'duplicate', errId: 1010, error: 'dup' }), lookupToken: async () => ({ ok: true, found: false, status: 'unknown' }) });
  const u = await chargeSavedCard({ ops: w3.ops, ledger: w3.ledger }, input(card()));
  assert.equal((u as { code: string }).code, 'unknown'); assert.equal(w3.rows[0].status, 'unknown'); assert.equal(w3.calls.charge, 1, 'still no retry');
});

await ok('the same identifier sent twice to the mock answers duplicate, like Grow', async () => {
  const mock = createMockOps('https://x.test', () => 's');
  const base = { userId: 'GU', tokenRef: newMockCardToken('ok'), amount: 10, description: 'x', uniqueIdentifier: 777000001 };
  assert.equal((await mock.chargeToken(base)).ok, true);
  const dup = await mock.chargeToken(base);
  assert.equal(dup.ok, false); assert.equal((dup as { code: string }).code, 'duplicate'); assert.equal((dup as { errId?: number }).errId, 1010);
  const l = await mock.lookupToken({ userId: 'GU', tokenRef: base.tokenRef, uniqueIdentifier: 777000001 });
  assert.equal(l.ok && l.found && l.status, 'paid');
});

await ok('a network failure is looked up, never blindly retried; unsettled means "unknown", not "failed"', async () => {
  const w = ledgerWorld();
  w.over({ chargeToken: async () => ({ ok: false, code: 'unreachable', error: 'down' }), lookupToken: async () => ({ ok: false, code: 'unreachable', error: 'down' }) });
  const r = await chargeSavedCard({ ops: w.ops, ledger: w.ledger }, input(card()));
  assert.equal((r as { code: string }).code, 'unknown'); assert.equal(w.rows[0].status, 'unknown'); assert.equal(w.calls.charge, 1);
});

// ── the first callback ───────────────────────────────────────────────────────
const callback = (over: Record<string, string> = {}) => ({
  'data[processId]': '804790', 'data[cardToken]': 'GROWTOKENabc123', 'data[cardSuffix]': '4580', 'data[cardBrand]': 'Visa', 'data[cardExp]': '1230',
  'data[transactionId]': '559100', 'data[transactionToken]': 'TT', 'data[asmachta]': '777', 'data[customFields][cField1]': 'appt1', 'data[customFields][cField2]': T1.replace(/-/g, ''), ...over,
});

function callbackWorld() {
  const consents: CardConsentRow[] = [];
  const tokens: TokenRow[] = [];
  const policyConsents: { id: string; tenant_id: string; appointment_id: string; client_id: string | null; mode: string; token_id: string | null; status: string }[] = [{ id: 'pc1', tenant_id: T1, appointment_id: 'appt-1', client_id: 'c-dana', mode: 'saved_card', token_id: null, status: 'awaiting_card' }];
  consents.push({ id: 'cc1', tenant_id: T1, appointment_id: 'appt-1', client_id: 'c-dana', consent_text: CARD_CONSENT_TEXT_HE, consent_version: 'card-save-v1', consented_at: '2026-11-10T06:00:00Z', mode: 'save_only', process_id: '804790', process_token: 'PT', status: 'awaiting', token_id: null });
  const repo = {
    async getConsent(_t: string, id: string) { return (policyConsents.find((c) => c.appointment_id === id) as never) || null; },
    async updateConsent(id: string, patch: Record<string, unknown>) { Object.assign(policyConsents.find((c) => c.id === id)!, patch); },
    async insertToken(row: Omit<TokenRow, 'id'>) { const t = { id: `tk${tokens.length + 1}`, ...row } as TokenRow; tokens.push(t); return t; },
    async findCardConsentByProcess(pid: string) { return consents.find((c) => c.process_id === pid) || null; },
    async updateCardConsent(id: string, patch: Partial<CardConsentRow>) { Object.assign(consents.find((c) => c.id === id)!, patch); },
  } as unknown as CancelRepo;
  const deps = { repo, seal: { encrypt: (s: string) => `sealed(${s.split('').reverse().join('')})`, decrypt: (s: string) => s.slice(7, -1).split('').reverse().join('') } } as unknown as Deps;
  return { deps, consents, tokens, policyConsents };
}

await ok('the first token callback stores a SEALED token for the business and client of the page we opened, then approves once', async () => {
  const w = callbackWorld();
  let approved = 0;
  const parsed = readCardTokenNotification(callback())!;
  assert.equal(parsed.cardToken, 'GROWTOKENabc123'); assert.equal(parsed.last4, '4580');
  const r = await onCardTokenNotification(w.deps, parsed, async () => { approved++; });
  assert.equal(r.status, 'saved'); assert.equal(approved, 1);
  assert.equal(w.tokens.length, 1);
  assert.equal(w.tokens[0].tenant_id, T1); assert.equal(w.tokens[0].client_id, 'c-dana', 'the client comes from the consent row, not the callback');
  assert.ok(!w.tokens[0].token_ref.includes('GROWTOKEN'), 'stored sealed, not in the clear'); assert.equal(w.tokens[0].token_encrypted, true);
  assert.equal(w.consents[0].status, 'saved'); assert.equal(w.policyConsents[0].status, 'card_saved');
  const again = await onCardTokenNotification(w.deps, parsed, async () => { approved++; });
  assert.equal(again.status, 'already-saved'); assert.equal(w.tokens.length, 1, 'a repeated callback stores nothing twice');
});

await ok('a callback for a process we never opened, or naming another business or booking, stores nothing', async () => {
  for (const [label, body, want] of [
    ['unknown process', callback({ 'data[processId]': '999' }), 'unknown-process'],
    ['another business', callback({ 'data[customFields][cField2]': T2.replace(/-/g, '') }), 'mismatch'],
    ['another booking', callback({ 'data[customFields][cField1]': 'other' }), 'mismatch'],
  ] as [string, Record<string, string>, string][]) {
    const w = callbackWorld();
    const r = await onCardTokenNotification(w.deps, readCardTokenNotification(body)!, async () => { throw new Error('must not approve'); });
    assert.equal(r.status, want, label); assert.equal(w.tokens.length, 0, label);
  }
  assert.equal(readCardTokenNotification({ 'data[processId]': '1' }), null, 'no token in it');
});

// ── wiring (source pins) ─────────────────────────────────────────────────────
await ok('the booking page asks for the card tick in plain Hebrew, blocks submission until it is ticked, and the server refuses without it', () => {
  assert.ok(CARD_CONSENT_TEXT_HE.length > 60 && /כרטיס האשראי/.test(CARD_CONSENT_TEXT_HE) && /לחייב אותו בעתיד/.test(CARD_CONSENT_TEXT_HE));
  const page = read('app/BookingPage.jsx');
  assert.ok(/needsCardTick = needsPolicy && growPolicy\.mode === "saved_card"/.test(page));
  assert.ok(/needsCardTick && !cardOk/.test(page) && /acceptedCardSave: needsCardTick/.test(page));
  assert.ok(/data-testid="grow-card-consent"/.test(page) && /CARD_CONSENT_TEXT_HE/.test(page));
  const route = read('app/api/book-appointment/route.js');
  assert.ok(/policy\.mode === "saved_card" && acceptedCardSave !== true/.test(route), 'server side');
  assert.ok(/cardConsentText: CARD_CONSENT_TEXT_HE/.test(route), 'the exact words are stored with the consent');
  const cf = read('lib/grow/cancelFees.ts');
  assert.ok(/insertCardConsent\(\{[\s\S]*consent_text: i\.cardConsentText \|\| CARD_CONSENT_TEXT_HE[\s\S]*consented_at/.test(cf), 'words, time, tenant and client are stored');
});

await ok('nothing from the browser decides who is charged: decide() reads the client from the appointment in the database', () => {
  const cf = read('lib/grow/cancelFees.ts');
  const decide = cf.slice(cf.indexOf('export async function decide('), cf.indexOf('// ── deposit holds'));
  assert.ok(/getAppointment\(i\.tenantId, item\.appointment_id\)/.test(decide) && /clientId: appt\?\.client_id \?\? null/.test(decide));
  const feesRoute = read('app/api/grow/fees/decide/route.ts');
  assert.ok(!/token|clientId|client_id/i.test(feesRoute.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')), 'the fee route takes only the fee id and the decision');
});

await ok('the webhook stores the first token before the normal payment logic, and the token is sealed with the existing key', () => {
  const route = read('app/api/grow/webhook/route.ts');
  assert.ok(route.indexOf('await onCardTokenNotification(') > -1 && route.indexOf('await onCardTokenNotification(') < route.indexOf('await applyNotificationByProcess('));
  const cancel = read('app/api/grow/_cancel.ts');
  assert.ok(/encryptToken, decryptToken/.test(cancel) && /seal: \{ encrypt: encryptToken, decrypt: decryptToken \}/.test(cancel));
});

await ok('the new tables: tenant-scoped RLS, in the trial gate, the token and process token never granted, the identifier unique, migration only adds', () => {
  const mig = read('supabase/migrations/add_grow_tokens.sql');
  const code = mig.replace(/^--.*$/gm, '');
  for (const t of ['grow_card_consents', 'grow_token_charges']) {
    assert.ok(mig.includes(`'${t}'`), `${t} gated and RLS-enabled`);
    assert.ok(read('trial-gate-policies.sql').includes(`'${t}'`), `${t} is in trial-gate-policies.sql`);
    assert.ok(read('lib/referencedTables.js').includes(`'${t}'`), `${t} is in the referenced tables`);
  }
  assert.ok(/tenant_id = public\.get_user_tenant_id\(\)/.test(mig) && /as restrictive for insert/.test(mig) && /is_tenant_active\(\)/.test(mig));
  assert.ok(/create unique index if not exists grow_token_charges_unique_identifier_uniq on public\.grow_token_charges \(unique_identifier\)/.test(mig));
  const consentGrant = mig.match(/grant select \(([^)]*)\) on public\.grow_card_consents/)!;
  assert.ok(!/process_token/.test(consentGrant[1]), 'Grow\'s process token is not granted');
  const tokenGrant = mig.match(/grant select \(([^)]*)\) on public\.grow_card_tokens/)!;
  assert.ok(!/token_ref/.test(tokenGrant[1]), 'the token is not granted');
  assert.ok(!/drop table|truncate|delete from|drop column/i.test(code), 'only adds');
  assert.ok(!/card_number|\bpan\b|cvv|cvc/i.test(code), 'no card data');
});

console.log(`grow tokens: ${n} ok`);
