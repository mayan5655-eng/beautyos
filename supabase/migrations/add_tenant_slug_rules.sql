-- add_tenant_slug_rules.sql
--
-- The rules behind a cosmetician's own URL: bloomos.app/dana-beauty, or
-- bloomos.app/דנה-קוסמטיקס. She claims it herself, so the database has to say
-- what a claimable slug is before the form does.
--
-- ── STATUS: APPLIED to production on 2026-09-03 ────────────────────────────
-- Run by hand in the Supabase SQL Editor.
--
-- Verified by reading the live constraint back, which for this file is the
-- check that matters most: the shape regex contains Hebrew literals, and a
-- paste through a terminal, an editor or a clipboard that mangles them would
-- produce a constraint that silently rejects every Hebrew slug - the exact
-- feature this file exists to allow, failing closed and looking like a bug in
-- the form. pg_get_constraintdef returned it intact:
--
--     slug ~ '^[a-z0-9א-ת]+(-[a-z0-9א-ת]+)*
--
-- Safe to run more than once.
--
-- ── What already exists ────────────────────────────────────────────────────
--
-- public.tenants.slug, a unique btree index `tenants_slug_key`, and
-- get_public_tenant_by_slug (applied 2026-09-01) which resolves it for the
-- public landing page. What has never existed is anything that WRITES a slug:
-- no signup, onboarding, claim or settings path sets one, so the column is
-- empty apart from anything typed in by hand.
--
-- This file is what makes it safe to let her write one.
--
-- ── 1. Case ────────────────────────────────────────────────────────────────
--
-- tenants_slug_key is unique on `slug`, not on `lower(slug)`. To Postgres,
-- 'dana-beauty' and 'Dana-Beauty' are two different values, so two businesses
-- could hold what every human - and every link someone types from memory -
-- would read as the same URL. Worth closing while the column is still empty;
-- afterwards it means telling somebody their live link has to change.
--
-- The pre-check is not decoration. CREATE UNIQUE INDEX validates against every
-- existing row, so one pre-existing case-collision makes it fail, and the fix
-- would be to change a slug someone may already have shared. Exact duplicates
-- are impossible today (tenants_slug_key rules them out); case-variants are
-- exactly what it does NOT rule out, which is the whole reason for this block.
do $$
declare
  collisions int;
begin
  select count(*) into collisions
    from (
      select lower(slug)
        from public.tenants
       where slug is not null
       group by lower(slug)
      having count(*) > 1
    ) c;

  if collisions > 0 then
    raise exception
      'Cannot add tenants_slug_lower_key: % slug(s) differ only by case. '
      'Resolve them first - select id, name, slug from public.tenants '
      'where lower(slug) in (select lower(slug) from public.tenants '
      'where slug is not null group by lower(slug) having count(*) > 1);',
      collisions;
  end if;
end $$;

create unique index if not exists tenants_slug_lower_key
  on public.tenants (lower(slug))
  where slug is not null;

-- tenants_slug_key is deliberately KEPT. A unique lower(slug) already implies a
-- unique slug, so it guarantees nothing new - but dropping a constraint that
-- something outside this repo may name is a bigger risk than one small
-- redundant index, and this codebase has made that trade before: see the note
-- on uniq_appt_slot_active in add_appointment_no_overlap.sql.

-- ── 2. Shape ───────────────────────────────────────────────────────────────
--
-- BOTH ALPHABETS, deliberately. A cosmetician typing her own name in Hebrew and
-- getting a Hebrew URL is the point of the feature, not a compromise in it -
-- bloomos.app/דנה-קוסמטיקס reads to her clients the way her sign reads to the
-- street. Modern browsers and WhatsApp render it as Hebrew; the percent-encoded
-- form only surfaces when something old pastes it raw. No transliteration:
-- machine-Latinised Hebrew produces a name she would not recognise as hers.
--
-- א-ת is U+05D0..U+05EA, which includes the final forms (ך ם ן ף ץ) because
-- they are interleaved in that range rather than appended after it.
--
-- Lowercase only, so the URL has one canonical spelling. Hebrew is caseless, so
-- this constrains the Latin half alone - and together with the index above it
-- means a slug cannot be claimed twice in two spellings OR stored in a spelling
-- that differs from the one she typed.
--
-- No leading, trailing or doubled hyphen: all three produce URLs that look like
-- typing mistakes. 2..40 characters - one character is not a name, and past
-- forty it is not a URL anyone repeats out loud.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tenants_slug_shape'
  ) then
    alter table public.tenants
      add constraint tenants_slug_shape
      check (
        slug is null
        or (
          length(slug) between 2 and 40
          and slug ~ '^[a-z0-9א-ת]+(-[a-z0-9א-ת]+)*$'
        )
      );
    raise notice 'added tenants_slug_shape';
  else
    raise notice 'tenants_slug_shape already exists, skipping';
  end if;
