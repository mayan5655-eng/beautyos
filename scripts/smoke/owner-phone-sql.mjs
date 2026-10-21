// scripts/smoke/owner-phone-sql.mjs
//
// Dry-runs supabase/migrations/add_owner_phone_verification.sql in a throwaway in-process Postgres (PGlite) and checks
// the uniqueness rule where it actually lives: in the database. Nothing here touches Supabase.
//
// PGlite is not a dependency of the app. Install it somewhere outside the repo and point at it:
//   npm i --prefix <scratch dir> @electric-sql/pglite@0.2.17
//   PGLITE_DIR=<scratch dir>/node_modules/@electric-sql/pglite node scripts/smoke/owner-phone-sql.mjs
//
// Supabase's own pieces the migration leans on (auth.users, auth.uid(), the anon/authenticated/service_role roles,
// public.tenants) are stubbed with the same names and shapes.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const dir = process.env.PGLITE_DIR;
if (!dir) { console.error('Set PGLITE_DIR to an installed @electric-sql/pglite (see the header).'); process.exit(2); }
const { PGlite } = await import(pathToFileURL(join(dir, 'dist', 'index.js')).href);

const db = new PGlite();
const sql = readFileSync(new URL('../../supabase/migrations/add_owner_phone_verification.sql', import.meta.url), 'utf8');
let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log('ok -', name); };
const one = async (q, p) => (await db.query(q, p)).rows[0];

await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table auth.users (id uuid primary key, created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table public.tenants (id uuid primary key);
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`);

const U1 = '11111111-1111-1111-1111-111111111111';
const U2 = '22222222-2222-2222-2222-222222222222';
const U3 = '33333333-3333-3333-3333-333333333333';
const T1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
await db.exec(`insert into auth.users (id) values ('${U1}'), ('${U2}'), ('${U3}'); insert into public.tenants (id) values ('${T1}');`);

await ok('the migration applies on an empty database', () => db.exec(sql));
await ok('and again: every statement is guarded', () => db.exec(sql));
// Supabase grants table rights to these roles by default; the migration must REVOKE them, so grant first like Supabase does.
await db.exec(`grant all on all tables in schema public to anon, authenticated, service_role; grant all on all functions in schema public to service_role;`);
await db.exec(sql);

await ok('the switches start OFF', async () => {
  const r = await one('select phone_verify_signup, phone_verify_existing, phone_verify_since from public.platform_settings');
  assert.deepEqual(r, { phone_verify_signup: false, phone_verify_existing: false, phone_verify_since: null });
});

const claim = async (phone, user, src = 'signup') =>
  (await one('select public.claim_owner_phone($1, $2, $3, $4) as r', [phone, user, T1, src])).r;

await ok('first claim of a number: claimed', async () => assert.equal(await claim('972521234567', U1), 'claimed'));
await ok('same account, same number again: already_yours (a retry is not an error)', async () => assert.equal(await claim('972521234567', U1), 'already_yours'));
await ok('ANOTHER account, same number: taken', async () => assert.equal(await claim('972521234567', U2), 'taken'));
await ok('an account with a number cannot take a second one: has_other', async () => assert.equal(await claim('972549999999', U1), 'has_other'));
await ok('the refused account can still claim a free number', async () => assert.equal(await claim('972549999999', U2, 'login_prompt'), 'claimed'));

await ok('the rule is the table itself: a direct insert of a taken number fails with unique_violation', async () => {
  await assert.rejects(db.query(`insert into public.owner_phones (phone_e164, user_id) values ('972521234567', '${U3}')`), /duplicate key|unique/i);
});

await ok('only the normalized shape is stored: 052-..., +972..., landlines are refused by CHECK', async () => {
  for (const bad of ['0521234567', '+972521234567', '97231234567', '9725212345678', '97252123456']) {
    await assert.rejects(db.query(`insert into public.owner_phones (phone_e164, user_id) values ($1, null)`, [bad]), /check|owner_phones_shape/i, bad);
  }
  await assert.rejects(db.query('select public.claim_owner_phone($1, $2, null, null)', ['0521234567', U3]), /bad phone shape/);
});

await ok('deleting an account keeps the number held (no fresh trial by deleting and re-signing)', async () => {
  await db.exec(`delete from auth.users where id = '${U1}'`);
  const r = await one(`select user_id from public.owner_phones where phone_e164 = '972521234567'`);
  assert.equal(r.user_id, null);
  assert.equal(await claim('972521234567', U3), 'taken');
});

await ok('bump_phone_otp_attempt counts atomically and stops on a used or expired code', async () => {
  const { id } = await one(`insert into public.phone_otp (phone_e164, purpose, code_hash, expires_at) values ('972521111111', 'signup', 'h', now() + interval '10 minutes') returning id`);
  const vals = [];
  for (let i = 0; i < 3; i++) vals.push((await one('select public.bump_phone_otp_attempt($1) as a', [id])).a);
  assert.deepEqual(vals, [1, 2, 3]);
  await db.query('update public.phone_otp set consumed_at = now() where id = $1', [id]);
  assert.equal((await one('select public.bump_phone_otp_attempt($1) as a', [id])).a, null);
  const { id: old } = await one(`insert into public.phone_otp (phone_e164, purpose, code_hash, expires_at) values ('972521111111', 'signup', 'h', now() - interval '1 minute') returning id`);
  assert.equal((await one('select public.bump_phone_otp_attempt($1) as a', [old])).a, null);
});

await ok('the browser roles cannot write a number, read codes, or call the functions', async () => {
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${U2}';`);
  try {
    await assert.rejects(db.query(`insert into public.owner_phones (phone_e164, user_id) values ('972527777777', '${U2}')`), /permission denied/);
    await assert.rejects(db.query('select * from public.phone_otp'), /permission denied/);
    await assert.rejects(db.query(`select public.claim_owner_phone('972527777777', '${U2}', null, null)`), /permission denied/);
    await assert.rejects(db.query(`select public.bump_phone_otp_attempt('${U2}')`), /permission denied/);
    // Reading: only her own row.
    const rows = (await db.query('select phone_e164 from public.owner_phones')).rows;
    assert.deepEqual(rows.map((r) => r.phone_e164), ['972549999999']);
  } finally {
    await db.exec('reset role;');
  }
  await db.exec('set role anon;');
  try {
    await assert.rejects(db.query('select * from public.owner_phones'), /permission denied/);
  } finally {
    await db.exec('reset role;');
  }
});

console.log(`\n${n} passed, 0 failed`);
