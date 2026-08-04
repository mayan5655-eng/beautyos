-- audit.sql
-- READ-ONLY audit of public.tenant_members. Nothing here writes, creates,
-- drops or grants anything. Safe to run on production as-is.
--
-- WHY THIS TABLE MATTERS MORE THAN ANY OTHER
-- public.get_user_tenant_id() resolves the caller's tenant by looking them up
-- in tenant_members. Every RLS policy in the database keys on that function,
-- including all 60 trial-gate policies from gate.sql. So whoever controls a row
-- in tenant_members controls which tenant they *are*.
--
-- If `authenticated` can INSERT here freely, any logged in user could add
--     (her own user_id, someone else's tenant_id)
-- and from that moment get_user_tenant_id() may return the OTHER business's id.
-- That is full cross-tenant read and write, and it walks straight through the
-- trial gate too, because is_tenant_active() would then be evaluating the other
-- tenant's plan. This is strictly more serious than the billing gate itself.
--
-- IMPORTANT: the Supabase SQL editor shows only the LAST statement's result set,
-- so running this whole file at once would show you query 3 alone. Run each
-- block SEPARATELY, one at a time, and paste all three outputs back.
--
-- Read query 2 FIRST. It is the one that decides whether there is a problem.


-- ── 1. What policies exist, and what do they actually allow? ───────────────
-- Read `cmd` (which operation), `roles` (who it applies to), and especially
-- `with_check` for the INSERT row: that expression is what constrains which
-- rows may be inserted. A with_check of `true`, or NULL on a permissive INSERT
-- policy for `authenticated`, means no constraint at all.
--
-- What GOOD looks like: either no INSERT policy for `authenticated`, or one
-- whose with_check ties tenant_id to something the caller cannot forge.
select policyname,
       permissive,
       roles,
       cmd,
       qual,
       with_check
  from pg_policies
 where schemaname = 'public'
   and tablename = 'tenant_members'
 order by cmd, policyname;


-- ── 2. THE ONE THAT MATTERS. Does `authenticated` hold INSERT? ────────────
-- Table-level grants are checked BEFORE row-level policies, so a missing grant
-- closes the hole outright regardless of what query 1 shows.
--
-- What GOOD looks like: INSERT = false (and ideally UPDATE = false,
-- DELETE = false). SELECT = true is expected and fine.
--
-- If INSERT = true, do NOT change anything yet: run query 3 first, because
-- signup may depend on that grant. Revoking it blind could break new signups.
select p as privilege,
       has_table_privilege('authenticated', 'public.tenant_members', p) as granted
  from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p;


-- ── 3. Which functions touch this table, and are they SECURITY DEFINER? ───
-- A SECURITY DEFINER function runs as its OWNER, not as the caller, so it can
-- insert into tenant_members even when `authenticated` has no INSERT grant.
--
-- This is the question that decides whether query 2's hole is safe to close:
--   * If a SECURITY DEFINER function (or an auth.users trigger) already creates
--     the membership row at signup, then the direct INSERT grant is dead weight
--     and revoking it is a narrow, safe fix that signup will not notice.
--   * If NOTHING here creates the row, signup depends on the browser inserting
--     it directly, and revoking the grant WOULD break new signups. In that case
--     the fix is to move the insert into a SECURITY DEFINER function first, and
--     only then revoke. Bigger job, and not something to do in a hurry.
select p.proname            as function_name,
       p.prosecdef          as is_security_definer,
       pg_get_userbyid(p.proowner) as owner
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and pg_get_functiondef(p.oid) ilike '%tenant_members%'
 order by p.proname;


-- ── OPTIONAL context: who currently belongs to which tenant ───────────────
-- Your own join query from earlier. Not part of the security question (it shows
-- the current state, not who *could* change it), but useful for spotting a row
-- that should not be there. Also read-only. Must be run in the Supabase SQL
-- editor rather than from the app, since it reads auth.users.
select tm.tenant_id,
       t.name  as business_name,
       u.email
  from public.tenant_members tm
  join public.tenants t on t.id = tm.tenant_id
  join auth.users     u on u.id = tm.user_id
 order by t.name;


-- ===========================================================================
-- ROUND 2. Follow-ups from the first three results.
-- ===========================================================================
-- Round 1 showed: authenticated holds all four grants, BUT every policy is
-- predicated (is_tenant_owner for write, is_tenant_member for read). So the
-- naive cross-tenant insert is refused by the policy, not by the grant.
--
-- That conclusion depends on two things round 1 did not check. Both are
-- read-only. Run each block separately.


-- ── 4. IS RLS ACTUALLY ENABLED? Run this one first. ──────────────────────
-- pg_policies lists policies whether or not RLS is turned on. If RLS is off,
-- all four policies are DEAD and the open grants are the whole story, which
-- means the cross-tenant hole is real and wide.
--
-- EXPECT rls_enabled = true.
-- If it comes back false, stop and tell me before doing anything else.
-- (rls_forced only matters for the table owner, not for authenticated, so
--  false there is normal and fine.)
select relname            as table_name,
       relrowsecurity     as rls_enabled,
       relforcerowsecurity as rls_forced
  from pg_class
 where oid = 'public.tenant_members'::regclass;


-- ── 5. What do the gatekeeper functions actually DO? ─────────────────────
-- The whole "we are safe" conclusion rests on is_tenant_owner() meaning what
-- its name says. Also worth reading get_user_tenant_id(), specifically how it
-- picks when a user has MORE THAN ONE membership row (see note 6 below).
--
-- What GOOD looks like for is_tenant_owner: it checks tenant_members for the
-- CURRENT user (auth.uid()) having an owner role on the tenant_id passed in.
-- Anything that can return true without consulting auth.uid() is a problem.
select p.proname as function_name,
       pg_get_functiondef(p.oid) as definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('is_tenant_owner', 'is_tenant_member', 'get_user_tenant_id',
                     'handle_new_user')
 order by p.proname;


-- ── 6. Does handle_new_user actually run at signup? ──────────────────────
-- Confirms the trigger exists on auth.users, is ENABLED, and calls
-- handle_new_user. This is what proves the membership row is created
-- server-side rather than by the browser.
--
-- EXPECT one row with tgenabled = 'O' (enabled, origin) whose definition
-- names handle_new_user. Zero rows means signup creates that row some other
-- way and we need to find out how.
select tgname             as trigger_name,
       tgrelid::regclass  as on_table,
       tgenabled          as enabled_flag,
       pg_get_triggerdef(oid) as definition
  from pg_trigger
 where not tgisinternal
   and tgrelid = 'auth.users'::regclass;
