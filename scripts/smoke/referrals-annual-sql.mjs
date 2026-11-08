// scripts/smoke/referrals-annual-sql.mjs
//
// Dry-runs supabase/migrations/add_referrals_annual_2026-11-08.sql in a throwaway in-process Postgres (PGlite), on top of the real
// add_kalmea_billing.sql, add_kalmea_billing_grow.sql and add_billing_addons.sql, with stand-ins for what Supabase has (auth.users,
// the browser roles, get_user_tenant_id, tenants, owner_phones). Nothing here touches Supabase.
//
// Checks: the migration runs twice; existing subscriptions read monthly; the signup trigger attributes a new tenant from her signup
// code, marks the same owner / email / phone 'ineligible', ignores a bad or unknown code, and NEVER blocks the insert even when it
// fails inside; one reward per side per referral; one used month per subscription and period; one success per annual period.
//
// PGlite is not a dependency of the app. Install it somewhere outside the repo and point at it:
//   npm i --prefix <scratch dir> @electric-sql/pglite@0.2.17
//   PGLITE_DIR=<scratch dir>/node_modules/@electric-sql/pglite node scripts/smoke/referrals-annual-sql.mjs
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const dir = process.env.PGLITE_DIR;
if (!dir) { console.error('Set PGLITE_DIR to an installed @electric-sql/pglite (see the header).'); process.exit(2); }
const { PGlite } = await import(pathToFileURL(join(dir, 'dist', 'index.js')).href);

const db = new PGlite();
const mig = (f) => readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), 'utf8');
let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log('ok -', name); };
const one = async (q, p) => (await db.query(q, p)).rows[0];
const rejects = async (q, p, re) => { let err = null; try { await db.query(q, p); } catch (e) { err = e; } assert.ok(err && re.test(String(err.message)), `expected ${re}, got ${err?.message}`); };

await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
  create table public.tenants (id uuid primary key default gen_random_uuid(), name text, owner_id uuid, plan_status text default 'trial');
  create table public.owner_phones (phone_e164 text primary key, user_id uuid unique, tenant_id uuid);
  create function public.get_user_tenant_id() returns uuid language sql stable as $$ select null::uuid $$;
`);
await db.exec(mig('add_kalmea_billing.sql'));
await db.exec(mig('add_kalmea_billing_grow.sql'));
await db.exec(mig('add_billing_addons.sql'));

// One business with a subscription and a payment BEFORE the migration.
const A_USER = 'aaaaaaaa-0000-4000-8000-000000000001';
await db.query(`insert into auth.users values ($1, 'Noa.Cohen+work@gmail.com', '{}')`, [A_USER]);
const A = (await one(`insert into public.tenants (name, owner_id) values ('סטודיו נועה', $1) returning id`, [A_USER])).id;
const SUB = (await one(`insert into public.billing_subscriptions (tenant_id, price, status) values ($1, 349, 'active') returning id`, [A])).id;

await ok('the migration runs, and runs again', async () => {
  await db.exec(mig('add_referrals_annual_2026-11-08.sql'));
  await db.exec(mig('add_referrals_annual_2026-11-08.sql'));
});

await ok('an existing subscription reads monthly, with nothing pending', async () => {
  const r = await one(`select billing_period, pending_period from public.billing_subscriptions where id = $1`, [SUB]);
  assert.deepEqual(r, { billing_period: 'monthly', pending_period: null });
  await rejects(`update public.billing_subscriptions set billing_period = 'weekly' where id = $1`, [SUB], /check/);
});

// The signup stand-in: auth.users then the tenant, the way handle_new_user does it.
let seq = 1;
const signup = async (email, meta = {}) => {
  const uid = `bbbbbbbb-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
  await db.query(`insert into auth.users values ($1, $2, $3)`, [uid, email, JSON.stringify(meta)]);
  return (await one(`insert into public.tenants (name, owner_id) values ('עסק חדש', $1) returning id`, [uid])).id;
};
const refOf = async (t) => one(`select referrer_tenant_id, status, ineligible_reason from public.referrals where referred_tenant_id = $1`, [t]);

const CODE = 'K7MQ2XRT9P';
await db.query(`insert into public.referral_codes (tenant_id, code) values ($1, $2)`, [A, CODE]);
await db.query(`insert into public.owner_phones values ('972501234567', $1, $2)`, [A_USER, A]);

await ok('the code check refuses a guessable shape', async () => {
  await rejects(`insert into public.referral_codes (tenant_id, code) values ($1, 'abc')`, [A], /check|duplicate/);
});

