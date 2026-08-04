-- admin-access.sql
-- READ-ONLY. Confirms YOU can actually get into the Phase 4 admin panel.
--
-- WHY THIS MATTERS: the panel returns a plain 404 to anyone who is not in
-- public.platform_admins, including you. That is deliberate (a tenant must not
-- learn the panel exists), but it means a missed allowlist row looks exactly
-- like "the page does not exist" rather than "you are not allowed in".
--
-- trial-state.sql populated the allowlist by matching on email:
--     insert into public.platform_admins (user_id)
--     select id from auth.users where email = 'mayan5655@gmail.com'
-- If that email did not match a row exactly (different casing, a different
-- address on the account), the insert quietly added nobody and the panel will
-- 404 for you too.


-- ── A. Are you on the allowlist? ─────────────────────────────────────────
-- EXPECT exactly one row, showing your email.
-- ZERO ROWS means nobody can open the panel. Fix with block C.
select pa.user_id,
       u.email,
       pa.added_at
  from public.platform_admins pa
  join auth.users u on u.id = pa.user_id
 order by pa.added_at;


-- ── B. Is the allowlist still locked down? ───────────────────────────────
-- platform_admins must have RLS ENABLED and ZERO policies. That combination is
-- a deny-all for anon and authenticated, so only the service-role key can read
-- it and no tenant can add herself.
--
-- EXPECT rls_enabled = true AND policy_count = 0.
-- A policy_count above 0 means someone opened it up: investigate before using
-- the panel.
select c.relrowsecurity as rls_enabled,
       (select count(*) from pg_policies
         where schemaname = 'public' and tablename = 'platform_admins') as policy_count
  from pg_class c
 where c.oid = 'public.platform_admins'::regclass;


-- ── C. ONLY IF BLOCK A RETURNED ZERO ROWS ────────────────────────────────
-- This is the one WRITE in this file. It is commented out on purpose.
-- Replace the address with the email on your auth account (check block D
-- first), uncomment, and run.
--
-- insert into public.platform_admins (user_id)
-- select id from auth.users where lower(email) = lower('mayan5655@gmail.com')
-- on conflict (user_id) do nothing;
--
-- Then re-run block A. It must now return your row.


-- ── D. What email is actually on your account? ───────────────────────────
-- Useful when block A is empty and you need to know why. Shows the accounts
-- that have a tenant, so you can spot the right one.
select u.id as user_id,
       u.email,
       t.name as business_name
  from auth.users u
  join public.tenant_members tm on tm.user_id = u.id
  join public.tenants t         on t.id = tm.tenant_id
 order by u.email;