end $$;

-- ── 3. Reserved words ──────────────────────────────────────────────────────
--
-- lib/supabase/middleware.ts treats ANY single top-level segment as a public
-- landing page, and Next resolves a static route ahead of a dynamic [slug]. So
-- a tenant who claims 'login' does not break the login page - she gets a slug
-- that can never resolve to her, and a URL she hands to clients that shows them
-- somebody else's screen. Silent, and only discovered by the person it happens
-- to.
--
-- The first block is every real route segment under app/ as of today. The rest
-- are the names a hosting platform or a browser tends to want later; cheap to
-- reserve now, awkward to reclaim from a live link.
--
-- Enforced HERE and not only in the claim form, because the form is not the
-- only thing that can write this column.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tenants_slug_not_reserved'
  ) then
    alter table public.tenants
      add constraint tenants_slug_not_reserved
      check (
        slug is null
        or slug not in (
          -- live routes
          'api', 'auth', 'book', 'claim', 'community', 'confirm', 'dashboard',
          'form', 'login', 'onboarding', 'privacy', 'reset-password', 'signup',
          'skin-scan', 'terms',
          -- reserved for later
          'admin', 'app', 'assets', 'blog', 'help', 'icons', 'images', 'new',
          'pricing', 'public', 'settings', 'splash', 'static', 'support',
          'www', '_next'
        )
      );
    raise notice 'added tenants_slug_not_reserved';
  else
    raise notice 'tenants_slug_not_reserved already exists, skipping';
  end if;
end $$;

-- ── What this deliberately does NOT do ─────────────────────────────────────
--
-- It assigns nothing. Every existing tenant keeps a null slug and keeps working
-- on /book?t=<uuid>, which is the link they have already shared and which must
-- go on resolving forever. A generated slug would be a URL she never chose
-- appearing on a page her clients read, and that is worse than no URL.
--
-- It does not make slug NOT NULL, for the same reason.
--
-- RLS is untouched: writing a slug is an ordinary authenticated update to her
-- own tenants row, under the policies that already govern it. The public read
-- goes through get_public_tenant_by_slug, which returns id and name only.

-- ── Verify ─────────────────────────────────────────────────────────────────
--
--   a) The index and both constraints exist.
--        select indexname, indexdef from pg_indexes
--         where tablename = 'tenants' and indexdef ilike '%slug%';
--        select conname, pg_get_constraintdef(oid) from pg_constraint
--         where conname in ('tenants_slug_shape', 'tenants_slug_not_reserved');
--
--   b) THE ONE THAT MATTERS. Case-insensitive uniqueness actually bites.
--      The second update must fail with 23505 on tenants_slug_lower_key.
--      Use two real tenant ids of your own.
--        begin;
--          update public.tenants set slug = 'zz-case-test' where id = '<tenant-a>';
--          update public.tenants set slug = 'ZZ-Case-Test' where id = '<tenant-b>';
--        rollback;
--
--   c) Shape. Each of these must fail with 23514; the last must succeed.
--        begin;
--          update public.tenants set slug = 'Dana'        where id = '<tenant-a>'; -- uppercase
--        rollback;
--        begin;
--          update public.tenants set slug = '-dana'       where id = '<tenant-a>'; -- leading hyphen
--        rollback;
--        begin;
--          update public.tenants set slug = 'dana--beauty' where id = '<tenant-a>'; -- doubled hyphen
--        rollback;
--        begin;
--          update public.tenants set slug = 'dana beauty' where id = '<tenant-a>'; -- space
--        rollback;
--        begin;
--          update public.tenants set slug = 'דנה-קוסמטיקס' where id = '<tenant-a>'; -- must SUCCEED
--        rollback;
--
--   d) Reserved. Must fail with 23514.
--        begin;
--          update public.tenants set slug = 'login' where id = '<tenant-a>';
--        rollback;