let B;
await ok('a new business that signed up with the code is attributed at the insert', async () => {
  B = await signup('dana@example.com', { kl_ref: CODE.toLowerCase() });
  assert.deepEqual(await refOf(B), { referrer_tenant_id: A, status: 'joined', ineligible_reason: null });
});

await ok('the same person (email with +tag and dots, or the same mobile) is ineligible', async () => {
  const t1 = await signup('noacohen@gmail.com', { kl_ref: CODE });
  assert.equal((await refOf(t1)).ineligible_reason, 'same_email');
  const t2 = await signup('other@example.com', { kl_ref: CODE, phone_e164: '972501234567' });
  assert.equal((await refOf(t2)).ineligible_reason, 'same_phone');
});

await ok('no code, a malformed code or an unknown code: no referral, and the signup goes on', async () => {
  for (const meta of [{}, { kl_ref: 'DROP TABLE' }, { kl_ref: 'ZZZZZZZZZZ' }]) {
    const t = await signup(`x${seq}@example.com`, meta);
    assert.equal(await refOf(t), undefined);
  }
});

await ok('a failure inside the trigger never blocks the signup', async () => {
  await db.exec(`alter table public.referrals rename to referrals_away`);
  const t = await signup('y@example.com', { kl_ref: CODE });
  assert.ok(t, 'tenant inserted');
  await db.exec(`alter table public.referrals_away rename to referrals`);
});

await ok('changing her metadata later attributes nothing (the trigger ran once, at the insert)', async () => {
  const t = await signup('late@example.com', {});
  await db.query(`update auth.users set raw_user_meta_data = $1 where email = 'late@example.com'`, [JSON.stringify({ kl_ref: CODE })]);
  assert.equal(await refOf(t), undefined);
  await rejects(`insert into public.referrals (referrer_tenant_id, referred_tenant_id, code) values ($1, $1, 'X')`, [A], /referrals_not_self|check/);
  await rejects(`insert into public.referrals (referrer_tenant_id, referred_tenant_id, code) values ($1, $2, $3)`, [A, B, CODE], /duplicate|unique/);
});

await ok('one reward per side per referral, ever; one used month per subscription and period', async () => {
  const ref = (await one(`select id from public.referrals where referred_tenant_id = $1`, [B])).id;
  const ins = `insert into public.referral_rewards (referral_id, tenant_id, role, available_at) values ($1, $2, $3, now())`;
  await db.query(ins, [ref, B, 'referred']);
  await db.query(ins, [ref, A, 'referrer']);
  await rejects(ins, [ref, A, 'referrer'], /duplicate|unique/);
  const r1 = (await one(`select id from public.referral_rewards where role = 'referrer'`)).id;
  const r2 = (await one(`select id from public.referral_rewards where role = 'referred'`)).id;
  await db.query(`update public.referral_rewards set consumed_at = now(), consumed_subscription_id = $2, consumed_period_start = '2027-01-01' where id = $1`, [r1, SUB]);
  await rejects(`update public.referral_rewards set consumed_at = now(), consumed_subscription_id = $2, consumed_period_start = '2027-01-01' where id = $1`, [r2, SUB], /duplicate|unique/);
  await rejects(`update public.referral_rewards set consumed_at = now() where id = $1`, [r2], /consumed_shape|check/);
});

await ok('one successful charge per annual period (the existing index), and period_months is 1 or 12', async () => {
  const pay = `insert into public.billing_payments (tenant_id, subscription_id, kind, status, amount, period_start, period_end, period_months) values ($1, $2, 'subscription', 'succeeded', 3490, '2027-02-01', '2028-02-01', 12)`;
  await db.query(pay, [A, SUB]);
  await rejects(pay, [A, SUB], /duplicate|unique/);
  await rejects(`insert into public.billing_payments (tenant_id, subscription_id, kind, status, amount, period_months) values ($1, $2, 'subscription', 'failed', 10, 6)`, [A, SUB], /check/);
});

await ok('the browser roles cannot write the referral tables or read referrals', async () => {
  const r = await one(`select has_table_privilege('authenticated', 'public.referrals', 'select') a, has_table_privilege('authenticated', 'public.referral_rewards', 'insert') b,
    has_table_privilege('authenticated', 'public.referral_codes', 'insert') c, has_table_privilege('anon', 'public.referral_codes', 'select') d`);
  assert.deepEqual(r, { a: false, b: false, c: false, d: false });
});

console.log(`referrals-annual-sql: ${n} ok`);
