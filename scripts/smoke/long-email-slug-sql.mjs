// scripts/smoke/long-email-slug-sql.mjs
//
// Dry-runs supabase/migrations/fix_signup_long_email_slug_2026-10-25.sql in a throwaway in-process Postgres (PGlite).
// public.tenants gets the live slug rules (add_tenant_slug_rules.sql) and a stand-in for the sign-up trigger that builds the
// address the way production does: <letters and digits before the @>-<first 8 of the user id>. Nothing here touches Supabase.
//
// PGlite is not a dependency of the app. Install it somewhere outside the repo and point at it:
//   npm i --prefix <scratch dir> @electric-sql/pglite@0.2.17
//   PGLITE_DIR=<scratch dir>/node_modules/@electric-sql/pglite node scripts/smoke/long-email-slug-sql.mjs

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const dir = process.env.PGLITE_DIR;
if (!dir) { console.error('Set PGLITE_DIR to an installed @electric-sql/pglite (see the header).'); process.exit(2); }
const { PGlite } = await import(pathToFileURL(join(dir, 'dist', 'index.js')).href);

const db = new PGlite();
const sql = readFileSync(new URL('../../supabase/migrations/fix_signup_long_email_slug_2026-10-25.sql', import.meta.url), 'utf8');
let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log('ok -', name); };
const one = async (q, p) => (await db.query(q, p)).rows[0];

await db.exec(`
  create table public.tenants (
    id uuid primary key default gen_random_uuid(),
    name text, owner_id uuid,
    slug text unique,
    constraint tenants_slug_shape check (slug is null or (length(slug) between 2 and 40 and slug ~ '^[a-z0-9א-ת]+(-[a-z0-9א-ת]+)*$')),
    constraint tenants_slug_not_reserved check (slug is null or slug not in ('login', 'signup', 'dashboard'))
  );
  create unique index tenants_slug_lower_key on public.tenants (lower(slug)) where slug is not null;
  -- the sign-up trigger's address, as measured on production
  create function auto_slug(email text, uid uuid) returns text language sql as $$
    select regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9]', '', 'g') || '-' || left(uid::text, 8) $$;
`);

const signup = async (email) => {
  const uid = (await one('select gen_random_uuid() as u')).u;
  return (await one(`insert into public.tenants (name, owner_id, slug) values ($1, $2, auto_slug($1, $2)) returning slug`, [email, uid])).slug;
};
const local = (alnum) => 'k'.repeat(alnum);

await ok('before the fix: 31 letters before the @ signs up, 32 is refused (the production bug)', async () => {
  assert.equal((await signup(`${local(31)}@gmail.com`)).length, 40);
  await assert.rejects(signup(`${local(32)}@gmail.com`), /tenants_slug_shape/);
});

await db.exec(sql);
await db.exec(sql); // safe to run twice

await ok('after the fix: long emails sign up, slug fits and keeps the user-id code', async () => {
  for (const L of [32, 40, 64]) {
    const uid = (await one('select gen_random_uuid() as u')).u;
    const email = `${'a'.repeat(L)}@gmail.com`;
    const { slug } = await one(`insert into public.tenants (owner_id, slug) values ($1, auto_slug($2, $1)) returning slug`, [uid, email]);
    assert.ok(slug.length <= 40, slug);
    assert.ok(slug.endsWith('-' + uid.slice(0, 8)), slug);
  }
});

await ok('a slug that already fits is not changed', async () => {
  assert.equal((await one(`insert into public.tenants (slug) values ('dana-beauty') returning slug`)).slug, 'dana-beauty');
  assert.equal((await one(`insert into public.tenants (slug) values ('דנה-קוסמטיקס') returning slug`)).slug, 'דנה-קוסמטיקס');
  assert.equal((await one(`insert into public.tenants (slug) values (null) returning slug`)).slug, null);
});

await ok('an email with no letters before the @ gets a beauty- code instead of a broken address', async () => {
  const { slug } = await one(`insert into public.tenants (owner_id, slug) values (gen_random_uuid(), '-') returning slug`);
  assert.match(slug, /^beauty-[0-9a-f]{8}$/);
  assert.match((await one(`insert into public.tenants (slug) values ('-1a2b3c4d') returning slug`)).slug, /^1a2b3c4d$/);
});

await ok('bad characters, case and doubled hyphens are cleaned on insert', async () => {
  assert.equal((await one(`insert into public.tenants (slug) values ('--Noa..Nails--') returning slug`)).slug, 'noa-nails');
  // cleaning never bypasses uniqueness: dana-beauty is taken above
  await assert.rejects(db.query(`insert into public.tenants (slug) values ('Dana..Beauty')`), /duplicate key/);
});

await ok('an address she types herself (UPDATE) still gets the real refusal', async () => {
  const { id } = await one(`insert into public.tenants (slug) values ('my-page') returning id`);
  await assert.rejects(db.query(`update public.tenants set slug = $1 where id = $2`, ['x'.repeat(41), id]), /tenants_slug_shape/);
  await assert.rejects(db.query(`update public.tenants set slug = 'Dana' where id = $1`, [id]), /tenants_slug_shape/);
  await assert.rejects(db.query(`update public.tenants set slug = 'login' where id = $1`, [id]), /tenants_slug_not_reserved/);
});

console.log(`\n${n} checks passed`);