--
-- tenants_slug_not_reserved landed too, and was subsequently REPLACED by
-- add_reviews.sql, which recreates it with 'review' and 'reviews' added. If you
-- read the live constraint it will be that longer list, not the one below; the
-- list here is correct for a fresh database, where add_reviews.sql will replace
-- it in turn.
--
-- NOT verified behaviourally: (b), (c) and (d) below were not run, so nothing
-- has yet confirmed that a case-variant is refused with 23505 or that a bad
-- shape is refused with 23514. The constraints exist; what they do when
-- provoked is still on the file's word. Worth ten minutes before the first
-- cosmetician claims a URL.
--
-- Safe to run more than once.
--
-- ── What already exists ────────────────────────────────────────────────────
--
-- public.tenants.slug, a unique btree index `tenants_slug_key`, and
-- get_public_tenant_by_slug (applied 2026-09-01) which resolves it for the
-- public landing page. What has never existed is anything that WRITES a slug:
-- no signup, onboarding, claim or settings path sets one, so the column is
-- empty apart from anything typed in by hand.
--
-- This file is what makes it safe to let her write one.
--
-- ── 1. Case ────────────────────────────────────────────────────────────────
--
-- tenants_slug_key is unique on `slug`, not on `lower(slug)`. To Postgres,
-- 'dana-beauty' and 'Dana-Beauty' are two different values, so two businesses
-- could hold what every human - and every link someone types from memory -
-- would read as the same URL. Worth closing while the column is still empty;
-- afterwards it means telling somebody their live link has to change.
--
-- The pre-check is not decoration. CREATE UNIQUE INDEX validates against every
-- existing row, so one pre-existing case-collision makes it fail, and the fix
-- would be to change a slug someone may already have shared. Exact duplicates
-- are impossible today (tenants_slug_key rules them out); case-variants are
-- exactly what it does NOT rule out, which is the whole reason for this block.
do $$
declare
  collisions int;
begin
  select count(*) into collisions
    from (
      select lower(slug)
        from public.tenants
       where slug is not null
       group by lower(slug)
      having count(*) > 1
    ) c;

  if collisions > 0 then
    raise exception
      'Cannot add tenants_slug_lower_key: % slug(s) differ only by case. '
      'Resolve them first - select id, name, slug from public.tenants '
      'where lower(slug) in (select lower(slug) from public.tenants '
      'where slug is not null group by lower(slug) having count(*) > 1);',
      collisions;
  end if;
end $$;

create unique index if not exists tenants_slug_lower_key
  on public.tenants (lower(slug))
  where slug is not null;

-- tenants_slug_key is deliberately KEPT. A unique lower(slug) already implies a
-- unique slug, so it guarantees nothing new - but dropping a constraint that
-- something outside this repo may name is a bigger risk than one small
-- redundant index, and this codebase has made that trade before: see the note
-- on uniq_appt_slot_active in add_appointment_no_overlap.sql.

-- ── 2. Shape ───────────────────────────────────────────────────────────────
--
-- BOTH ALPHABETS, deliberately. A cosmetician typing her own name in Hebrew and
-- getting a Hebrew URL is the point of the feature, not a compromise in it -
-- bloomos.app/דנה-קוסמטיקס reads to her clients the way her sign reads to the
-- street. Modern browsers and WhatsApp render it as Hebrew; the percent-encoded
-- form only surfaces when something old pastes it raw. No transliteration:
-- machine-Latinised Hebrew produces a name she would not recognise as hers.
--
-- א-ת is U+05D0..U+05EA, which includes the final forms (ך ם ן ף ץ) because
-- they are interleaved in that range rather than appended after it.
--
-- Lowercase only, so the URL has one canonical spelling. Hebrew is caseless, so
-- this constrains the Latin half alone - and together with the index above it
-- means a slug cannot be claimed twice in two spellings OR stored in a spelling
-- that differs from the one she typed.
--
-- No leading, trailing or doubled hyphen: all three produce URLs that look like
-- typing mistakes. 2..40 characters - one character is not a name, and past
-- forty it is not a URL anyone repeats out loud.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tenants_slug_shape'
  ) then
    alter table public.tenants
      add constraint tenants_slug_shape
      check (
        slug is null
        or (
          length(slug) between 2 and 40
          and slug ~ '^[a-z0-9א-ת]+(-[a-z0-9א-ת]+)*$'
        )
      );
    raise notice 'added tenants_slug_shape';
  else
    raise notice 'tenants_slug_shape already exists, skipping';
  end if;
