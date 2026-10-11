// Meta's Deauthorize and Data Deletion callbacks: the signature is verified before anything is read, a forged or
// altered request does nothing, and the confirmation code is stateless and signed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSignedRequest, signRequest, makeDeletionCode, readDeletionCode } from './lib/facebook/signedRequest.ts';
import { deauthorizeFacebookUser, deleteFacebookUserData } from './lib/facebook/userData.ts';

let n = 0;
const ok = (name: string, fn: () => void | Promise<void>) => Promise.resolve(fn()).then(() => { n++; console.log('ok -', name); });
const SECRET = 'test-app-secret-123';

await ok('a correctly signed request yields its user id', () => {
  const s = signRequest({ algorithm: 'HMAC-SHA256', user_id: '1234567890', issued_at: 1700000000 }, SECRET);
  assert.deepEqual(parseSignedRequest(s, SECRET), { algorithm: 'HMAC-SHA256', user_id: '1234567890', issued_at: 1700000000 });
});

await ok('wrong secret, altered payload, missing secret, junk: all refused', () => {
  const s = signRequest({ algorithm: 'HMAC-SHA256', user_id: '1234567890' }, SECRET);
  assert.equal(parseSignedRequest(s, 'other-secret'), null);
  assert.equal(parseSignedRequest(s, undefined), null);
  const [sig, body] = s.split('.');
  const forged = Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: '999' })).toString('base64url');
  assert.equal(parseSignedRequest(`${sig}.${forged}`, SECRET), null, 'the signature does not cover a different payload');
  for (const junk of [null, undefined, 42, '', 'abc', 'a.b.c', `${sig}.`, `.${body}`]) assert.equal(parseSignedRequest(junk, SECRET), null);
});

await ok('only HMAC-SHA256 and a numeric user id are accepted', () => {
  assert.equal(parseSignedRequest(signRequest({ algorithm: 'none', user_id: '1' }, SECRET), SECRET), null);
  assert.equal(parseSignedRequest(signRequest({ algorithm: 'HMAC-SHA256', user_id: 'abc' }, SECRET), SECRET), null);
  assert.equal(parseSignedRequest(signRequest({ algorithm: 'HMAC-SHA256' }, SECRET), SECRET), null);
});

await ok('the deletion code verifies, carries the time, and hides the user id', () => {
  const at = new Date('2026-10-12T10:00:00Z');
  const code = makeDeletionCode('1234567890', SECRET, at);
  const r = readDeletionCode(code, SECRET)!;
  assert.equal(r.at.toISOString(), at.toISOString());
  assert.ok(!code.includes('1234567890'));
  assert.equal(readDeletionCode(code, 'other'), null);
  assert.equal(readDeletionCode(code.slice(0, -1) + (code.endsWith('A') ? 'B' : 'A'), SECRET), null);
  assert.equal(readDeletionCode('garbage', SECRET), null);
  assert.equal(readDeletionCode(code, undefined), null);
});

// a fake query builder: records what was asked, answers with rows or an error
function fakeDb(result: { data?: unknown[]; error?: { code?: string; message: string } }) {
  const calls: { table: string; op: string; payload?: unknown; eq?: [string, string] }[] = [];
  const db = {
    from(table: string) {
      const c: { table: string; op: string; payload?: unknown; eq?: [string, string] } = { table, op: '' };
      calls.push(c);
      const q: any = {
        update(p: unknown) { c.op = 'update'; c.payload = p; return q; },
        delete() { c.op = 'delete'; return q; },
        eq(k: string, v: string) { c.eq = [k, v]; return q; },
        select() { return Promise.resolve({ data: result.data ?? [], error: result.error ?? null }); },
      };
      return q;
    },
  };
  return { db, calls };
}

await ok('deauthorize switches the user\'s connections off and wipes the tokens; deletion removes the rows', async () => {
  const a = fakeDb({ data: [{ id: 1 }, { id: 2 }] });
  const r = await deauthorizeFacebookUser(a.db, '1234567890', 'ENC');
  assert.equal(r.matched, 2);
  assert.deepEqual(a.calls[0].eq, ['fb_user_id', '1234567890']);
  assert.deepEqual(a.calls[0].payload, { is_active: false, page_access_token_encrypted: 'ENC', user_access_token_encrypted: null });
  const d = fakeDb({ data: [{ id: 1 }] });
  assert.equal((await deleteFacebookUserData(d.db, '1234567890')).matched, 1);
  assert.equal(d.calls[0].op, 'delete');
  assert.deepEqual(d.calls[0].eq, ['fb_user_id', '1234567890']);
});

await ok('before the migration the callbacks say so instead of failing', async () => {
  const f = fakeDb({ error: { code: '42703', message: 'column facebook_pages.fb_user_id does not exist' } });
  assert.deepEqual(await deleteFacebookUserData(f.db, '1'), { matched: 0, columnMissing: true });
  assert.deepEqual(await deauthorizeFacebookUser(f.db, '1', 'x'), { matched: 0, columnMissing: true });
  const other = fakeDb({ error: { code: '57014', message: 'timeout' } });
  await assert.rejects(() => deleteFacebookUserData(other.db, '1'));
});

await ok('the routes verify before they act, and the status page is public', () => {
  const rd = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n');
  for (const p of ['app/api/facebook/deauthorize/route.ts', 'app/api/facebook/data-deletion/route.ts']) {
    const src = rd(p);
    assert.ok(src.indexOf('parseSignedRequest(') > -1 && src.indexOf('parseSignedRequest(') < src.indexOf('createClient('), `${p}: verify, then touch the database`);
    assert.match(src, /status: 400/);
  }
  assert.match(rd('app/api/facebook/data-deletion/route.ts'), /confirmation_code/);
  assert.match(rd('lib/supabase/middleware.ts'), /'\/data-deletion'/);
  assert.match(rd('lib/slug.ts'), /'data-deletion'/);
});

await ok('ads_read is requested (and can be switched off), and the callback stores the user token with a fallback', () => {
  const rd = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n');
  assert.match(rd('app/api/facebook/oauth/start/route.ts'), /'ads_read'/);
  assert.match(rd('app/api/facebook/oauth/start/route.ts'), /FACEBOOK_REQUEST_ADS_READ/);
  const cb = rd('app/api/facebook/oauth/callback/route.ts');
  assert.match(cb, /user_access_token_encrypted: encryptedUserToken/);
  assert.match(cb, /upsert\(baseRow/, 'falls back to the old row shape while the migration is not run');
});

console.log(`${n} passed`);