end $$;

-- ── 3. Reserved words ──────────────────────────────────────────────────────
--
-- lib/supabase/middleware.ts treats ANY single top-level segment as a public
-- landing page, and Next resolves a static route ahead of a dynamic [slug]. So
-- a tenant who claims 'login' does not break the login page - she gets a slug
-- that can never resolve to her, and a URL she hands to clients that shows them
-- somebody else's screen. Silent, and only discovered by the person it happens
-- to.
--
-- The first block is every real route segment under app/ as of today. The rest
-- are the names a hosting platform or a browser tends to want later; cheap to
-- reserve now, awkward to reclaim from a live link.
--
-- Enforced HERE and not only in the claim form, because the form is not the
-- only thing that can write this column.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tenants_slug_not_reserved'
  ) then
    alter table public.tenants
      add constraint tenants_slug_not_reserved
      check (
        slug is null
        or slug not in (
          -- live routes
          'api', 'auth', 'book', 'claim', 'community', 'confirm', 'dashboard',
          'form', 'login', 'onboarding', 'privacy', 'reset-password', 'signup',
          'skin-scan', 'terms',
          -- reserved for later
          'admin', 'app', 'assets', 'blog', 'help', 'icons', 'images', 'new',
          'pricing', 'public', 'settings', 'splash', 'static', 'support',
          'www', '_next'
        )
      );
    raise notice 'added tenants_slug_not_reserved';
  else
    raise notice 'tenants_slug_not_reserved already exists, skipping';
  end if;
end $$;

-- ── What this deliberately does NOT do ─────────────────────────────────────
--
-- It assigns nothing. Every existing tenant keeps a null slug and keeps working
-- on /book?t=<uuid>, which is the link they have already shared and which must
-- go on resolving forever. A generated slug would be a URL she never chose
-- appearing on a page her clients read, and that is worse than no URL.
--
-- It does not make slug NOT NULL, for the same reason.
--
-- RLS is untouched: writing a slug is an ordinary authenticated update to her
-- own tenants row, under the policies that already govern it. The public read
-- goes through get_public_tenant_by_slug, which returns id and name only.

-- ── Verify ─────────────────────────────────────────────────────────────────
--
--   a) The index and both constraints exist.
--        select indexname, indexdef from pg_indexes
--         where tablename = 'tenants' and indexdef ilike '%slug%';
--        select conname, pg_get_constraintdef(oid) from pg_constraint
--         where conname in ('tenants_slug_shape', 'tenants_slug_not_reserved');
--
--   b) THE ONE THAT MATTERS. Case-insensitive uniqueness actually bites.
--      The second update must fail with 23505 on tenants_slug_lower_key.
--      Use two real tenant ids of your own.
--        begin;
--          update public.tenants set slug = 'zz-case-test' where id = '<tenant-a>';
--          update public.tenants set slug = 'ZZ-Case-Test' where id = '<tenant-b>';
--        rollback;
--
--   c) Shape. Each of these must fail with 23514; the last must succeed.
--        begin;
--          update public.tenants set slug = 'Dana'        where id = '<tenant-a>'; -- uppercase
--        rollback;
--        begin;
--          update public.tenants set slug = '-dana'       where id = '<tenant-a>'; -- leading hyphen
--        rollback;
--        begin;
--          update public.tenants set slug = 'dana--beauty' where id = '<tenant-a>'; -- doubled hyphen
--        rollback;
--        begin;
--          update public.tenants set slug = 'dana beauty' where id = '<tenant-a>'; -- space
--        rollback;
--        begin;
--          update public.tenants set slug = 'דנה-קוסמטיקס' where id = '<tenant-a>'; -- must SUCCEED
--        rollback;
--
--   d) Reserved. Must fail with 23514.
--        begin;
--          update public.tenants set slug = 'login' where id = '<tenant-a>';
--        rollback;
